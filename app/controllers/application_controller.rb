# frozen_string_literal: true

class ApplicationController < ActionController::API
  include ActionController::RequestForgeryProtection
  include ActionController::Cookies

  # CSRF protection for browser form submissions (OAuth auth routes).
  # API endpoints (under /api/) skip this via BaseController.
  protect_from_forgery with: :exception

  # ── Global rescue_from handlers ─────────────────────────────────────────────
  # All exceptions from the design's error mapping table are handled here so
  # that every controller in the application gets consistent error responses.
  # Requirements: 5.4, 5.5, 2.8
  #
  # SECURITY: ErrorSerializer never includes OAuth tokens, passwords, API keys,
  # session identifiers, or any other sensitive credential in its output.

  # HTTP 404 — resource not found
  rescue_from ActiveRecord::RecordNotFound do |e|
    render json: ErrorSerializer.record_not_found(e), status: :not_found
  end

  # HTTP 422 — model validation failed
  rescue_from ActiveRecord::RecordInvalid do |e|
    render json: ErrorSerializer.record_invalid(e), status: :unprocessable_entity
  end

  # HTTP 422 — CSRF token missing or invalid (Requirement 3.7)
  rescue_from ActionController::InvalidAuthenticityToken do |e|
    render json: ErrorSerializer.invalid_authenticity_token(e), status: :unprocessable_entity
  end

  # HTTP 422 — manifest field invalid
  rescue_from "ManifestService::ParseError" do |e|
    render json: ErrorSerializer.manifest_parse_error(e), status: :unprocessable_entity
  end

  # HTTP 422 — manifest format not supported
  rescue_from "ManifestService::UnsupportedFormatError" do |e|
    render json: ErrorSerializer.manifest_unsupported_format(e), status: :unprocessable_entity
  end

  # HTTP 503 — external API unavailable after all retries
  rescue_from "ExternalAPI::ServiceUnavailableError" do |e|
    render json: ErrorSerializer.service_unavailable(e), status: :service_unavailable
  end

  # HTTP 429 — external API rate-limited us; propagate Retry-After
  rescue_from "ExternalAPI::RateLimitError" do |e|
    response.set_header("Retry-After", e.retry_after.to_s)
    render json: ErrorSerializer.rate_limit_error(e), status: :too_many_requests
  end

  # HTTP 422 — AI could not find enough mods
  rescue_from "AIService::InsufficientModsError" do |e|
    render json: ErrorSerializer.insufficient_mods(e), status: :unprocessable_entity
  end

  # HTTP 422 — irresolvable mod compatibility conflicts
  rescue_from "AIService::CompatibilityError" do |e|
    render json: ErrorSerializer.compatibility_error(e), status: :unprocessable_entity
  end

  # HTTP 429 — Rack::Attack rate limit exceeded
  # Note: Rack::Attack normally short-circuits at the middleware level and never
  # reaches the controller.  This rescue_from handles the rare case where
  # Rack::Attack is configured to raise instead of returning a response directly.
  rescue_from "Rack::Attack::Throttled" do |e|
    retry_after = begin
      match_data = request.env["rack.attack.match_data"]
      if match_data
        now    = match_data[:epoch_time].to_i
        period = match_data[:period].to_i
        (period - (now % period)).ceil
      else
        60
      end
    end
    response.set_header("Retry-After", retry_after.to_s)
    render json: ErrorSerializer.throttled(e), status: :too_many_requests
  end

  before_action :require_authentication!

  private

  # Returns the currently authenticated user, or nil.
  # Checks both session presence and server-side expiry — Requirements 2.7, 2.9
  def current_user
    return @current_user if defined?(@current_user)

    @current_user = nil
    return nil unless session[:user_id] && session[:expires_at]

    # Check client-side session expiry first (fast path)
    return nil if session_expired?

    user = User.find_by(id: session[:user_id])
    return nil unless user

    # Check server-side expiry stored in DB — Requirement 2.9
    if user.session_expires_at.nil? || user.session_expires_at < Time.current
      reset_session
      return nil
    end

    @current_user = user
  end

  # Enforces authentication.
  # - API requests (Accept: application/json or /api/ path) → HTTP 401
  # - Page requests → redirect to login
  # Requirement 2.7
  def require_authentication!
    return if current_user

    if api_request?
      render json: { errors: [{ message: "Autenticação necessária", code: "unauthorized" }] },
             status: :unauthorized
    else
      session[:return_to] = request.fullpath
      redirect_to "/auth/discord", alert: "Faça login para continuar."
    end
  end

  # Returns true if the session has expired based on the client-side timestamp.
  def session_expired?
    return false unless session[:expires_at]

    Time.zone.parse(session[:expires_at]) < Time.current
  rescue ArgumentError
    true
  end

  # Determines whether the current request expects a JSON/API response.
  def api_request?
    request.path.start_with?("/api/") ||
      request.format.json? ||
      request.headers["Accept"]&.include?("application/json")
  end
end
