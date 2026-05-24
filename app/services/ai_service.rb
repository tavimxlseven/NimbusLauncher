# frozen_string_literal: true

# AIService — namespace module for AI-powered modpack generation.
#
# This file defines the module namespace and its error classes.
# Requirements: 11.x, 12.x
module AIService
  # Raised when the AI cannot find enough mods (minimum 3) to satisfy the
  # user's description.  Carries optional alternative suggestions.
  # HTTP 422 — Requirement 11.7
  class InsufficientModsError < StandardError
    # @return [Array<String>] alternative descriptions or mod names suggested to the user
    attr_reader :suggestions

    # @param message     [String]       human-readable explanation
    # @param suggestions [Array<String>] optional list of alternative suggestions
    def initialize(message = "Mods insuficientes para a descrição fornecida.", suggestions: [])
      @suggestions = Array(suggestions)
      super(message)
    end
  end

  # Raised when irresolvable compatibility conflicts are detected among the
  # selected mods (version mismatch, loader conflict, known incompatibilities).
  # HTTP 422 — Requirement 11.3
  class CompatibilityError < StandardError
    # @return [Array<String>] names/IDs of the conflicting mods
    attr_reader :conflicting_mods

    # @param message         [String]       human-readable explanation
    # @param conflicting_mods [Array<String>] list of conflicting mod names or IDs
    def initialize(message = "Conflitos de compatibilidade irresolvíveis detectados.", conflicting_mods: [])
      @conflicting_mods = Array(conflicting_mods)
      super(message)
    end
  end
end
