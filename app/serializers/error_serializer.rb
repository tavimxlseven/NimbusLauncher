# frozen_string_literal: true

# ErrorSerializer — converts exceptions into the standard API error response format.
#
# All responses follow the structure defined in the design:
#   { errors: [{ field:, message:, code: }] }
#
# Security: this serializer NEVER includes OAuth tokens, passwords, API keys,
# session identifiers, or any other sensitive credential in its output.
# Requirements: 5.4, 5.5, 2.8
class ErrorSerializer
  # ── ActiveRecord::RecordNotFound ─────────────────────────────────────────────
  # HTTP 404 — resource does not exist or is not accessible to the caller.
  def self.record_not_found(_exception = nil)
    {
      errors: [
        { message: "Recurso não encontrado", code: "not_found" }
      ]
    }
  end

  # ── ActiveRecord::RecordInvalid ──────────────────────────────────────────────
  # HTTP 422 — model validation failed; surfaces each validation error.
  def self.record_invalid(exception)
    errors = exception.record.errors.map do |error|
      { field: error.attribute.to_s, message: error.message, code: error.type.to_s }
    end
    { errors: errors }
  end

  # ── ManifestService::ParseError ──────────────────────────────────────────────
  # HTTP 422 — manifest field is invalid; includes field name and reason.
  def self.manifest_parse_error(exception)
    {
      errors: [
        {
          field:   exception.field.to_s,
          message: "Campo inválido: #{exception.reason}",
          code:    "manifest_parse_error"
        }
      ]
    }
  end

  # ── ManifestService::UnsupportedFormatError ──────────────────────────────────
  # HTTP 422 — format not supported; lists the supported formats.
  def self.manifest_unsupported_format(_exception = nil)
    supported = ManifestService::SUPPORTED_FORMATS.map(&:to_s).join(", ")
    {
      errors: [
        {
          message: "Formato não suportado. Formatos aceitos: #{supported}",
          code:    "unsupported_format"
        }
      ]
    }
  end

  # ── ExternalAPI::ServiceUnavailableError ─────────────────────────────────────
  # HTTP 503 — external service is down after all retries.
  def self.service_unavailable(exception)
    {
      errors: [
        {
          service: exception.service,
          message: "#{exception.service.capitalize} indisponível",
          code:    "service_unavailable"
        }
      ]
    }
  end

  # ── ExternalAPI::RateLimitError ──────────────────────────────────────────────
  # HTTP 429 — external API rate-limited us; propagates Retry-After.
  def self.rate_limit_error(exception)
    {
      errors: [
        {
          service:     exception.service,
          message:     "Rate limit atingido para #{exception.service}. Tente novamente em #{exception.retry_after} segundos.",
          code:        "rate_limited",
          retry_after: exception.retry_after
        }
      ]
    }
  end

  # ── AIService::InsufficientModsError ─────────────────────────────────────────
  # HTTP 422 — AI could not find enough mods; includes alternative suggestions.
  def self.insufficient_mods(exception)
    errors_payload = [
      {
        message: "Mods insuficientes encontrados para a descrição fornecida.",
        code:    "insufficient_mods"
      }
    ]

    if exception.respond_to?(:suggestions) && exception.suggestions.any?
      errors_payload.first[:suggestions] = exception.suggestions
    end

    { errors: errors_payload }
  end

  # ── AIService::CompatibilityError ────────────────────────────────────────────
  # HTTP 422 — irresolvable mod conflicts detected; lists conflicting mods.
  def self.compatibility_error(exception)
    errors_payload = [
      {
        message: "Conflitos de compatibilidade irresolvíveis detectados.",
        code:    "compatibility_error"
      }
    ]

    if exception.respond_to?(:conflicting_mods) && exception.conflicting_mods.any?
      errors_payload.first[:conflicting_mods] = exception.conflicting_mods
    end

    { errors: errors_payload }
  end

  # ── Rack::Attack::Throttled ──────────────────────────────────────────────────
  # HTTP 429 — IP exceeded the rate limit configured in Rack::Attack.
  # The Retry-After value is calculated from the match data.
  def self.throttled(exception)
    retry_after = extract_retry_after(exception)
    {
      errors: [
        {
          message:     "Muitas requisições. Tente novamente em #{retry_after} segundos.",
          code:        "rate_limited",
          retry_after: retry_after
        }
      ]
    }
  end

  # ── ActionController::InvalidAuthenticityToken ───────────────────────────────
  # HTTP 422 — CSRF token missing or invalid.
  def self.invalid_authenticity_token(_exception = nil)
    {
      errors: [
        { message: "Token CSRF inválido ou ausente.", code: "invalid_csrf_token" }
      ]
    }
  end

  # ── Generic / unexpected errors ──────────────────────────────────────────────
  # HTTP 500 — catch-all; never leaks internal details to the client.
  def self.internal_server_error(_exception = nil)
    {
      errors: [
        { message: "Erro interno do servidor.", code: "internal_server_error" }
      ]
    }
  end

  # ── Private helpers ──────────────────────────────────────────────────────────

  def self.extract_retry_after(exception)
    # Rack::Attack::Throttled carries match_data with :epoch_time and :period
    if exception.respond_to?(:request) && exception.request.respond_to?(:env)
      match_data = exception.request.env["rack.attack.match_data"]
      if match_data
        now    = match_data[:epoch_time].to_i
        period = match_data[:period].to_i
        return (period - (now % period)).ceil
      end
    end
    60 # safe default
  end
  private_class_method :extract_retry_after
end
