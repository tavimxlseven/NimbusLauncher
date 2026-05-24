# frozen_string_literal: true

# Security HTTP headers — Requirements 3.5, 3.6
#
# The core security headers (X-Frame-Options, X-Content-Type-Options, CSP, etc.)
# are configured in config/application.rb via config.action_dispatch.default_headers
# so they are applied before ActionDispatch::Response.default_headers is frozen.
#
# This initializer only adds the HSTS header in production, which must be done
# after_initialize because it depends on the environment check.

# ── HSTS — production only (Requirement 3.6) ─────────────────────────────────
# Strict-Transport-Security instructs browsers to only connect via HTTPS for
# the next year, including all subdomains.
Rails.application.config.after_initialize do
  if Rails.env.production?
    ActionDispatch::Response.default_headers.merge!(
      "Strict-Transport-Security" => "max-age=31536000; includeSubDomains"
    )
  end
end
