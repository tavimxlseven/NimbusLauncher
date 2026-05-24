# frozen_string_literal: true

# OAuth Discord authentication controller
# Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9

class AuthController < ApplicationController
  # All auth actions are publicly accessible — authentication is the goal here
  skip_before_action :require_authentication!

  # Skip CSRF on auth callback and on launcher endpoints — these are entered
  # from external redirects (Discord) or via the launcher's deep link, and
  # rely on session/state for security rather than form CSRF tokens.
  skip_before_action :verify_authenticity_token, only: %i[discord_callback launcher_login]

  # GET /auth/launcher
  # Single entry point for the Electron launcher.
  #
  # If the user is logged in: generate a LauncherToken and redirect the browser
  # to nimbus://auth?token=XXX so the OS opens the launcher.
  #
  # If the user is not logged in: store an intent flag in the session and
  # redirect to /auth/discord. After the OAuth callback runs, the controller
  # detects the flag and bounces back here, completing the flow automatically.
  def launcher_login
    if current_user
      token = LauncherToken.create!(user: current_user)
      LauncherToken.where(user: current_user).where("expires_at < ?", Time.current).delete_all
      render_launcher_handoff(token.token)
    else
      session[:launcher_login] = true
      redirect_to "/auth/discord"
    end
  end

  # GET /auth/discord/callback
  # Handles the OAuth callback from Discord.
  # Validates state, exchanges code for token, creates/updates User, starts session.
  # Requirements 2.2, 2.3, 2.5
  def discord_callback
    auth = request.env["omniauth.auth"]

    if auth.nil?
      redirect_to "#{frontend_base}/?error=auth_failed", allow_other_host: true
      return
    end

    # Validate OAuth state to prevent CSRF attacks on the callback.
    # OmniAuth stores the state in the session; we verify it matches.
    omniauth_state   = request.env["omniauth.params"]&.dig("state") ||
                       params[:state]
    session_state    = session.delete(:omniauth_state)
    if session_state.present? && omniauth_state != session_state
      redirect_to "#{frontend_base}/?error=auth_failed", allow_other_host: true
      return
    end

    user = User.find_or_initialize_by(discord_uid: auth.uid)
    user.username   = auth.info.name.to_s.truncate(32)
    user.avatar_url = auth.info.image
    user.save!

    expires_at = 30.days.from_now
    user.update_column(:session_expires_at, expires_at)

    launcher_intent = session.delete(:launcher_login)

    reset_session
    session[:user_id]    = user.id
    session[:expires_at] = expires_at.iso8601
    session[:launcher_login] = true if launcher_intent

    if launcher_intent
      # Re-enter the launcher flow, now authenticated
      redirect_to "/auth/launcher"
    else
      redirect_to "#{frontend_base}/", allow_other_host: true
    end
  rescue ActiveRecord::RecordInvalid => e
    redirect_to "#{frontend_base}/", allow_other_host: true,
                alert: "Erro ao criar conta: #{e.record.errors.full_messages.join(', ')}"
  end

  def failure
    message = params[:message].presence || "unknown"
    redirect_to "#{frontend_base}/", allow_other_host: true, alert: discord_failure_message(message)
  end

  # DELETE /auth/logout
  # Invalidates the server-side session token and redirects to root.
  # Requirement 2.6
  def destroy
    if (user = current_user)
      # Invalidate server-side session by clearing the expiry — Requirement 2.6
      user.update_column(:session_expires_at, nil)
    end

    reset_session
    redirect_to "/", status: :see_other
  end

  private

  # Renders an HTML page that:
  # 1. Immediately tries to open `nimbus://auth?token=XXX` to launch the app
  # 2. Shows the token plainly so the user can paste it manually as a fallback
  def render_launcher_handoff(token)
    deep_link = "nimbus://auth?token=#{ERB::Util.url_encode(token)}"
    safe_token = ERB::Util.html_escape(token)
    safe_link  = ERB::Util.html_escape(deep_link)

    # Strict CSP for this page — no external resources, inline scripts only
    response.set_header(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self'; connect-src 'none'"
    )
    # Prevent this page from being framed
    response.set_header("X-Frame-Options", "DENY")

    html = <<~HTML
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Nimbus Launcher — Conectar</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" type="image/png" href="/favicon.png" />
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background: #080c12; color: #e6edf3;
              display: flex; align-items: center; justify-content: center; padding: 24px;
            }
            .card {
              max-width: 460px; width: 100%; padding: 40px 36px;
              background: rgba(255,255,255,0.055);
              backdrop-filter: blur(40px) saturate(200%);
              -webkit-backdrop-filter: blur(40px) saturate(200%);
              border: 1px solid rgba(255,255,255,0.08);
              border-radius: 22px;
              box-shadow: 0 32px 80px rgba(0,0,0,0.5);
              text-align: center;
            }
            .icon {
              width: 128px; height: 128px; margin: 0 auto 18px;
              border-radius: 24px;
              background: #0e1218;
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 8px 32px rgba(27,217,106,0.34);
              overflow: hidden;
            }
            .icon img { width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
            h1 { margin: 0 0 8px; font-size: 22px; font-weight: 800; }
            p  { margin: 0 0 18px; font-size: 14px; color: #97a4b3; }
            .tok {
              background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.08);
              border-radius: 10px; padding: 14px 16px;
              font-family: 'SF Mono', Menlo, monospace; font-size: 13px;
              color: #e6edf3; letter-spacing: 0.05em;
              word-break: break-all; margin: 18px 0 14px;
            }
            .btn {
              display: inline-block; width: 100%; padding: 12px;
              border-radius: 12px; border: none; cursor: pointer;
              font-family: inherit; font-size: 14px; font-weight: 700;
              background: #1bd96a; color: #fff; text-decoration: none;
              transition: opacity 150ms;
            }
            .btn:hover { opacity: 0.9; }
            .btn-ghost {
              background: transparent; border: 1px solid rgba(255,255,255,0.08);
              color: #97a4b3; margin-top: 10px;
            }
            .small { font-size: 12px; color: #6b7785; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon"><img src="/nimbus-mark-128.png" alt="Nimbus" /></div>
            <h1>Conectando ao Launcher</h1>
            <p>Se o launcher não abrir automaticamente, copie o token abaixo e cole no aplicativo.</p>
            <div class="tok" id="tok">#{safe_token}</div>
            <a class="btn" href="#{safe_link}">Abrir Nimbus Launcher</a>
            <button class="btn btn-ghost" onclick="copyTok()">Copiar token</button>
            <p class="small">Token válido por 5 minutos. Esta janela pode ser fechada.</p>
          </div>
          <script>
            // Auto-trigger the deep link
            setTimeout(function() { window.location.href = #{deep_link.to_json}; }, 400);
            function copyTok() {
              var t = document.getElementById('tok').textContent.trim();
              navigator.clipboard.writeText(t);
            }
          </script>
        </body>
      </html>
    HTML
    render html: html.html_safe, layout: false
  end

  # Returns the frontend base URL depending on environment.
  # In development: Vite dev server at :5173
  # In production: same origin as Rails (Nginx serves both)
  def frontend_base
    if Rails.env.development?
      "http://localhost:5173"
    elsif ENV["APP_HOST"].present?
      "https://#{ENV['APP_HOST']}"
    else
      "" # same origin
    end
  end

  # Translates OmniAuth error codes into human-readable Portuguese messages
  def discord_failure_message(code)
    case code
    when "access_denied"
      "Autorização negada pelo Discord."
    when "csrf_detected"
      "Erro de segurança detectado. Por favor, tente novamente."
    when "invalid_credentials"
      "Credenciais inválidas. Verifique a configuração do aplicativo Discord."
    when "timeout"
      "A autenticação expirou. Por favor, tente novamente."
    else
      "Autorização negada pelo Discord: #{code.humanize}."
    end
  end
end
