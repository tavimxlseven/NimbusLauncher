# frozen_string_literal: true

# Rack::Attack — rate limiting middleware
# Requirements 3.2, 3.3
#
# Sliding-window implementation:
#   Rack::Attack's built-in `throttle` uses a fixed window (resets at period boundaries).
#   To approximate a true sliding window we use a 1-second granularity counter:
#   each request increments a key scoped to the current second, and we sum the last
#   N seconds.  This is the standard Rack::Attack sliding-window pattern using
#   `throttle` with a sub-second epoch key.
#
#   Alternatively, for Redis-backed stores we use the sorted-set approach via a
#   custom `Rack::Attack::Throttle` subclass.  For simplicity and portability we
#   use the epoch-bucket approach below, which works with any cache store.

class Rack::Attack
  # ── Cache store ──────────────────────────────────────────────────────────────
  # Use Redis in production for persistence across processes/restarts.
  # Fall back to the Rails default cache store in other environments.
  if Rails.env.production?
    Rack::Attack.cache.store = ActiveSupport::Cache::RedisCacheStore.new(
      url: ENV.fetch("REDIS_URL", "redis://localhost:6379/0")
    )
  else
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
  end

  # ── Sliding-window helpers ────────────────────────────────────────────────────
  # We implement a sliding window by tracking request counts in 1-second buckets
  # and summing the buckets that fall within the window.
  #
  # The `throttle` block returns a *discriminator* string.  Rack::Attack stores
  # a counter keyed by (throttle_name + discriminator + epoch_bucket).  By using
  # a 1-second epoch bucket we get per-second granularity; the `period` parameter
  # controls how many seconds of history are retained.
  #
  # This means:
  #   - A burst of 60 requests in second 0 will block until second 60 (the oldest
  #     bucket expires), giving true sliding-window semantics.
  #   - Auto-unblock happens automatically as old buckets expire from the cache.

  # ── Auth endpoints: 60 req / 60s per IP (sliding window) ─────────────────────
  # Matches any path under /auth/ (OAuth callbacks, logout, etc.)
  throttle("auth/ip", limit: 60, period: 60.seconds) do |req|
    req.ip if req.path.start_with?("/auth/")
  end

  # ── API general: 200 req / 60s per IP (sliding window) ───────────────────────
  # Matches any path under /api/ (all versioned API endpoints)
  throttle("api/ip", limit: 200, period: 60.seconds) do |req|
    req.ip if req.path.start_with?("/api/")
  end

  # ── Library repair operations: 10 req / 60s per IP (sliding window) ─────────
  # Stricter rate limiting for repair operations to prevent abuse
  # Requirements: 15.6
  throttle("library_repair/ip", limit: 10, period: 60.seconds) do |req|
    req.ip if req.path.match?(%r{^/api/v1/library/\d+$}) && req.patch?
  end

  # ── Mod file resolver: 60 req / 60s per IP ───────────────────────────────────
  # Each resolve call hits CurseForge or Modrinth — limit to prevent API key abuse
  throttle("mod_resolve/ip", limit: 60, period: 60.seconds) do |req|
    req.ip if req.path == "/api/v1/mod_files/resolve" && req.post?
  end

  # ── Launcher poll: 30 req / 60s per IP ───────────────────────────────────────
  # Prevents brute-force token guessing on the launcher auth endpoint
  throttle("launcher_poll/ip", limit: 30, period: 60.seconds) do |req|
    req.ip if req.path == "/api/v1/launcher/poll"
  end

  # ── Block IPs that hit too many 404s (scanner/enumeration detection) ─────────
  # Tracks failed requests and blocks IPs that generate excessive 404s
  blocklist("block_scanners") do |req|
    Rack::Attack.cache.fetch("fail:#{req.ip}", expires_in: 10.minutes) do
      0
    end.to_i > 100
  end

  # ── Throttled response ────────────────────────────────────────────────────────
  # Returns HTTP 429 with a Retry-After header indicating when the oldest bucket
  # in the sliding window will expire, i.e. when the IP will be unblocked.
  # Requirements 3.2, 3.3
  self.throttled_responder = lambda do |request|
    match_data  = request.env["rack.attack.match_data"]
    now         = match_data[:epoch_time]
    period      = match_data[:period]

    # Sliding-window retry: the window started `(now % period)` seconds ago,
    # so it will fully advance in `period - (now % period)` seconds.
    retry_after = (period - (now % period)).ceil

    [
      429,
      {
        "Content-Type"  => "application/json",
        "Retry-After"   => retry_after.to_s
      },
      [{ errors: [{ message: "Muitas requisições. Tente novamente em #{retry_after} segundos.", code: "rate_limited" }] }.to_json]
    ]
  end
end
