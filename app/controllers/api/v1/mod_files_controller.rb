# frozen_string_literal: true

module Api
  module V1
    # Resolves a mod (project + version) to its download URL + SHA.
    # The launcher uses this so the CurseForge API key stays server-side.
    #
    # Endpoint:
    #   POST /api/v1/mod_files/resolve
    #     body: { source: "modrinth"|"curseforge", external_id: "...", version_id: "..." }
    #     returns: { download_url, filename, sha1?, sha256? }
    #
    # Authentication: required (launcher session token).
    class ModFilesController < BaseController
      def require_authentication!
        enforce_authentication!
      end

      # POST /api/v1/mod_files/resolve
      def resolve
        source      = params[:source].to_s.downcase
        external_id = params[:external_id].to_s
        version_id  = params[:version_id].to_s

        unless %w[modrinth curseforge].include?(source)
          return render_error(errors: [{ message: "Source inválido", code: "invalid_source" }], status: :bad_request)
        end

        if external_id.blank? || version_id.blank?
          return render_error(errors: [{ message: "external_id e version_id obrigatórios", code: "invalid_params" }], status: :bad_request)
        end

        client = ExternalAPI::Client.new(source: source.to_sym)

        case source
        when "modrinth"
          resolve_modrinth(client, version_id)
        when "curseforge"
          resolve_curseforge(client, external_id, version_id)
        end
      rescue ExternalAPI::ServiceUnavailableError
        render_error(errors: [{ message: "Serviço indisponível", code: "service_unavailable" }], status: :service_unavailable)
      end

      private

      def resolve_modrinth(client, version_id)
        # /v2/version/:id  → { files: [ { url, filename, hashes: { sha1, sha512 }, primary: true } ] }
        data = client.send(:with_retry) { client.send(:get, "/version/#{version_id}") }
        files = (data["files"] || [])
        primary = files.find { |f| f["primary"] } || files.first

        if primary.nil?
          return render_error(errors: [{ message: "Arquivo não encontrado", code: "not_found" }], status: :not_found)
        end

        render_success(data: {
          download_url: primary["url"],
          filename:     primary["filename"],
          sha1:         primary.dig("hashes", "sha1"),
          sha512:       primary.dig("hashes", "sha512"),
          file_size:    primary["size"],
        })
      end

      def resolve_curseforge(client, project_id, file_id)
        # /v1/mods/:modId/files/:fileId  → { data: { downloadUrl, fileName, hashes: [{ value, algo }] } }
        data = client.send(:with_retry) { client.send(:get, "/mods/#{project_id}/files/#{file_id}") }
        file = data["data"] || data

        url = file["downloadUrl"]
        if url.blank? && file["modId"] && file["id"]
          # Workaround: modId/fileId path always returns a URL. But sometimes
          # CF returns nil for distribution-restricted mods. Build the canonical URL.
          fid = file["id"].to_s
          url = "https://edge.forgecdn.net/files/#{fid[0,4].to_i}/#{fid[4..].to_i}/#{file['fileName']}"
        end

        if url.blank?
          return render_error(errors: [{ message: "URL não disponível para este mod", code: "no_download_url" }], status: :unprocessable_entity)
        end

        sha1 = (file["hashes"] || []).find { |h| h["algo"] == 1 }&.dig("value")

        render_success(data: {
          download_url: url,
          filename:     file["fileName"],
          sha1:         sha1,
          file_size:    file["fileLength"],
        })
      end
    end
  end
end
