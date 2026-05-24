# frozen_string_literal: true

# Load services with acronym-based constant names explicitly.
# Zeitwerk cannot auto-map ExternalAPI → external_api.rb or
# AIService → ai_service.rb because it uses standard CamelCase rules
# (ExternalApi, AiService). We load them here so the constants are
# available when controllers are first compiled.

[
  "app/services/external_api.rb",
  "app/services/external_api/client.rb",
  "app/services/manifest_service.rb",
  "app/services/manifest_service/value_objects.rb",
  "app/services/manifest_service/parser.rb",
  "app/services/manifest_service/serializer.rb",
  "app/services/ai_service.rb",
  "app/services/ai_service/modpack_generator.rb",
].each do |relative_path|
  path = Rails.root.join(relative_path).to_s
  load path unless $LOADED_FEATURES.include?(path)
end
