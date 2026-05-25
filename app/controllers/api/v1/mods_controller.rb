# frozen_string_literal: true

module Api
  module V1
    # Handles mod search and detail endpoints.
    #
    # Endpoints:
    #   GET /api/v1/mods        — search mods (public)
    #   GET /api/v1/mods/:id    — mod details (public)
    #
    # Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 5.3, 5.4
    class ModsController < BaseController
      MAX_PER_PAGE = 20

      # GET /api/v1/mods
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

        results, total = fetch_mods(query: query, source: source_param, filters: filters, page: page, per_page: per_page)

        meta = pagination_meta(page: page, per_page: per_page, total: total)

        if results.empty? && query.present?
          return render_success(
            data: [],
            meta: meta.merge(message: "Nenhum resultado encontrado para '#{query}'")
          )
        end

        render_success(data: results, meta: meta)
      end

      # GET /api/v1/mods/:id
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

      # GET /api/v1/mods/:id/versions
      #
      # Returns the list of available versions for a mod.
      # Query params:
      #   source [String] "curseforge" | "modrinth" (required)
      def versions
        source = resolve_source(params[:source])
        return unless source

        client = ExternalAPI::Client.new(source: source)
        raw    = client.versions(id: params[:id])

        versions = normalize_versions(raw, source: source)
        render_success(data: versions)
      rescue ExternalAPI::ServiceUnavailableError
        render_success(data: [])
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
          sort:         params[:sort].presence,
          # Content type filtering: shaders, resourcepacks, mods
          project_type: params[:project_type].presence,   # Modrinth: "mod" | "shader" | "resourcepack"
          class_id:     params[:class_id].presence&.to_i, # CurseForge: 6=mods, 6552=shaders, 12=resourcepacks
        }.compact
      end

      # Fetch mods from one or both sources and merge results.
      #
      # @return [Array(Array, Integer)] [items, total]
      def fetch_mods(query:, source:, filters:, page:, per_page: MAX_PER_PAGE)
        sources = resolve_sources(source)
        return [[], 0] if sources.empty?

        all_items = []
        total     = 0
        errors    = []

        sources.each do |src|
          begin
            client   = ExternalAPI::Client.new(source: src)
            response = client.search(query: query, filters: filters, page: page, per_page: per_page)
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
      # Handles both CurseForge and Modrinth response shapes.
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

      # Normalize versions list to a consistent shape:
      # [{ id, name, game_versions, loaders, date_published }]
      def normalize_versions(raw, source:)
        case source
        when :modrinth
          # raw is an Array of version objects
          list = raw.is_a?(Array) ? raw : []
          list.first(50).map do |v|
            {
              id:             v["id"],
              name:           v["name"] || v["version_number"],
              version_number: v["version_number"],
              game_versions:  v["game_versions"] || [],
              loaders:        v["loaders"] || [],
              date_published: v["date_published"],
            }
          end

        when :curseforge
          # raw is { data: [...], pagination: {...} }
          list = (raw.is_a?(Hash) ? raw["data"] : raw) || []
          list.first(50).map do |f|
            {
              id:             f["id"].to_s,
              name:           f["displayName"] || f["fileName"],
              version_number: f["fileName"],
              game_versions:  (f["gameVersions"] || []).reject { |v| v.match?(/\AForge|Fabric|Quilt|NeoForge\z/i) },
              loaders:        (f["gameVersions"] || []).select { |v| v.match?(/\AForge|Fabric|Quilt|NeoForge\z/i) }.map(&:downcase),
              date_published: f["fileDate"],
            }
          end

        else
          []
        end
      end
    end
  end
end
