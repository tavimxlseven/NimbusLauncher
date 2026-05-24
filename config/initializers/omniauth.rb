# frozen_string_literal: true

# OmniAuth Discord configuration
# Requirements 2.1, 2.5

OmniAuth.config.allowed_request_methods = %i[post get]
OmniAuth.config.silence_get_warning     = true
OmniAuth.config.request_validation_phase = nil  # Disable omniauth-rails_csrf_protection

OmniAuth.config.logger = Logger.new($stdout).tap do |logger|
  logger.formatter = proc do |severity, _datetime, _progname, msg|
    sanitized = msg.to_s
                   .gsub(/access_token=[^\s&"]+/, "access_token=[FILTERED]")
                   .gsub(/token=[^\s&"]+/, "token=[FILTERED]")
    "OmniAuth [#{severity}] #{sanitized}\n"
  end
end

Rails.application.config.middleware.use OmniAuth::Builder do
  provider :discord,
           ENV.fetch("DISCORD_CLIENT_ID", "test_client_id"),
           ENV.fetch("DISCORD_CLIENT_SECRET", "test_client_secret"),
           scope: "identify email",
           # Disable OmniAuth's own state verification — we handle it manually
           # via the callback controller using the state stored in the session.
           provider_ignores_state: true
end
