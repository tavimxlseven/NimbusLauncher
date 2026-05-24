# frozen_string_literal: true

# ExternalAPI — namespace module for CurseForge and Modrinth API integrations.
#
# Provides a unified client with:
#   - Automatic response caching (TTL 1–60 min, default 5 min)
#   - Exponential-backoff retry on HTTP 5xx / timeout (2s, 4s, 8s)
#   - HTTP 429 handling with Retry-After support (default 60s)
#   - Structured logging per external call (service, endpoint, latency_ms, status)
#
# Error classes:
#   ExternalAPI::ServiceUnavailableError — raised after 3 consecutive failures
#   ExternalAPI::RateLimitError          — raised on HTTP 429 (propagated to controller)
module ExternalAPI
  # Raised when all retry attempts for an external API call have been exhausted.
  # Carries the name of the affected service so callers can surface it to the client.
  class ServiceUnavailableError < StandardError
    attr_reader :service

    # @param service [String, Symbol] name of the unavailable service (e.g. "curseforge")
    def initialize(service)
      @service = service.to_s
      super("External service unavailable: #{@service}")
    end
  end

  # Raised when the external API responds with HTTP 429 (Too Many Requests).
  # Carries the retry_after value so the controller can propagate it to the client.
  class RateLimitError < StandardError
    attr_reader :service, :retry_after

    # @param service    [String, Symbol] name of the rate-limited service
    # @param retry_after [Integer]       seconds to wait before retrying (from Retry-After header)
    def initialize(service, retry_after:)
      @service     = service.to_s
      @retry_after = retry_after
      super("Rate limit exceeded for #{@service}. Retry after #{@retry_after}s")
    end
  end
end
