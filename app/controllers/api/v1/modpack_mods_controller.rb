# frozen_string_literal: true

module Api
  module V1
    # Manages mods associated with a user's modpack (library_item of type modpack).
    #
    # Endpoints:
    #   GET    /api/v1/library/:library_item_id/mods        — list mods in modpack
    #   POST   /api/v1/library/:library_item_id/mods        — add mod to modpack
    #   DELETE /api/v1/library/:library_item_id/mods/:id    — remove mod from modpack
    class ModpackModsController < BaseController
      def require_authentication!
        enforce_authentication!
      end

      before_action :load_modpack

      # GET /api/v1/library/:library_item_id/mods
      def index
        mods = @modpack.modpack_mods.order(created_at: :asc)
        render_success(data: mods.map { |m| serialize_mod(m) })
      end

      # POST /api/v1/library/:library_item_id/mods
      def create
        # Block adding mods to external modpacks that haven't been installed yet.
        # Custom modpacks (`external_id` starts with `custom-`) are always allowed.
        unless modpack_allows_mod_management?
          return render_error(
            errors: [{
              message: "Instale o modpack antes de adicionar mods.",
              code: "modpack_not_installed",
            }],
            status: :unprocessable_entity,
          )
        end

        mod = @modpack.modpack_mods.build(mod_params)
        mod.added_at ||= Time.current

        if mod.save
          render_success(data: serialize_mod(mod), status: :created)
        else
          if mod.errors[:library_item_id].any? { |msg| msg.include?("já está neste modpack") } ||
             mod.errors[:external_id].any? { |msg| msg.include?("já está neste modpack") }
            render_error(
              errors: [{ message: "Mod já está neste modpack", code: "duplicate" }],
              status: :conflict
            )
          else
            render_error(
              errors: mod.errors.map { |e| { field: e.attribute, message: e.message } },
              status: :unprocessable_entity
            )
          end
        end
      end

      # PATCH /api/v1/library/:library_item_id/mods/:id
      def update
        mod = @modpack.modpack_mods.find_by(id: params[:id])
        return render_error(errors: [{ message: "Não encontrado", code: "not_found" }], status: :not_found) if mod.nil?

        if mod.update(mod_update_params)
          render_success(data: serialize_mod(mod))
        else
          render_error(
            errors: mod.errors.map { |e| { field: e.attribute, message: e.message } },
            status: :unprocessable_entity,
          )
        end
      end

      # DELETE /api/v1/library/:library_item_id/mods/:id
      def destroy
        mod = @modpack.modpack_mods.find_by(id: params[:id])
        return render_error(errors: [{ message: "Não encontrado", code: "not_found" }], status: :not_found) if mod.nil?

        mod.destroy!
        head :no_content
      end

      private

      # Mod management is permitted on:
      #   - custom modpacks (created in the launcher/site, no external source)
      #   - external modpacks the user has marked as installed
      def modpack_allows_mod_management?
        return true if @modpack.external_id.to_s.start_with?("custom-")

        @modpack.installed
      end

      def load_modpack
        # Rails generates :library_id for nested resources under :library
        @modpack = current_user.library_items.find_by(id: params[:library_id], item_type: "modpack")
        render_error(errors: [{ message: "Modpack não encontrado", code: "not_found" }], status: :not_found) if @modpack.nil?
      end

      def mod_params
        params.permit(:source, :external_id, :name, :version, :version_name, :image_url, :enabled)
      end

      def mod_update_params
        params.permit(:enabled, :version, :version_name, :name)
      end

      def serialize_mod(m)
        {
          id:           m.id,
          external_id:  m.external_id,
          source:       m.source,
          name:         m.name,
          version:      m.version,
          version_name: m.version_name,
          image_url:    m.image_url,
          enabled:      m.enabled,
          added_at:     m.added_at&.iso8601,
        }
      end
    end
  end
end
