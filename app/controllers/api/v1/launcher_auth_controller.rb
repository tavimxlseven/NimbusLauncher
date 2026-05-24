# frozen_string_literal: true

module Api
  module V1
    # Launcher authentication via temporary token.
    #
    # Flow:
    #   1. Launcher opens nimbusgg.me/launcher/connect in the system browser
    #   2. User logs in with Discord (normal web flow)
    #   3. Site generates a LauncherToken and shows it to the user
    #   4. Launcher polls GET /api/v1/launcher/poll?token=XXX
    #   5. When token is found and valid, returns user info
    class LauncherAuthController < BaseController
      before_action :enforce_authentication!, only: [:generate]
      # GET /api/v1/launcher/poll?token=XXX
      # Called by the launcher to check if a token has been claimed.
      # On success, creates a long-lived LauncherSession (90d) and returns it.
      def poll
        token_str = params[:token].to_s.strip
        return render_error(errors: [{ message: "Token inválido", code: "invalid" }], status: :bad_request) if token_str.blank?

        token = LauncherToken.valid.find_by(token: token_str)

        if token.nil?
          return render json: { status: "pending" }, status: :ok
        end

        # Mark single-use launcher token as used and issue long-lived session.
        token.update!(used: true)
        user = token.user

        # Clean up old/expired sessions for this user (best-effort hygiene).
        LauncherSession.where(user: user).where("expires_at < ?", Time.current).delete_all

        session = LauncherSession.create!(user: user)

        render_success(data: {
          status:        "ok",
          id:            user.id,
          username:      user.username,
          avatar_url:    user.avatar_url,
          session_token: session.token,
          expires_at:    session.expires_at.iso8601,
        })
      end

      # POST /api/v1/launcher/generate
      # Called by the website (authenticated) to generate a launcher token.
      def generate
        # Clean up old tokens for this user
        LauncherToken.where(user: current_user).where("expires_at < ?", Time.current).delete_all

        token = LauncherToken.create!(user: current_user)
        render_success(data: { token: token.token, expires_in: 300 }, status: :created)
      end
    end
  end
end
