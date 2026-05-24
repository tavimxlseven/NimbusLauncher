# frozen_string_literal: true

module Api
  module V1
    # Handles the authenticated user's personal library of mods and modpacks.
    #
    # Endpoints:
    #   GET    /api/v1/library        — list library items (authenticated)
    #   POST   /api/v1/library        — add item to library (authenticated)
    #   DELETE /api/v1/library/:id    — remove item from library (authenticated)
    #
    # Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
    class LibraryController < BaseController
      # All endpoints in this controller require authentication.
      # Override the no-op from BaseController to enforce it.
      def require_authentication!
        enforce_authentication!
      end

      # GET /api/v1/library
      #
      # Returns the current user's library items ordered by added_at DESC
      # (falls back to created_at DESC when added_at is nil).
      # Requirement 4.4, 4.5
      def index
        items = current_user.library_items
                            .order(Arel.sql("COALESCE(added_at, created_at) DESC"))

        if items.empty?
          return render_success(
            data: [],
            meta: { message: "Nenhum item na sua biblioteca ainda" }
          )
        end

        render_success(data: items.map { |item| serialize_item(item) })
      end

      # POST /api/v1/library
      #
      # Creates a new LibraryItem for the current user.
      # Returns HTTP 201 on success.
      # Returns HTTP 409 when the item is already in the library.
      # Requirements: 4.1, 4.2
      def create
        item = current_user.library_items.build(library_item_params)
        item.added_at ||= Time.current

        if item.save
          render_success(data: serialize_item(item), status: :created)
        else
          if duplicate_error?(item)
            render_error(
              errors: [{ message: "Item já está na sua biblioteca", code: "duplicate" }],
              status: :conflict
            )
          else
            errors = item.errors.map do |error|
              { field: error.attribute, message: error.message, code: error.type }
            end
            render_error(errors: errors, status: :unprocessable_entity)
          end
        end
      end

      # GET /api/v1/library/:id
      #
      # Returns a single library item belonging to the current user. Used by
      # the launcher right before lift-off to make sure we use the freshest
      # loader/mc_version instead of a stale React prop.
      def show
        item = current_user.library_items.find_by(id: params[:id])
        if item.nil?
          return render_error(
            errors: [{ message: "Recurso não encontrado", code: "not_found" }],
            status: :not_found
          )
        end
        render_success(data: serialize_item(item))
      end

      # GET /api/v1/library/:id/archive
      #
      # Returns the download URL + sha1 of the modpack's source archive
      # (CurseForge .zip / Modrinth .mrpack). Used by the launcher to extract
      # `overrides/` (configs, scripts, kubejs, resourcepacks, etc.) into the
      # local instance — without these, ATM-class packs run with vanilla
      # config defaults and lots of features silently break.
      def archive
        item = current_user.library_items.find_by(id: params[:id])
        if item.nil?
          return render_error(errors: [{ message: "Não encontrado", code: "not_found" }], status: :not_found)
        end
        if item.item_type != "modpack" || item.external_id.to_s.start_with?("custom-")
          return render_error(
            errors: [{ message: "Item não tem arquivo de modpack", code: "no_archive" }],
            status: :unprocessable_entity,
          )
        end

        client = ExternalAPI::Client.new(source: item.source.to_sym)
        case item.source
        when "curseforge"
          files_resp = client.send(:with_retry) { client.send(:get, "/mods/#{item.external_id}/files?pageSize=10&sortField=11&sortOrder=desc") }
          files = files_resp["data"] || []
          file = files.find { |f|
            mc_ok = item.mc_version.blank? || (f["gameVersions"] || []).include?(item.mc_version)
            ld_ok = item.loader.blank?     || (f["gameVersions"] || []).any? { |g| g.to_s.downcase == item.loader.downcase }
            mc_ok && ld_ok && f["releaseType"] == 1
          } || files.first
          return render_error(errors: [{ message: "Arquivo do modpack não encontrado", code: "no_archive" }], status: :not_found) unless file

          url = file["downloadUrl"]
          if url.blank? && file["id"]
            fid = file["id"].to_s
            url = "https://edge.forgecdn.net/files/#{fid[0,4].to_i}/#{fid[4..].to_i}/#{file['fileName']}"
          end
          render_success(data: { download_url: url, file_name: file["fileName"], sha1: file.dig("hashes")&.find { |h| h["algo"] == 1 }&.dig("value") })

        when "modrinth"
          versions = client.send(:with_retry) { client.send(:get, "/project/#{item.external_id}/version") }
          version = versions.find { |v|
            mc_ok = item.mc_version.blank? || (v["game_versions"] || []).include?(item.mc_version)
            ld_ok = item.loader.blank?     || (v["loaders"]       || []).map(&:to_s).map(&:downcase).include?(item.loader.downcase)
            mc_ok && ld_ok
          } || versions.first
          return render_error(errors: [{ message: "Versão do modpack não encontrada", code: "no_archive" }], status: :not_found) unless version

          primary = (version["files"] || []).find { |f| f["primary"] } || (version["files"] || []).first
          render_success(data: { download_url: primary["url"], file_name: primary["filename"], sha1: primary.dig("hashes", "sha1") })
        else
          render_error(errors: [{ message: "Source desconhecido", code: "unknown_source" }], status: :unprocessable_entity)
        end
      end

      # POST /api/v1/library/:id/install
      #
      # For external modpacks: downloads the modpack archive (CurseForge .zip
      # or Modrinth .mrpack), parses its manifest, imports the embedded mod
      # list as ModpackMod rows, and marks the item as installed.
      #
      # For custom modpacks or mods: just sets installed=true (no-op import).
      def install
        item = current_user.library_items.find_by(id: params[:id])
        if item.nil?
          return render_error(errors: [{ message: "Não encontrado", code: "not_found" }], status: :not_found)
        end

        if item.item_type != "modpack"
          item.update!(installed: true)
          return render_success(data: serialize_item(item).merge(import: { mods_added: 0 }))
        end

        result = ModpackImporter.new(item).import!
        item.update!(installed: true)
        render_success(data: serialize_item(item.reload).merge(import: result))
      rescue ModpackImporter::ImportError => e
        render_error(errors: [{ message: "Falha ao importar modpack: #{e.message}", code: "import_failed" }], status: :unprocessable_entity)
      end

      # PATCH /api/v1/library/:id
      #
      # Updates an existing library item (mainly used to rename / change image
      # / mark as installed). Only the owning user may update.
      # Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 15.4, 15.5
      def update
        item = current_user.library_items.find_by(id: params[:id])

        if item.nil?
          return render_error(
            errors: [{ message: "Recurso não encontrado", code: "not_found" }],
            status: :not_found
          )
        end

        # If version parameter is provided, validate it against external API
        # Requirements: 4.3, 15.5
        if version_param_present?
          validation_result = validate_version_change(item)
          unless validation_result[:valid]
            return render_error(
              errors: [{ message: validation_result[:error], code: validation_result[:code] }],
              status: validation_result[:status]
            )
          end
        end

        # When version is changed, mark as not installed (Requirement 4.6)
        update_params = library_item_update_params
        if version_param_present? && update_params[:version] != item.version
          update_params[:installed] = false
        end

        if item.update(update_params)
          render_success(data: serialize_item(item))
        else
          errors = item.errors.map do |error|
            { field: error.attribute, message: error.message, code: error.type }
          end
          render_error(errors: errors, status: :unprocessable_entity)
        end
      end

      # DELETE /api/v1/library/:id
      #
      # Removes a library item belonging to the current user.
      # Returns HTTP 204 on success.
      # Returns HTTP 404 if not found or belongs to another user.
      # Requirement 4.3
      def destroy
        item = current_user.library_items.find_by(id: params[:id])

        if item.nil?
          return render_error(
            errors: [{ message: "Recurso não encontrado", code: "not_found" }],
            status: :not_found
          )
        end

        item.destroy!
        head :no_content
      end

      # -----------------------------------------------------------------------
      private
      # -----------------------------------------------------------------------

      # Check if version parameter is present in the request
      def version_param_present?
        params_hash = params[:library_item] || params
        params_hash.key?(:version) || params_hash.key?("version")
      end

      # Validate version change against external API
      # Requirements: 4.3, 15.5
      def validate_version_change(item)
        new_version = (params[:library_item] || params)[:version]

        # Only validate for external modpacks (not custom ones)
        unless item.item_type == "modpack" && !item.external_id.to_s.start_with?("custom-")
          return { valid: true }
        end

        begin
          client = ExternalAPI::Client.new(source: item.source.to_sym)
          
          case item.source
          when "curseforge"
            # Fetch all files/versions for the modpack
            files_resp = client.send(:with_retry) do
              client.send(:get, "/mods/#{item.external_id}/files?pageSize=50&sortField=1&sortOrder=desc")
            end
            files = files_resp["data"] || []
            
            # Check if the new version exists in the files list
            version_exists = files.any? { |f| f["id"].to_s == new_version.to_s }
            
            unless version_exists
              return {
                valid: false,
                error: "Versão #{new_version} não encontrada para este modpack",
                code: "invalid_version",
                status: :unprocessable_entity
              }
            end

          when "modrinth"
            # Fetch all versions for the modpack
            versions = client.send(:with_retry) do
              client.send(:get, "/project/#{item.external_id}/version")
            end
            
            # Check if the new version exists in the versions list
            version_exists = versions.any? { |v| v["id"].to_s == new_version.to_s }
            
            unless version_exists
              return {
                valid: false,
                error: "Versão #{new_version} não encontrada para este modpack",
                code: "invalid_version",
                status: :unprocessable_entity
              }
            end
          end

          { valid: true }

        rescue ExternalAPI::ServiceUnavailableError => e
          {
            valid: false,
            error: "Não foi possível validar a versão: serviço externo indisponível",
            code: "external_api_unavailable",
            status: :service_unavailable
          }
        rescue StandardError => e
          Rails.logger.error("Version validation error: #{e.class.name} - #{e.message}")
          {
            valid: false,
            error: "Erro ao validar versão: #{e.message}",
            code: "validation_error",
            status: :internal_server_error
          }
        end
      end

      # Strong parameters for creating a library item.
      def library_item_params
        params.require(:library_item).permit(:source, :external_id, :item_type, :name, :version,
                                             :loader, :mc_version, :image_url, :description, :installed)
      rescue ActionController::ParameterMissing
        params.permit(:source, :external_id, :item_type, :name, :version,
                      :loader, :mc_version, :image_url, :description, :installed)
      end

      # Strong parameters for updating a library item.
      # Cannot change source/external_id/item_type after creation.
      def library_item_update_params
        permitted = %i[name version loader mc_version image_url description installed]
        if params[:library_item].is_a?(ActionController::Parameters) || params[:library_item].is_a?(Hash)
          params.require(:library_item).permit(permitted)
        else
          params.permit(permitted)
        end
      end

      # Returns true when the record failed to save due to a uniqueness violation.
      def duplicate_error?(item)
        item.errors[:user_id].any? { |msg| msg.include?("já está na sua biblioteca") } ||
          item.errors[:external_id].any? { |msg| msg.include?("já está na sua biblioteca") }
      end

      # Serializes a LibraryItem to a plain Hash for JSON responses.
      def serialize_item(item)
        {
          id:          item.id,
          source:      item.source,
          external_id: item.external_id,
          item_type:   item.item_type,
          name:        item.name,
          version:     item.version,
          loader:      item.loader,
          mc_version:  item.mc_version,
          image_url:   item.image_url,
          description: item.description,
          installed:   item.installed,
          added_at:    (item.added_at || item.created_at)&.iso8601
        }
      end
    end
  end
end
