# frozen_string_literal: true

# Filter sensitive parameters from Rails logs.
#
# These parameters will be replaced with "[FILTERED]" in all log output,
# ensuring that OAuth tokens, passwords, API keys, and session identifiers
# are never written to log files or log aggregation services.
#
# Requirements: 5.5, 2.8
Rails.application.config.filter_parameters += %i[
  password
  password_confirmation
  token
  access_token
  refresh_token
  api_key
  session_id
  csrf_token
  secret
  authorization
  auth_token
  oauth_token
  client_secret
]
