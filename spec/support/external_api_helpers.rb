# frozen_string_literal: true

# Ensure ExternalAPI constants are loaded before specs reference them.
# In test mode, Zeitwerk does not eager-load, so we trigger autoloading by
# referencing the constants in a before(:each) hook that runs after Rails init.
RSpec.configure do |config|
  config.before(:each, type: :request) do
    # Touch the constants to trigger Zeitwerk autoloading before each request spec.
    # This is necessary because eager_load is disabled in the test environment.
    ExternalAPI::Client
    ExternalAPI::ServiceUnavailableError
    ExternalAPI::RateLimitError
  rescue NameError
    # If autoloading fails, try to load the files directly via their path
    load Rails.root.join("app/services/external_api.rb").to_s
    load Rails.root.join("app/services/external_api/client.rb").to_s
  end
end
