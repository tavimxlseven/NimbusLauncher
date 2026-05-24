# frozen_string_literal: true

# ManifestService — namespace module for parsing and serializing modpack manifests.
#
# Supported formats:
#   :curseforge  — manifest.json (CurseForge modpack format)
#   :modrinth    — modrinth.index.json (Modrinth modpack format)
module ManifestService
  SUPPORTED_FORMATS = %i[curseforge modrinth].freeze

  # Raised when a manifest cannot be parsed due to a missing, wrong-typed,
  # or out-of-domain field.
  class ParseError < StandardError
    attr_reader :field, :value, :reason

    def initialize(field:, value:, reason:)
      @field  = field
      @value  = value
      @reason = reason
      super("ManifestParseError — field: #{field.inspect}, value: #{value.inspect}, reason: #{reason}")
    end
  end

  # Raised when the serializer receives an unsupported target format.
  class UnsupportedFormatError < StandardError
    def initialize(format)
      super("Unsupported format #{format.inspect}. Supported formats: #{SUPPORTED_FORMATS.map(&:inspect).join(', ')}")
    end
  end
end
