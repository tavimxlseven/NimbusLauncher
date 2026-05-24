# frozen_string_literal: true

# Custom inflections for Zeitwerk autoloading.
#
# Zeitwerk uses ActiveSupport::Inflector.camelize to map file names to constant
# names. The AI acronym inflection ensures that app/services/ai_service.rb
# maps to AIService (not AiService). The API acronym is NOT registered because
# controller files use `module Api` (not `module API`).
ActiveSupport::Inflector.inflections(:en) do |inflect|
  inflect.acronym "AI"
end
