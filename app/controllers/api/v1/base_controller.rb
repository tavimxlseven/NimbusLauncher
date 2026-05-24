# frozen_string_literal: true

module Api
  module V1
    class BaseController < ApplicationController
      # API endpoints don't use browser form submissions — skip CSRF.
      # Security is provided by the session cookie (httponly) + CORS headers.
      protect_from_forgery with: :null_session

      # Mods and modpacks (index/show) are public — override require_authentication!
      # to be a no-op for this controller and its subclasses.
      # Subclasses that need authentication (e.g. manifest) re-enable it via
      # before_action :enforce_authentication!, only: [:manifest].
      def require_authentication!
        # Public by default in API v1 base — subclasses opt in to auth.
      end

      # current_user override that also accepts a Bearer launcher session token.
      # The web app uses session cookies (handled by ApplicationController);
      # the Electron launcher uses Authorization: Bearer nlsk_...
      def current_user
        return @current_user if defined?(@current_user) && @current_user

        @current_user = super_current_user

        if @current_user.nil? && (token = bearer_token).present?
          ls = LauncherSession.active.find_by(token: token)
          if ls
            ls.touch_usage!
            @current_user = ls.user
          end
        end

        @current_user
      end

      private

      # Enforce authentication for actions that require it.
      # Call this from subclass before_action hooks for protected endpoints.
      #
      # Accepts EITHER:
      #   - a session cookie (web app); OR
      #   - an `Authorization: Bearer <launcher_session_token>` header
      #     issued via /api/v1/launcher/poll (Electron launcher).
      def enforce_authentication!
        return if current_user

        render_error(
          errors: [{ message: "Autenticação necessária", code: "unauthorized" }],
          status: :unauthorized
        )
      end

      def bearer_token
        auth = request.headers["Authorization"].to_s
        return nil unless auth.start_with?("Bearer ")

        auth.sub(/^Bearer\s+/i, "").strip
      end

      def super_current_user
        ApplicationController.instance_method(:current_user).bind(self).call
      end

      # -----------------------------------------------------------------------
      # Rescue handlers — Requirement 5.4
      # -----------------------------------------------------------------------

      rescue_from ActiveRecord::RecordNotFound do |_e|
        render_error(
          errors: [{ message: "Recurso não encontrado", code: "not_found" }],
          status: :not_found
        )
      end

      rescue_from ActiveRecord::RecordInvalid do |e|
        errors = e.record.errors.map do |error|
          { field: error.attribute, message: error.message, code: error.type }
        end
        render_error(errors: errors, status: :unprocessable_entity)
      end

      rescue_from ActionController::InvalidAuthenticityToken do
        render_error(
          errors: [{ message: "Token CSRF inválido", code: "invalid_csrf_token" }],
          status: :unprocessable_entity
        )
      end

      rescue_from "ExternalAPI::ServiceUnavailableError" do |e|
        render_error(
          errors: [{ service: e.service, message: "#{e.service.capitalize} indisponível", code: "service_unavailable" }],
          status: :service_unavailable
        )
      end

      rescue_from "ExternalAPI::RateLimitError" do |e|
        response.set_header("Retry-After", e.retry_after.to_s)
        render_error(
          errors: [{ service: e.service, message: "Rate limit atingido para #{e.service}", code: "rate_limited" }],
          status: :too_many_requests
        )
      end

      # -----------------------------------------------------------------------
      # Response helpers — Requirement 5.4
      # -----------------------------------------------------------------------

      # Render a successful JSON response.
      #
      # @param data   [Object]      the payload (Hash, Array, etc.)
      # @param meta   [Hash, nil]   pagination/metadata; omitted when nil
      # @param status [Symbol, Integer] HTTP status (default :ok)
      def render_success(data:, meta: nil, status: :ok)
        body = { data: data }
        body[:meta] = meta if meta
        render json: body, status: status
      end

      # Render an error JSON response.
      #
      # @param errors [Array<Hash>] list of error objects
      # @param status [Symbol, Integer] HTTP status
      def render_error(errors:, status:)
        render json: { errors: Array(errors) }, status: status
      end

      # Build a pagination meta hash.
      #
      # @param page        [Integer] current page (1-based)
      # @param per_page    [Integer] items per page
      # @param total       [Integer] total number of items
      # @return [Hash]
      def pagination_meta(page:, per_page:, total:)
        total_pages = (total.to_f / per_page).ceil
        total_pages = 1 if total_pages < 1

        {
          page:        page,
          per_page:    per_page,
          total:       total,
          total_pages: total_pages
        }
      end
    end
  end
end
