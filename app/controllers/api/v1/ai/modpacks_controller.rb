# frozen_string_literal: true

module Api
  module V1
    module AI
      # Handles AI-powered modpack generation and adjustment endpoints.
      #
      # Endpoints:
      #   POST  /api/v1/ai/generate              — generate a new modpack from a description
      #   PATCH /api/v1/ai/modpacks/:id/adjust   — adjust an existing generated modpack
      #
      # Both endpoints require authentication.
      #
      # Requirements: 11.7, 11.9, 11.10, 12.6
      class ModpacksController < BaseController
        # Both endpoints require authentication — override the no-op in BaseController.
        before_action :enforce_authentication!

        # ── AI-specific rescue_from handlers ──────────────────────────────────
        # These complement the global handlers in ApplicationController.

        # HTTP 422 — AI could not find enough mods; includes alternative suggestions.
        # Requirement 11.7
        rescue_from "AIService::InsufficientModsError" do |e|
          render_error(
            errors: build_insufficient_mods_errors(e),
            status: :unprocessable_entity
          )
        end

        # HTTP 422 — irresolvable mod compatibility conflicts; lists conflicting mods.
        # Requirement 11.3
        rescue_from "AIService::CompatibilityError" do |e|
          render_error(
            errors: build_compatibility_errors(e),
            status: :unprocessable_entity
          )
        end

        # HTTP 422 — generated manifest failed validation.
        # Requirement 11.10
        rescue_from "ManifestService::ParseError" do |e|
          render_error(
            errors: [
              {
                field:   e.field.to_s,
                message: "Manifesto gerado inválido: #{e.reason}",
                code:    "manifest_validation_failed"
              }
            ],
            status: :unprocessable_entity
          )
        end

        # ── POST /api/v1/ai/generate ──────────────────────────────────────────
        #
        # Body params:
        #   description       [String]  natural-language description (≤ 500 chars)
        #   minecraft_version [String]  e.g. "1.20.1"
        #   loader            [String]  "forge" | "fabric" | "quilt" | "neoforge"
        #
        # Returns the GenerationResult as JSON, persisting a GeneratedModpack record.
        # Requirements: 11.1, 11.7, 11.9, 11.10, 12.6
        def generate
          description       = generate_params[:description].to_s.strip
          minecraft_version = generate_params[:minecraft_version].to_s.strip
          loader            = generate_params[:loader].to_s.strip

          # Validate required params before calling the service.
          validation_errors = validate_generate_params(description, minecraft_version, loader)
          return render_error(errors: validation_errors, status: :unprocessable_entity) if validation_errors.any?

          generator = AIService::ModpackGenerator.new
          result    = generator.generate(
            description:       description,
            minecraft_version: minecraft_version,
            loader:            loader.to_sym
          )

          # Validate the generated manifest via ManifestService::Parser (Req 11.10, 12.6).
          validate_manifest!(result.modpack)

          # Persist the result to GeneratedModpack and GeneratedMod records.
          modpack_record = persist_generation_result(result, description, minecraft_version, loader)

          render_success(
            data:   serialize_generation_result(result, modpack_record),
            status: :created
          )
        end

        # ── PATCH /api/v1/ai/modpacks/:id/adjust ─────────────────────────────
        #
        # Body params:
        #   instruction [String] natural-language adjustment instruction
        #
        # Loads the GeneratedModpack from DB, calls AIService::ModpackGenerator#adjust,
        # validates the updated manifest, persists and returns the updated result.
        # Requirements: 11.6, 11.9, 11.10, 12.6
        def adjust
          instruction = adjust_params[:instruction].to_s.strip

          if instruction.empty?
            return render_error(
              errors: [{ field: "instruction", message: "não pode estar em branco", code: "blank" }],
              status: :unprocessable_entity
            )
          end

          # Load the existing GeneratedModpack — raises RecordNotFound if missing.
          modpack_record = current_user.generated_modpacks.find(params[:id])

          # Reconstruct the ManifestService::Modpack value object from the stored record.
          existing_modpack = rebuild_modpack_from_record(modpack_record)

          generator = AIService::ModpackGenerator.new
          result    = generator.adjust(
            modpack:     existing_modpack,
            instruction: instruction
          )

          # Validate the updated manifest (Req 11.10, 12.6).
          validate_manifest!(result.modpack)

          # Update the persisted record.
          update_generation_result(modpack_record, result)

          render_success(data: serialize_generation_result(result, modpack_record))
        end

        # ── Private helpers ───────────────────────────────────────────────────
        private

        # Strong parameters for the generate action.
        def generate_params
          params.permit(:description, :minecraft_version, :loader)
        end

        # Strong parameters for the adjust action.
        def adjust_params
          params.permit(:instruction)
        end

        # Validate required parameters for the generate action.
        # Returns an array of error hashes (empty when all params are valid).
        def validate_generate_params(description, minecraft_version, loader)
          errors = []

          if description.empty?
            errors << { field: "description", message: "não pode estar em branco", code: "blank" }
          elsif description.length > 500
            errors << {
              field:   "description",
              message: "deve ter no máximo 500 caracteres (recebido: #{description.length})",
              code:    "too_long"
            }
          end

          if minecraft_version.empty?
            errors << { field: "minecraft_version", message: "não pode estar em branco", code: "blank" }
          end

          valid_loaders = %w[forge fabric quilt neoforge]
          if loader.empty?
            errors << { field: "loader", message: "não pode estar em branco", code: "blank" }
          elsif !valid_loaders.include?(loader)
            errors << {
              field:   "loader",
              message: "valor inválido '#{loader}'. Use: #{valid_loaders.join(', ')}",
              code:    "inclusion"
            }
          end

          errors
        end

        # Validate the generated ManifestService::Modpack by performing a round-trip
        # through ManifestService::Serializer and ManifestService::Parser.
        #
        # Raises ManifestService::ParseError if the manifest is invalid.
        # Requirements: 11.10, 12.6
        def validate_manifest!(modpack)
          # Choose the serialization format based on the loader.
          # Modrinth format is used for fabric/quilt/neoforge; CurseForge for forge.
          # We validate against both formats to ensure maximum compatibility.
          format = modrinth_loader?(modpack.loader) ? :modrinth : :curseforge

          json_string = ManifestService::Serializer.serialize(modpack, format: format)
          ManifestService::Parser.parse(json_string, format: format)
        end

        # Returns true if the loader is typically associated with Modrinth format.
        def modrinth_loader?(loader)
          %i[fabric quilt neoforge].include?(loader.to_sym)
        end

        # Persist a new GeneratedModpack and its associated GeneratedMod records.
        # Returns the created GeneratedModpack record.
        def persist_generation_result(result, description, minecraft_version, loader)
          modpack_record = current_user.generated_modpacks.create!(
            name:              result.modpack.name,
            description_prompt: description,
            minecraft_version: minecraft_version,
            loader:            loader,
            loader_version:    result.modpack.loader_version.to_s,
            mod_count:         result.selected_mods.size,
            status:            "completed",
            manifest_json:     build_manifest_json(result.modpack),
            report_json:       result.report.to_json
          )

          # Persist individual mod records.
          result.selected_mods.each do |mod|
            modpack_record.generated_mods.create!(
              source:        mod[:source].to_s,
              external_id:   mod[:project_id].to_s,
              name:          mod[:name].to_s,
              version:       mod[:version_id].to_s,
              justification: mod[:justification].to_s,
              is_optional:   false
            )
          end

          # Persist optional mod suggestions.
          result.optional_mods.each do |mod|
            modpack_record.generated_mods.create!(
              source:        mod[:source].to_s,
              external_id:   mod[:project_id].to_s,
              name:          mod[:name].to_s,
              version:       mod[:version_id].to_s,
              justification: "Sugestão opcional",
              is_optional:   true
            )
          end

          modpack_record
        end

        # Update an existing GeneratedModpack record after an adjustment.
        def update_generation_result(modpack_record, result)
          modpack_record.update!(
            loader_version: result.modpack.loader_version.to_s,
            mod_count:      result.selected_mods.size,
            status:         "completed",
            manifest_json:  build_manifest_json(result.modpack),
            report_json:    result.report.to_json
          )

          # Replace mod records: destroy existing, create new ones.
          modpack_record.generated_mods.destroy_all

          result.selected_mods.each do |mod|
            modpack_record.generated_mods.create!(
              source:        mod[:source].to_s,
              external_id:   mod[:project_id].to_s,
              name:          mod[:name].to_s,
              version:       mod[:version_id].to_s,
              justification: mod[:justification].to_s,
              is_optional:   false
            )
          end
        end

        # Rebuild a ManifestService::Modpack value object from a GeneratedModpack record.
        # Used to reconstruct the modpack for the adjust action.
        def rebuild_modpack_from_record(modpack_record)
          mods = modpack_record.generated_mods.where(is_optional: false).map do |mod|
            ManifestService::ModEntry.new(
              source:     mod.source.to_sym,
              project_id: mod.external_id,
              version_id: mod.version,
              filename:   nil,
              sha256:     nil
            )
          end

          ManifestService::Modpack.new(
            name:              modpack_record.name,
            minecraft_version: modpack_record.minecraft_version,
            loader:            modpack_record.loader.to_sym,
            loader_version:    modpack_record.loader_version.presence || "0.0.0",
            mods:              mods
          )
        end

        # Build a manifest JSON string from a ManifestService::Modpack value object.
        # Stores the Modrinth format for fabric/quilt/neoforge, CurseForge for forge.
        def build_manifest_json(modpack)
          format = modrinth_loader?(modpack.loader) ? :modrinth : :curseforge
          ManifestService::Serializer.serialize(modpack, format: format)
        rescue ManifestService::UnsupportedFormatError
          "{}"
        end

        # Serialize a GenerationResult into the API response payload.
        def serialize_generation_result(result, modpack_record)
          {
            id:               modpack_record.id,
            name:             result.modpack.name,
            minecraft_version: result.modpack.minecraft_version,
            loader:           result.modpack.loader,
            loader_version:   result.modpack.loader_version,
            mod_count:        result.selected_mods.size,
            status:           modpack_record.status,
            selected_mods:    serialize_mods(result.selected_mods),
            optional_mods:    serialize_mods(result.optional_mods),
            substitutions:    result.substitutions,
            removed_mods:     result.removed_mods,
            kubejs_scripts:   result.kubejs_scripts,
            report:           result.report,
            created_at:       modpack_record.created_at
          }
        end

        # Serialize an array of mod hashes for the API response.
        def serialize_mods(mods)
          Array(mods).map do |mod|
            {
              source:     mod[:source],
              project_id: mod[:project_id],
              version_id: mod[:version_id],
              name:       mod[:name],
              slug:       mod[:slug],
              rating:     mod[:rating],
              downloads:  mod[:downloads]
            }.compact
          end
        end

        # Build the errors array for InsufficientModsError (Req 11.7).
        def build_insufficient_mods_errors(exception)
          error = {
            message: exception.message,
            code:    "insufficient_mods"
          }
          error[:suggestions] = exception.suggestions if exception.suggestions.any?
          [error]
        end

        # Build the errors array for CompatibilityError (Req 11.3).
        def build_compatibility_errors(exception)
          error = {
            message: exception.message,
            code:    "compatibility_error"
          }
          error[:conflicting_mods] = exception.conflicting_mods if exception.conflicting_mods.any?
          [error]
        end
      end
    end
  end
end
