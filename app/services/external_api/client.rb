# frozen_string_literal: true

require "net/http"
require "uri"
require "json"
require "digest"

module ExternalAPI
  # Unified HTTP client for CurseForge and Modrinth APIs.
  #
  # Features:
  #   - Automatic response caching via Rails.cache (TTL 1–60 min, default 5 min)
  #   - Exponential-backoff retry on HTTP 5xx / Net::HTTP timeout (2s, 4s, 8s)
  #   - HTTP 429 handling: sleeps Retry-After seconds (default 60s) then retries
  #   - After 3 total failures → raises ExternalAPI::ServiceUnavailableError
  #   - Structured logging per call: service, endpoint, latency_ms, status
  #   - NEVER logs API keys, tokens or secrets
  #
  # Usage:
  #   client = ExternalAPI::Client.new(source: :curseforge)
  #   results = client.search(query: "sodium", filters: { game_version: "1.20.1" })
  #
  #   client = ExternalAPI::Client.new(source: :modrinth, cache_ttl: 10)
  #   mod = client.find(id: "AANobbMI")
  #
  #   path = client.download_file(url: "https://...", expected_hash: "abc123...")
  class Client
    # Supported sources and their base URLs
    BASE_URLS = {
      curseforge: "https://api.curseforge.com/v1",
      modrinth:   "https://api.modrinth.com/v2"
    }.freeze

    # CurseForge game ID for Minecraft
    CURSEFORGE_GAME_ID = 432

    # Default page size for search results
    PAGE_SIZE = 20

    # Retry configuration
    MAX_RETRIES        = 3
    BACKOFF_SECONDS    = [2, 4, 8].freeze
    DEFAULT_RETRY_WAIT = 60

    # Cache TTL bounds (minutes)
    MIN_TTL_MINUTES     = 1
    MAX_TTL_MINUTES     = 60
    DEFAULT_TTL_MINUTES = 5

    # @param source    [Symbol]  :curseforge or :modrinth
    # @param cache_ttl [Integer] TTL in minutes (1–60, default 5)
    def initialize(source:, cache_ttl: DEFAULT_TTL_MINUTES)
      unless BASE_URLS.key?(source)
        raise ArgumentError, "Unknown source #{source.inspect}. Supported: #{BASE_URLS.keys.map(&:inspect).join(', ')}"
      end

      @source    = source
      @cache_ttl = cache_ttl.to_i.clamp(MIN_TTL_MINUTES, MAX_TTL_MINUTES)
      @base_url  = BASE_URLS[source]
    end

    # Search mods/modpacks with automatic caching.
    #
    # @param query   [String]  search term
    # @param filters [Hash]    optional filters (e.g. game_version:, loader:, category_id:)
    # @param page    [Integer] 1-based page number
    # @return [Hash] parsed JSON response from the API
    def search(query:, filters: {}, page: 1, per_page: PAGE_SIZE)
      cache_key = build_cache_key("search", query: query, filters: filters, page: page, per_page: per_page)

      Rails.cache.fetch(cache_key, expires_in: @cache_ttl.minutes) do
        path = build_search_path(query: query, filters: filters, page: page, per_page: per_page)
        with_retry { get(path) }
      end
    end

    # Get details of a specific mod/modpack by ID.
    #
    # @param id [String, Integer] external project ID
    # @return [Hash] parsed JSON response from the API
    def find(id:)
      cache_key = build_cache_key("find", id: id)

      Rails.cache.fetch(cache_key, expires_in: @cache_ttl.minutes) do
        path = build_find_path(id: id)
        with_retry { get(path) }
      end
    end

    # Get versions list for a specific mod/modpack.
    #
    # @param id [String, Integer] external project ID
    # @return [Array] list of version objects
    def versions(id:)
      cache_key = build_cache_key("versions", id: id)

      Rails.cache.fetch(cache_key, expires_in: @cache_ttl.minutes) do
        path = build_versions_path(id: id)
        with_retry { get(path) }
      end
    end

    # Download a file and verify its SHA-256 hash.
    #
    # Downloads are NOT cached (binary files); the hash verification ensures
    # integrity. Raises ArgumentError if the hash does not match after download.
    #
    # @param url           [String] full download URL
    # @param expected_hash [String] expected SHA-256 hex digest
    # @return [String] raw binary content of the downloaded file
    # @raise [ArgumentError] if the SHA-256 hash does not match
    def download_file(url:, expected_hash:)
      content = with_retry { download(url) }

      actual_hash = Digest::SHA256.hexdigest(content)
      unless actual_hash == expected_hash.downcase
        raise ArgumentError,
              "SHA-256 mismatch for #{url}. " \
              "Expected #{expected_hash.downcase}, got #{actual_hash}"
      end

      content
    end

    # Get the files/mods list for a modpack.
    # For CurseForge: /mods/:id/files (the modpack's file list)
    # For Modrinth: /project/:id/version (version list with dependencies)
    def modpack_files(id:)
      cache_key = build_cache_key("modpack_files", id: id)
      Rails.cache.fetch(cache_key, expires_in: @cache_ttl.minutes) do
        path = build_modpack_files_path(id: id)
        with_retry { get(path) }
      end
    end

    # Bulk-fetch project metadata for multiple IDs in a single request.
    # This avoids N+1 round-trips when importing modpacks (the ATM 10 modpack
    # alone has 800+ mods — fetching them sequentially blows past nginx's
    # default 60s read timeout).
    #
    # @param ids [Array<String, Integer>] external project IDs
    # @return [Array<Hash>] project objects (may be smaller than input on partial failures)
    def find_bulk(ids:)
      ids = Array(ids).compact.uniq
      return [] if ids.empty?

      case @source
      when :curseforge
        # POST /mods with { modIds: [...] } returns { data: [{...}, ...] }
        # No single endpoint accepts >1000 IDs reliably — chunk to be safe.
        results = []
        ids.each_slice(200) do |chunk|
          payload = { modIds: chunk.map(&:to_i), filterPcOnly: true }
          response = with_retry { post("/mods", body: payload.to_json) }
          results.concat(response["data"] || [])
        end
        results

      when :modrinth
        # GET /projects?ids=["a","b",...] — returns array directly.
        results = []
        ids.each_slice(100) do |chunk|
          encoded = URI.encode_www_form(ids: chunk.to_json)
          response = with_retry { get("/projects?#{encoded}") }
          results.concat(response) if response.is_a?(Array)
        end
        results
      end
    end

    # -------------------------------------------------------------------------
    private
    # -------------------------------------------------------------------------

    # Execute the given block with up to MAX_RETRIES retries.
    #
    # Retry conditions:
    #   - Net::HTTP timeout errors
    #   - HTTP 5xx responses
    #
    # HTTP 429 handling:
    #   - Reads Retry-After header (defaults to DEFAULT_RETRY_WAIT seconds)
    #   - Sleeps that duration, then retries (counts as one attempt)
    #
    # After MAX_RETRIES failures → raises ExternalAPI::ServiceUnavailableError.
    def with_retry
      attempts = 0

      begin
        yield
      rescue Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNRESET,
             Errno::ECONNREFUSED, EOFError => e
        attempts += 1
        if attempts > MAX_RETRIES
          Rails.logger.error(
            service:   @source,
            error:     e.class.name,
            message:   e.message,
            attempts:  attempts
          )
          raise ExternalAPI::ServiceUnavailableError.new(@source)
        end

        wait = BACKOFF_SECONDS[attempts - 1] || BACKOFF_SECONDS.last
        Rails.logger.warn(
          "ExternalAPI retry #{attempts}/#{MAX_RETRIES} for #{@source} " \
          "(#{e.class.name}) — sleeping #{wait}s"
        )
        sleep(wait)
        retry

      rescue RateLimitRetry => e
        # Internal signal from perform_request when HTTP 429 is received.
        # The retry_after value has already been extracted from the response.
        attempts += 1
        if attempts > MAX_RETRIES
          raise ExternalAPI::ServiceUnavailableError.new(@source)
        end

        Rails.logger.warn(
          "ExternalAPI rate-limited by #{@source} — sleeping #{e.retry_after}s " \
          "(attempt #{attempts}/#{MAX_RETRIES})"
        )
        sleep(e.retry_after)
        retry

      rescue ServerError => e
        # Internal signal from perform_request when HTTP 5xx is received.
        attempts += 1
        if attempts > MAX_RETRIES
          raise ExternalAPI::ServiceUnavailableError.new(@source)
        end

        wait = BACKOFF_SECONDS[attempts - 1] || BACKOFF_SECONDS.last
        Rails.logger.warn(
          "ExternalAPI HTTP #{e.status} from #{@source} — sleeping #{wait}s " \
          "(attempt #{attempts}/#{MAX_RETRIES})"
        )
        sleep(wait)
        retry
      end
    end

    # Perform a GET request to the given path (relative to base URL).
    # Returns parsed JSON body as a Hash/Array.
    # Raises internal error signals for 429 and 5xx so with_retry can handle them.
    def get(path)
      uri = URI.parse("#{@base_url}#{path}")
      perform_request(uri)
    end

    # Perform a POST with a JSON body. Used for bulk endpoints.
    def post(path, body:)
      uri = URI.parse("#{@base_url}#{path}")
      perform_request(uri, method: :post, body: body)
    end

    # Download binary content from an absolute URL.
    def download(url)
      uri = URI.parse(url)
      perform_request(uri, parse_json: false)
    end

    # Execute the HTTP request and handle response codes.
    #
    # @param uri        [URI]     target URI
    # @param method     [Symbol]  :get (default) or :post
    # @param body       [String]  request body for POST (JSON-encoded)
    # @param parse_json [Boolean] whether to parse the response body as JSON
    # @return [Hash, Array, String] parsed JSON or raw body
    def perform_request(uri, method: :get, body: nil, parse_json: true)
      start_time = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl     = (uri.scheme == "https")
      http.open_timeout = 10
      http.read_timeout = 30

      request = case method
                when :post
                  req = Net::HTTP::Post.new(uri.request_uri)
                  req["Content-Type"] = "application/json"
                  req.body = body if body
                  req
                else
                  Net::HTTP::Get.new(uri.request_uri)
                end
      apply_headers(request)

      response = http.request(request)

      latency_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start_time) * 1000).round
      log_call(endpoint: uri.path, status: response.code.to_i, latency_ms: latency_ms)

      handle_response(response, parse_json: parse_json)
    end

    # Apply source-specific headers to the request.
    # NEVER logs or exposes API keys.
    def apply_headers(request)
      case @source
      when :curseforge
        api_key = ENV.fetch("CURSEFORGE_API_KEY", nil)
        request["x-api-key"] = api_key if api_key
        request["Accept"]    = "application/json"
      when :modrinth
        request["User-Agent"] = "NimbusLauncher/1.0 (contact@nimbuslauncher.dev)"
        request["Accept"]     = "application/json"
      end
    end

    # Inspect the HTTP response and raise internal signals for retryable errors.
    def handle_response(response, parse_json: true)
      code = response.code.to_i

      case code
      when 200..299
        return parse_json ? JSON.parse(response.body) : response.body

      when 429
        retry_after = parse_retry_after(response["Retry-After"])
        raise RateLimitRetry.new(retry_after)

      when 500..599
        raise ServerError.new(code)

      else
        raise ExternalAPI::ServiceUnavailableError.new(@source),
              "Unexpected HTTP #{code} from #{@source}"
      end
    end

    # Parse the Retry-After header value.
    # Accepts both integer seconds and HTTP-date formats.
    # Falls back to DEFAULT_RETRY_WAIT when the header is absent or unparseable.
    def parse_retry_after(header_value)
      return DEFAULT_RETRY_WAIT if header_value.nil? || header_value.strip.empty?

      # Integer seconds
      if header_value.match?(/\A\d+\z/)
        return header_value.to_i
      end

      # HTTP-date (e.g. "Wed, 21 Oct 2015 07:28:00 GMT")
      begin
        wait = (Time.httpdate(header_value) - Time.now).ceil
        wait > 0 ? wait : DEFAULT_RETRY_WAIT
      rescue ArgumentError
        DEFAULT_RETRY_WAIT
      end
    end

    # Build the search endpoint path for the configured source.
    def build_search_path(query:, filters:, page:, per_page: PAGE_SIZE)
      offset = (page - 1) * per_page

      case @source
      when :curseforge
        params = {
          gameId:       CURSEFORGE_GAME_ID,
          searchFilter: query,
          pageSize:     per_page,
          index:        offset
        }
        params[:gameVersion]   = filters[:game_version] if filters[:game_version]
        params[:modLoaderType] = map_loader_to_curseforge(filters[:loader]) if filters[:loader]
        params[:classId]       = filters[:class_id]     if filters[:class_id]
        # CurseForge sort: 1=Featured, 2=Popularity, 3=LastUpdated, 4=Name, 5=Author, 6=TotalDownloads
        sort_map = { "downloads" => 6, "newest" => 3, "updated" => 3, "follows" => 2 }
        params[:sortField] = sort_map[filters[:sort]] || 6
        params[:sortOrder] = "desc"
        "/mods/search?#{URI.encode_www_form(params)}"

      when :modrinth
        params = {
          query:  query,
          limit:  per_page,
          offset: offset
        }
        params[:versions]   = filters[:game_version] if filters[:game_version]
        # Modrinth loaders must be JSON array
        params[:loaders]    = [filters[:loader]].to_json if filters[:loader]
        if filters[:project_type]
          facets_arr = [["project_type:#{filters[:project_type]}"]]
          facets_arr << ["categories:#{filters[:category_id]}"] if filters[:category_id]
          params[:facets] = facets_arr.to_json
        elsif filters[:category_id]
          params[:facets] = [["categories:#{filters[:category_id]}"]].to_json
        end
        # Sort: relevance, downloads, follows, newest, updated
        sort_map = { "downloads" => "downloads", "follows" => "follows", "newest" => "newest", "updated" => "updated" }
        params[:index] = sort_map[filters[:sort]] || "downloads" if filters[:sort]
        "/search?#{URI.encode_www_form(params)}"
      end
    end

    # Map loader name to CurseForge modLoaderType integer
    def map_loader_to_curseforge(loader)
      { "forge" => 1, "cauldron" => 2, "liteloader" => 3, "fabric" => 4, "quilt" => 5, "neoforge" => 6 }[loader.to_s.downcase]
    end

    # Build the find (detail) endpoint path for the configured source.
    def build_find_path(id:)
      case @source
      when :curseforge then "/mods/#{id}"
      when :modrinth   then "/project/#{id}"
      end
    end

    # Build the versions list endpoint path for the configured source.
    def build_versions_path(id:)
      case @source
      when :curseforge then "/mods/#{id}/files?pageSize=50&sortField=1&sortOrder=desc"
      when :modrinth   then "/project/#{id}/version"
      end
    end

    # Build the modpack files/mods endpoint path.
    # CurseForge: the latest file of a modpack contains the list of required mods
    # Modrinth: the latest version of a modpack contains dependencies
    def build_modpack_files_path(id:)
      case @source
      when :curseforge then "/mods/#{id}/files?pageSize=1&sortField=1&sortOrder=desc"
      when :modrinth   then "/project/#{id}/version?limit=1"
      end
    end

    # Build a namespaced cache key that encodes source, method and params.
    # Keys never contain API credentials.
    def build_cache_key(method_name, **params)
      param_digest = Digest::SHA256.hexdigest(params.sort.to_s)[0, 16]
      "external_api/#{@source}/#{method_name}/#{param_digest}"
    end

    # Write a structured log entry for each external API call.
    # NEVER includes API keys, tokens or secrets.
    def log_call(endpoint:, status:, latency_ms:)
      Rails.logger.info(
        {
          service:    @source,
          endpoint:   endpoint,
          latency_ms: latency_ms,
          status:     status
        }.to_json
      )
    end

    # -------------------------------------------------------------------------
    # Internal error signals (private, never escape with_retry)
    # -------------------------------------------------------------------------

    # Raised internally when the server returns HTTP 429.
    # Carries the parsed retry_after value.
    class RateLimitRetry < StandardError
      attr_reader :retry_after

      def initialize(retry_after)
        @retry_after = retry_after
        super("Rate limited — retry after #{retry_after}s")
      end
    end

    # Raised internally when the server returns HTTP 5xx.
    class ServerError < StandardError
      attr_reader :status

      def initialize(status)
        @status = status
        super("Server error HTTP #{status}")
      end
    end
  end
end
