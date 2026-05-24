# frozen_string_literal: true

module Api
  module V1
    # Handles modpack search, detail and manifest endpoints.
    #
    # Endpoints:
    #   GET /api/v1/modpacks                    — search modpacks (public)
    #   GET /api/v1/modpacks/:id                — modpack details (public)
    #   GET /api/v1/modpacks/:id/manifest       — installation manifest (authenticated)
    #
    # Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 4.6, 5.3, 5.4
    class ModpacksController < BaseController
      MAX_PER_PAGE = 20

      # The manifest endpoint requires authentication — use enforce_authentication!
      # which calls ApplicationController's require_authentication! directly,
      # bypassing the no-op override in BaseController.
      before_action :enforce_authentication!, only: [:manifest]

      # GET /api/v1/modpacks
      #
      # Query params:
      #   q            [String]  search term
      #   source       [String]  "curseforge" | "modrinth" | "both" (default: "both")
      #   game_version [String]  Minecraft version filter
      #   loader       [String]  mod loader filter
      #   category     [String]  category filter
      #   page         [Integer] page number (default: 1)
      def index
        query        = params[:q].to_s.strip
        source_param = params[:source].to_s.presence || "both"
        page         = [params[:page].to_i, 1].max
        per_page     = [[params[:per_page].to_i, 1].max, MAX_PER_PAGE].min
        per_page     = MAX_PER_PAGE if per_page == 0
        filters      = build_filters

        results, total = fetch_modpacks(query: query, source: source_param, filters: filters, page: page, per_page: per_page)

        meta = pagination_meta(page: page, per_page: per_page, total: total)

        if results.empty? && query.present?
          return render_success(
            data: [],
            meta: meta.merge(message: "Nenhum resultado encontrado para '#{query}'")
          )
        end

        render_success(data: results, meta: meta)
      end

      # GET /api/v1/modpacks/:id
      #
      # Query params:
      #   source [String] "curseforge" | "modrinth" (required)
      def show
        source = resolve_source(params[:source])
        return unless source

        client = ExternalAPI::Client.new(source: source)
        data   = client.find(id: params[:id])

        render_success(data: normalize_find_response(data, source: source))
      end

      # GET /api/v1/modpacks/:id/mods
      #
      # Returns the list of mods included in a modpack (from the API).
      # Query params:
      #   source [String] "curseforge" | "modrinth" (required)
      def mods
        source = resolve_source(params[:source])
        return unless source

        client = ExternalAPI::Client.new(source: source)
        mods   = fetch_modpack_mods(client: client, id: params[:id], source: source)
        render_success(data: mods)
      rescue ExternalAPI::ServiceUnavailableError
        render_success(data: [])
      end

      # GET /api/v1/modpacks/:id/versions
      #
      # Returns the list of available versions for a modpack.
      # Query params:
      #   source [String] "curseforge" | "modrinth" (required)
      def versions
        source = resolve_source(params[:source])
        return unless source

        client = ExternalAPI::Client.new(source: source)
        raw_versions = client.versions(id: params[:id])

        # Normalize version data based on source
        normalized = normalize_versions(raw_versions, source: source)
        render_success(data: normalized)
      rescue ExternalAPI::ServiceUnavailableError
        render_success(data: [])
      end

      # GET /api/v1/modpacks/:id/manifest
      #
      # Returns an installation manifest JSON with SHA-256 hashes.
      # Requires authentication — Requirement 4.6.
      #
      # Query params:
      #   source [String] "curseforge" | "modrinth" (required)
      def manifest
        source = resolve_source(params[:source])
        return unless source

        client   = ExternalAPI::Client.new(source: source)
        raw_data = client.find(id: params[:id])

        manifest_data = build_manifest(raw_data, source: source, id: params[:id])

        render_success(data: manifest_data)
      end

      # -----------------------------------------------------------------------
      private
      # -----------------------------------------------------------------------

      # Build filters hash from permitted params.
      def build_filters
        {
          game_version: params[:game_version].presence,
          loader:       params[:loader].presence,
          category_id:  params[:category].presence,
          sort:         params[:sort].presence
        }.compact
      end

      # Fetch modpacks from one or both sources and merge results.
      #
      # @return [Array(Array, Integer)] [items, total]
      def fetch_modpacks(query:, source:, filters:, page:, per_page: MAX_PER_PAGE)
        sources = resolve_sources(source)
        return [[], 0] if sources.empty?

        all_items = []
        total     = 0
        errors    = []

        sources.each do |src|
          begin
            client   = ExternalAPI::Client.new(source: src)
            src_filters = if src == :curseforge
              filters.merge(class_id: 4471)
            else
              filters.merge(project_type: "modpack")
            end
            response = client.search(query: query, filters: src_filters, page: page, per_page: per_page)
            items, count = extract_items_and_total(response, source: src)
            all_items.concat(items)
            total += count
          rescue ExternalAPI::ServiceUnavailableError => e
            errors << e
          end
        end

        raise errors.last if errors.size == sources.size && errors.any?

        [all_items, total]
      end

      # Resolve the source param to an array of symbols.
      def resolve_sources(source_param)
        case source_param.downcase
        when "curseforge" then [:curseforge]
        when "modrinth"   then [:modrinth]
        else                   [:curseforge, :modrinth]
        end
      end

      # Resolve a single source param to a symbol, rendering an error if invalid.
      # Returns nil (and renders) when invalid so the action can return early.
      def resolve_source(source_param)
        sym = source_param.to_s.downcase.to_sym
        if %i[curseforge modrinth].include?(sym)
          sym
        else
          render_error(
            errors: [{ field: "source", message: "Fonte inválida. Use 'curseforge' ou 'modrinth'", code: "invalid_source" }],
            status: :unprocessable_entity
          )
          nil
        end
      end

      # Extract items array and total count from a raw API response.
      def extract_items_and_total(response, source:)
        case source
        when :curseforge
          data  = response.dig("data") || []
          total = response.dig("pagination", "totalCount") || data.size
          [data, total.to_i]
        when :modrinth
          hits  = response["hits"] || []
          total = response["total_hits"] || hits.size
          [hits, total.to_i]
        else
          [[], 0]
        end
      end

      # Normalize a find response to a consistent shape.
      def normalize_find_response(response, source:)
        case source
        when :curseforge then response["data"] || response
        when :modrinth   then response
        else response
        end
      end

      # Build the installation manifest JSON structure from raw API data.
      # Requirement 4.6 — includes mod identifiers, versions, loader, Minecraft version
      # and SHA-256 hashes.
      #
      # @param raw_data [Hash]   raw API response for the modpack
      # @param source   [Symbol] :curseforge or :modrinth
      # @param id       [String] external modpack ID
      # @return [Hash]
      def build_manifest(raw_data, source:, id:)
        case source
        when :curseforge
          build_curseforge_manifest(raw_data, id: id)
        when :modrinth
          build_modrinth_manifest(raw_data, id: id)
        end
      end

      # Fetch the list of mods included in a modpack from the external API.
      # Returns an array of { id, name, source, version, image_url } hashes.
      def fetch_modpack_mods(client:, id:, source:)
        raw = client.modpack_files(id: id)

        case source
        when :curseforge
          # CurseForge: latest file has a list of required mods in its dependencies
          files = raw.is_a?(Hash) ? (raw["data"] || []) : []
          latest = files.first
          return [] unless latest

          deps = latest["dependencies"] || []
          deps.select { |d| d["relationType"] == 3 }.map do |dep|
            {
              id:        dep["modId"].to_s,
              name:      dep["modId"].to_s,
              source:    "curseforge",
              version:   nil,
              image_url: nil,
            }
          end

        when :modrinth
          # Modrinth: latest version has a list of dependencies
          versions = raw.is_a?(Array) ? raw : []
          latest = versions.first
          return [] unless latest

          deps = latest["dependencies"] || []
          deps.select { |d| d["dependency_type"] == "required" }.map do |dep|
            {
              id:        dep["project_id"].to_s,
              name:      dep["project_id"].to_s,
              source:    "modrinth",
              version:   dep["version_id"],
              image_url: nil,
            }
          end

        else
          []
        end
      end

      # Build manifest from CurseForge modpack data.
      def build_curseforge_manifest(data, id:)
        modpack = data["data"] || data

        loader_info = modpack.dig("latestFiles", 0, "gameVersions") || []
        loader      = detect_loader_from_versions(loader_info)

        mods = (modpack["latestFiles"] || []).flat_map do |file|
          (file["modules"] || []).map do |mod|
            {
              source:     "curseforge",
              project_id: mod["folderId"]&.to_s || id,
              version_id: file["id"]&.to_s,
              filename:   file["fileName"],
              sha256:     extract_sha256(file["hashes"])
            }
          end
        end

        {
          format_version:    1,
          name:              modpack["name"],
          minecraft_version: detect_minecraft_version(modpack.dig("latestFiles", 0, "gameVersions") || []),
          loader:            loader,
          loader_version:    nil,
          mods:              mods,
          generated_at:      Time.current.iso8601
        }
      end

      # Build manifest from Modrinth modpack data.
      def build_modrinth_manifest(data, id:)
        modpack = data

        minecraft_version = (modpack["game_versions"] || []).last
        loaders           = modpack["loaders"] || []
        loader            = loaders.first

        mods = (modpack["versions"] || []).map do |version|
          {
            source:     "modrinth",
            project_id: modpack["id"] || id,
            version_id: version.is_a?(Hash) ? version["id"] : version.to_s,
            filename:   version.is_a?(Hash) ? version["name"] : nil,
            sha256:     version.is_a?(Hash) ? version.dig("files", 0, "hashes", "sha256") : nil
          }
        end

        {
          format_version:    1,
          name:              modpack["title"] || modpack["name"],
          minecraft_version: minecraft_version,
          loader:            loader,
          loader_version:    nil,
          mods:              mods,
          generated_at:      Time.current.iso8601
        }
      end

      # Detect the primary mod loader from a CurseForge game versions array.
      def detect_loader_from_versions(versions)
        loaders = %w[Forge Fabric Quilt NeoForge]
        versions.find { |v| loaders.any? { |l| v.to_s.downcase.include?(l.downcase) } }
                &.downcase
      end

      # Detect the Minecraft version from a CurseForge game versions array.
      def detect_minecraft_version(versions)
        versions.find { |v| v.to_s.match?(/\A\d+\.\d+/) }
      end

      # Extract SHA-256 hash from CurseForge hashes array.
      # CurseForge hash algo: 1 = SHA1, 2 = MD5 (no SHA-256 in v1 API).
      # We store whatever is available; the Launcher verifies against the API.
      def extract_sha256(hashes)
        return nil unless hashes.is_a?(Array)

        # CurseForge doesn't provide SHA-256 natively; return nil and let the
        # Launcher fetch it from the file download endpoint.
        nil
      end

      # Normalize version data from external API to a consistent format.
      #
      # @param versions [Array, Hash] raw version data from external API
      # @param source [Symbol] :curseforge or :modrinth
      # @return [Array<Hash>] normalized version objects
      def normalize_versions(versions, source:)
        version_list = case source
        when :curseforge
          # CurseForge returns { data: [...] }
          versions.is_a?(Hash) ? (versions["data"] || []) : Array(versions)
        when :modrinth
          # Modrinth returns array directly
          Array(versions)
        else
          []
        end

        version_list.map do |v|
          case source
          when :curseforge
            {
              id: v["id"]&.to_s || "",
              version_number: v["displayName"] || v["fileName"] || "",
              game_version: (v["gameVersions"] || []).find { |gv| gv.to_s.match?(/^\d+\.\d+/) } || "",
              loader: detect_loader_from_versions(v["gameVersions"] || []),
              release_date: v["fileDate"] || "",
              download_url: v["downloadUrl"] || "",
              file_name: v["fileName"] || "",
            }
          when :modrinth
            {
              id: v["id"] || v["version_id"] || "",
              version_number: v["version_number"] || v["name"] || "",
              game_version: (v["game_versions"] || [])[0] || "",
              loader: (v["loaders"] || [])[0] || "",
              release_date: v["date_published"] || "",
              download_url: v.dig("files", 0, "url") || "",
              file_name: v.dig("files", 0, "filename") || "",
            }
          end
        end
      end
    end
  end
end
