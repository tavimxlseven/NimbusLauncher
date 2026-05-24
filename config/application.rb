# frozen_string_literal: true

require_relative "boot"

require "rails"
# Pick the frameworks you want:
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "action_controller/railtie"
require "action_view/railtie"
# require "active_storage/engine"   # not needed for API-only
# require "action_mailer/railtie"   # not needed
# require "action_mailbox/engine"   # not needed
# require "action_text/engine"      # not needed
# require "action_cable/engine"     # not needed
# require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module NimbusLauncher
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `tasks`.
    config.autoload_lib(ignore: %w[assets tasks])

    # Services with acronym names (ExternalAPI, AIService) are not auto-mapped
    # by Zeitwerk. Add them to autoload_paths so Rails finds them on demand.
    config.autoload_paths += [Rails.root.join("app/services")]

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true

    # Security HTTP headers — Requirements 3.5, 3.6
    # In development, relax CSP to allow the Vite dev server and cross-origin auth.
    csp = if Rails.env.development?
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " \
      "form-action *;"
    else
      "default-src 'self'; " \
      "script-src 'self'; " \
      "style-src 'self' 'unsafe-inline'; " \
      "img-src 'self' data: https://cdn.discordapp.com; " \
      "connect-src 'self'; " \
      "font-src 'self'; " \
      "object-src 'none'; " \
      "frame-ancestors 'none'; " \
      "base-uri 'self'; " \
      "form-action 'self';"
    end

    config.action_dispatch.default_headers = {
      "X-Frame-Options"         => "DENY",
      "X-Content-Type-Options"  => "nosniff",
      "X-XSS-Protection"        => "0",
      "Referrer-Policy"         => "strict-origin-when-cross-origin",
      "Content-Security-Policy" => csp,
    }

    # Add session middleware back for OAuth Discord authentication — Requirement 2.1
    # The API is api_only but OAuth requires cookie-based sessions for state validation
    config.middleware.use ActionDispatch::Cookies

    # Session cookie — in development, set domain to 'localhost' (no port) so the
    # cookie is shared between Rails on :3000 and Vite on :5173. Browsers treat
    # localhost ports as the same site when the domain attribute is set to 'localhost'.
    # SameSite must be nil (omitted) to allow cross-port sharing.
    session_same_site = Rails.env.development? ? nil : :lax
    session_domain    = Rails.env.development? ? 'localhost' : nil

    config.middleware.use ActionDispatch::Session::CookieStore,
                          key: "_nimbus_session",
                          expire_after: 30.days,
                          httponly: true,
                          same_site: session_same_site,
                          domain: session_domain
    config.middleware.use ActionDispatch::Flash

    # Rate limiting middleware — Requirements 3.2, 3.3
    # Rack::Attack must be inserted after the session middleware so that
    # request.ip is available and the throttle responder can read match data.
    config.middleware.use Rack::Attack
  end
end
