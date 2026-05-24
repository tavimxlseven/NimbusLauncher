# frozen_string_literal: true

# Ensure AIService and ManifestService constants are loaded before specs reference them.
# In test mode, Zeitwerk does not eager-load, so we trigger autoloading by
# referencing the constants in a before(:each) hook that runs after Rails init.
RSpec.configure do |config|
  config.before(:each, type: :service) do
    # ManifestService::Modpack and ModEntry are defined in value_objects.rb which
    # Zeitwerk does not autoload by name (the file defines multiple constants).
    # We must load it directly (bypassing Zeitwerk's require hook).
    load Rails.root.join("app/services/manifest_service/value_objects.rb").to_s unless defined?(ManifestService::Modpack)

    # Touch the remaining constants to trigger Zeitwerk autoloading.
    ManifestService::Parser
    ManifestService::Serializer
    ExternalAPI::Client
    ExternalAPI::ServiceUnavailableError
    AIService::ModpackGenerator
    AIService::GenerationResult
    AIService::InsufficientModsError
    AIService::CompatibilityError
  end
end
