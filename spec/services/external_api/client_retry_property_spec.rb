# frozen_string_literal: true

# Feature: minecraft-launcher-platform, Property 13: Retry com backoff exponencial
#
# Validates: Requirements 14.2, 14.3
#
# Property 13: Comportamento de retry com backoff exponencial para APIs externas — 100 iterações
#
# Para qualquer falha de API externa (HTTP 5xx ou timeout), o Backend_API deve realizar
# exatamente 3 retries com intervalos de 2s, 4s e 8s (backoff exponencial de base 2);
# para qualquer resposta HTTP 429 com cabeçalho Retry-After, o Backend_API deve aguardar
# exatamente o tempo indicado antes de retentar; se o cabeçalho estiver ausente, deve
# aguardar 60 segundos.

require "rails_helper"
require "rantly/property"

load Rails.root.join("app/services/external_api.rb").to_s unless defined?(ExternalAPI)
load Rails.root.join("app/services/external_api/client.rb").to_s unless defined?(ExternalAPI::Client)

RSpec.describe ExternalAPI::Client, type: :service do
  # Silence logger noise
  before do
    allow(Rails.logger).to receive(:info)
    allow(Rails.logger).to receive(:warn)
    allow(Rails.logger).to receive(:error)
  end

  # Bypass cache so every call hits the HTTP layer
  before do
    allow(Rails.cache).to receive(:fetch) do |_key, **_opts, &block|
      block.call
    end
  end

  def property_of(&block)
    Rantly::Property.new(block)
  end

  # Valid HTTP 5xx status codes
  SERVER_ERROR_CODES = [500, 502, 503, 504].freeze

  # Expected backoff sequence (seconds)
  EXPECTED_BACKOFF = ExternalAPI::Client::BACKOFF_SECONDS.freeze  # [2, 4, 8]

  # Default wait when Retry-After is absent
  DEFAULT_RETRY_WAIT = ExternalAPI::Client::DEFAULT_RETRY_WAIT  # 60

  # Maximum retries before giving up
  MAX_RETRIES = ExternalAPI::Client::MAX_RETRIES  # 3

  # -------------------------------------------------------------------------
  # Helpers — build fake Net::HTTPResponse objects
  # -------------------------------------------------------------------------

  def fake_response(code, body = "", headers = {})
    response = instance_double(Net::HTTPResponse)
    allow(response).to receive(:code).and_return(code.to_s)
    allow(response).to receive(:body).and_return(body)
    allow(response).to receive(:[]) do |key|
      headers[key] || headers[key.to_s.downcase]
    end
    response
  end

  def ok_response
    fake_response(200, '{"data":[]}', { "Content-Type" => "application/json" })
  end

  def server_error_response(code)
    fake_response(code, "Error #{code}")
  end

  def rate_limit_response(retry_after: nil)
    headers = retry_after ? { "Retry-After" => retry_after.to_s } : {}
    fake_response(429, "", headers)
  end

  # Build a Net::HTTP double and inject it via Net::HTTP.new stub.
  def build_http_double
    http = instance_double(Net::HTTP)
    allow(http).to receive(:use_ssl=)
    allow(http).to receive(:open_timeout=)
    allow(http).to receive(:read_timeout=)
    http
  end

  # Stub http.request to return a sequence of responses.
  def stub_http_sequence(http_double, responses)
    call_count = 0
    allow(http_double).to receive(:request) do
      resp = responses[call_count] || responses.last
      call_count += 1
      resp
    end
  end

  # Build a client for the given source and capture sleep calls.
  def build_client_with_sleep_capture(source)
    client = described_class.new(source: source)
    sleep_calls = []
    allow(client).to receive(:sleep) { |n| sleep_calls << n }
    [client, sleep_calls]
  end

  # -------------------------------------------------------------------------
  # P13-A: Para qualquer HTTP 5xx, retenta exatamente 3 vezes com 2s, 4s, 8s
  # -------------------------------------------------------------------------

  describe "P13-A: backoff exponencial em HTTP 5xx — 100 iterações (Req 14.3)" do
    it "para qualquer código 5xx, realiza exatamente 3 retries com intervalos 2s, 4s, 8s" do
      property_of {
        source     = choose(:curseforge, :modrinth)
        error_code = choose(*SERVER_ERROR_CODES)
        [source, error_code]
      }.check(10) do |(source, error_code)|
        http = build_http_double
        # All 4 requests (initial + 3 retries) return the error code
        responses = Array.new(MAX_RETRIES + 1) { server_error_response(error_code) }
        stub_http_sequence(http, responses)
        allow(Net::HTTP).to receive(:new).and_return(http)

        client, sleep_calls = build_client_with_sleep_capture(source)

        expect {
          client.search(query: "test")
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq(source.to_s),
            "ServiceUnavailableError deve identificar o serviço '#{source}'"
        end

        expect(sleep_calls).to eq(EXPECTED_BACKOFF),
          "Para HTTP #{error_code} em #{source}: esperado backoff #{EXPECTED_BACKOFF.inspect}, " \
          "obtido #{sleep_calls.inspect}"
      end
    end

    it "para qualquer código 5xx, retenta e retorna sucesso se a última tentativa for bem-sucedida" do
      property_of {
        source     = choose(:curseforge, :modrinth)
        error_code = choose(*SERVER_ERROR_CODES)
        # Number of failures before success: 1, 2, or 3
        failures   = integer(1..MAX_RETRIES)
        [source, error_code, failures]
      }.check(10) do |(source, error_code, failures)|
        http = build_http_double
        error_responses = Array.new(failures) { server_error_response(error_code) }
        stub_http_sequence(http, error_responses + [ok_response])
        allow(Net::HTTP).to receive(:new).and_return(http)

        client, sleep_calls = build_client_with_sleep_capture(source)

        result = client.search(query: "test")
        expect(result).to be_a(Hash),
          "Esperado Hash como resultado após #{failures} falha(s) e sucesso"

        expected_sleeps = EXPECTED_BACKOFF.first(failures)
        expect(sleep_calls).to eq(expected_sleeps),
          "Para #{failures} falha(s) com HTTP #{error_code}: " \
          "esperado backoff #{expected_sleeps.inspect}, obtido #{sleep_calls.inspect}"
      end
    end
  end

  # -------------------------------------------------------------------------
  # P13-B: Para qualquer HTTP 429 com Retry-After, aguarda exatamente esse tempo
  # -------------------------------------------------------------------------

  describe "P13-B: aguarda Retry-After exato em HTTP 429 — 100 iterações (Req 14.2)" do
    it "para qualquer valor de Retry-After, aguarda exatamente esse número de segundos" do
      property_of {
        source      = choose(:curseforge, :modrinth)
        retry_after = integer(1..300)
        [source, retry_after]
      }.check(10) do |(source, retry_after)|
        http = build_http_double
        stub_http_sequence(http, [
          rate_limit_response(retry_after: retry_after),
          ok_response
        ])
        allow(Net::HTTP).to receive(:new).and_return(http)

        client, sleep_calls = build_client_with_sleep_capture(source)

        result = client.search(query: "test")
        expect(result).to be_a(Hash),
          "Esperado resultado bem-sucedido após aguardar Retry-After"

        expect(sleep_calls).to eq([retry_after]),
          "Para Retry-After: #{retry_after}s em #{source}: " \
          "esperado sleep [#{retry_after}], obtido #{sleep_calls.inspect}"
      end
    end

    it "para HTTP 429 com Retry-After em todas as tentativas, levanta ServiceUnavailableError" do
      property_of {
        source      = choose(:curseforge, :modrinth)
        retry_after = integer(1..120)
        [source, retry_after]
      }.check(10) do |(source, retry_after)|
        http = build_http_double
        responses = Array.new(MAX_RETRIES + 1) { rate_limit_response(retry_after: retry_after) }
        stub_http_sequence(http, responses)
        allow(Net::HTTP).to receive(:new).and_return(http)

        client, sleep_calls = build_client_with_sleep_capture(source)

        expect {
          client.search(query: "test")
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq(source.to_s)
        end

        # Should have slept exactly MAX_RETRIES times with the Retry-After value
        expect(sleep_calls.size).to eq(MAX_RETRIES),
          "Esperado #{MAX_RETRIES} sleeps, obtido #{sleep_calls.size}"
        expect(sleep_calls).to all(eq(retry_after)),
          "Todos os sleeps devem ser #{retry_after}s, obtido #{sleep_calls.inspect}"
      end
    end
  end

  # -------------------------------------------------------------------------
  # P13-C: Para HTTP 429 sem Retry-After, aguarda 60s (padrão)
  # -------------------------------------------------------------------------

  describe "P13-C: aguarda 60s padrão quando Retry-After está ausente — 100 iterações (Req 14.2)" do
    it "para qualquer fonte, aguarda exatamente 60s quando Retry-After está ausente" do
      property_of {
        source = choose(:curseforge, :modrinth)
        source
      }.check(10) do |source|
        http = build_http_double
        stub_http_sequence(http, [
          rate_limit_response(retry_after: nil),
          ok_response
        ])
        allow(Net::HTTP).to receive(:new).and_return(http)

        client, sleep_calls = build_client_with_sleep_capture(source)

        result = client.search(query: "test")
        expect(result).to be_a(Hash)

        expect(sleep_calls).to eq([DEFAULT_RETRY_WAIT]),
          "Para 429 sem Retry-After em #{source}: " \
          "esperado sleep [#{DEFAULT_RETRY_WAIT}], obtido #{sleep_calls.inspect}"
      end
    end
  end

  # -------------------------------------------------------------------------
  # P13-D: Após MAX_RETRIES falhas, levanta ServiceUnavailableError
  # -------------------------------------------------------------------------

  describe "P13-D: ServiceUnavailableError após MAX_RETRIES falhas — 100 iterações (Req 14.3)" do
    it "para qualquer combinação de erros 5xx e 429, levanta ServiceUnavailableError após 3 falhas" do
      property_of {
        source = choose(:curseforge, :modrinth)
        # Generate a sequence of 4 error descriptors (initial + 3 retries, all failing)
        # Each descriptor is [:server_error, code] or [:rate_limit, retry_after]
        errors = Array.new(MAX_RETRIES + 1) do
          if boolean
            [:server_error, choose(*SERVER_ERROR_CODES)]
          else
            [:rate_limit, integer(1..60)]
          end
        end
        [source, errors]
      }.check(10) do |(source, errors)|
        http = build_http_double
        responses = errors.map do |(error_type, value)|
          if error_type == :server_error
            server_error_response(value)
          else
            rate_limit_response(retry_after: value)
          end
        end
        stub_http_sequence(http, responses)
        allow(Net::HTTP).to receive(:new).and_return(http)

        client, _sleep_calls = build_client_with_sleep_capture(source)

        expect {
          client.search(query: "test")
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq(source.to_s),
            "ServiceUnavailableError deve identificar o serviço '#{source}'"
        end
      end
    end
  end

  # -------------------------------------------------------------------------
  # P13-E: Backoff sequence invariant — sleep values are always [2, 4, 8]
  # -------------------------------------------------------------------------

  describe "P13-E: invariante da sequência de backoff — 100 iterações (Req 14.3)" do
    it "os intervalos de backoff são sempre [2, 4, 8] independente do código de erro 5xx" do
      property_of {
        source = choose(:curseforge, :modrinth)
        # Pick 3 different 5xx codes for the 3 retries
        codes = Array.new(MAX_RETRIES + 1) { choose(*SERVER_ERROR_CODES) }
        [source, codes]
      }.check(10) do |(source, codes)|
        http = build_http_double
        responses = codes.map { |code| server_error_response(code) }
        stub_http_sequence(http, responses)
        allow(Net::HTTP).to receive(:new).and_return(http)

        client, sleep_calls = build_client_with_sleep_capture(source)

        expect {
          client.search(query: "test")
        }.to raise_error(ExternalAPI::ServiceUnavailableError)

        expect(sleep_calls).to eq(EXPECTED_BACKOFF),
          "Backoff deve ser sempre #{EXPECTED_BACKOFF.inspect} independente dos códigos de erro, " \
          "obtido #{sleep_calls.inspect} para códigos #{codes.inspect}"
      end
    end
  end
end
