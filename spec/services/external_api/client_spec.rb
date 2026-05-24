# frozen_string_literal: true

# Testes de exemplo para ExternalAPI::Client
#
# Validates: Requirements 14.2, 14.3, 14.4
#
# Cobre:
#   - Retry com backoff exponencial (2s, 4s, 8s) em HTTP 5xx
#   - Rate limit com cabeçalho Retry-After presente
#   - Rate limit sem cabeçalho Retry-After (aguarda 60s padrão)
#   - HTTP 503 ao cliente após 3 falhas consecutivas

require "rails_helper"

load Rails.root.join("app/services/external_api.rb").to_s unless defined?(ExternalAPI)
load Rails.root.join("app/services/external_api/client.rb").to_s unless defined?(ExternalAPI::Client)

RSpec.describe ExternalAPI::Client, type: :service do
  # Silence Rails.logger noise during tests
  before do
    allow(Rails.logger).to receive(:info)
    allow(Rails.logger).to receive(:warn)
    allow(Rails.logger).to receive(:error)
  end

  # Disable Rails.cache so every call hits the HTTP layer
  before do
    allow(Rails.cache).to receive(:fetch) do |_key, **_opts, &block|
      block.call
    end
  end

  # -------------------------------------------------------------------------
  # Helpers — build fake Net::HTTPResponse objects
  # -------------------------------------------------------------------------

  def fake_response(code, body = "", headers = {})
    response = instance_double(Net::HTTPResponse)
    allow(response).to receive(:code).and_return(code.to_s)
    allow(response).to receive(:body).and_return(body)
    # Support header lookup via []
    allow(response).to receive(:[]) do |key|
      headers[key] || headers[key.downcase]
    end
    response
  end

  def ok_response(body = '{"data":[]}')
    fake_response(200, body, { "Content-Type" => "application/json" })
  end

  def server_error_response(code = 500)
    fake_response(code, "Error #{code}")
  end

  def rate_limit_response(retry_after: nil)
    headers = retry_after ? { "Retry-After" => retry_after.to_s } : {}
    fake_response(429, "", headers)
  end

  # Stub Net::HTTP#request to return a sequence of responses.
  # Each call to http.request(...) pops the next response from the array.
  def stub_http_sequence(http_double, *responses)
    call_count = 0
    allow(http_double).to receive(:request) do
      resp = responses[call_count] || responses.last
      call_count += 1
      resp
    end
  end

  # Build a Net::HTTP double and inject it into the client via Net::HTTP.new stub.
  def build_http_double
    http = instance_double(Net::HTTP)
    allow(http).to receive(:use_ssl=)
    allow(http).to receive(:open_timeout=)
    allow(http).to receive(:read_timeout=)
    http
  end

  def curseforge_client
    described_class.new(source: :curseforge)
  end

  def modrinth_client
    described_class.new(source: :modrinth)
  end

  # -------------------------------------------------------------------------
  # Requirement 14.3 — Retry com backoff exponencial em HTTP 5xx
  # -------------------------------------------------------------------------

  describe "retry com backoff exponencial em HTTP 5xx (Req 14.3)" do
    context "quando o servidor retorna 500 nas primeiras tentativas e 200 na terceira" do
      it "retenta 2 vezes e retorna o resultado bem-sucedido" do
        http = build_http_double
        stub_http_sequence(http,
          server_error_response(500),
          server_error_response(500),
          ok_response
        )
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = curseforge_client
        sleep_calls = []
        allow(client).to receive(:sleep) { |n| sleep_calls << n }

        result = client.search(query: "sodium")

        expect(result).to eq({ "data" => [] })
        expect(sleep_calls).to eq([2, 4]),
          "Esperado backoff de [2, 4]s, obtido #{sleep_calls.inspect}"
      end
    end

    context "quando o servidor retorna 503 na primeira tentativa e 200 na segunda" do
      it "retenta 1 vez com 2s de espera e retorna o resultado" do
        http = build_http_double
        stub_http_sequence(http,
          server_error_response(503),
          ok_response('{"hits":[]}')
        )
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = modrinth_client
        sleep_calls = []
        allow(client).to receive(:sleep) { |n| sleep_calls << n }

        result = client.search(query: "sodium")

        expect(result).to eq({ "hits" => [] })
        expect(sleep_calls).to eq([2]),
          "Esperado backoff de [2]s na primeira retentativa, obtido #{sleep_calls.inspect}"
      end
    end

    context "quando o servidor retorna 502 em todas as tentativas" do
      it "retenta 3 vezes com backoff 2s, 4s, 8s e levanta ServiceUnavailableError" do
        http = build_http_double
        stub_http_sequence(http,
          server_error_response(502),
          server_error_response(502),
          server_error_response(502),
          server_error_response(502)
        )
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = curseforge_client
        sleep_calls = []
        allow(client).to receive(:sleep) { |n| sleep_calls << n }

        expect {
          client.search(query: "sodium")
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq("curseforge")
        end

        expect(sleep_calls).to eq([2, 4, 8]),
          "Esperado backoff de [2, 4, 8]s, obtido #{sleep_calls.inspect}"
      end
    end

    context "quando o servidor retorna 500 em todas as tentativas (Modrinth)" do
      it "levanta ServiceUnavailableError identificando o serviço modrinth" do
        http = build_http_double
        allow(http).to receive(:request).and_return(server_error_response(500))
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = modrinth_client
        allow(client).to receive(:sleep)

        expect {
          client.search(query: "sodium")
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq("modrinth")
          expect(err.message).to include("modrinth")
        end
      end
    end
  end

  # -------------------------------------------------------------------------
  # Requirement 14.2 — Rate limit com Retry-After presente
  # -------------------------------------------------------------------------

  describe "rate limit com cabeçalho Retry-After presente (Req 14.2)" do
    context "quando o servidor retorna 429 com Retry-After: 30 e depois 200" do
      it "aguarda exatamente 30s e retorna o resultado" do
        http = build_http_double
        stub_http_sequence(http,
          rate_limit_response(retry_after: 30),
          ok_response
        )
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = curseforge_client
        sleep_calls = []
        allow(client).to receive(:sleep) { |n| sleep_calls << n }

        result = client.search(query: "sodium")

        expect(result).to eq({ "data" => [] })
        expect(sleep_calls).to eq([30]),
          "Esperado sleep de [30]s (Retry-After), obtido #{sleep_calls.inspect}"
      end
    end

    context "quando o servidor retorna 429 com Retry-After: 45 (Modrinth)" do
      it "aguarda exatamente 45s antes de retentar" do
        http = build_http_double
        stub_http_sequence(http,
          rate_limit_response(retry_after: 45),
          ok_response('{"hits":[]}')
        )
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = modrinth_client
        sleep_calls = []
        allow(client).to receive(:sleep) { |n| sleep_calls << n }

        result = client.search(query: "sodium")

        expect(result).to eq({ "hits" => [] })
        expect(sleep_calls).to eq([45]),
          "Esperado sleep de [45]s (Retry-After), obtido #{sleep_calls.inspect}"
      end
    end

    context "quando o servidor retorna 429 com Retry-After em todas as tentativas" do
      it "levanta ServiceUnavailableError após 3 retentativas" do
        http = build_http_double
        allow(http).to receive(:request).and_return(rate_limit_response(retry_after: 10))
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = curseforge_client
        allow(client).to receive(:sleep)

        expect {
          client.search(query: "sodium")
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq("curseforge")
        end
      end
    end
  end

  # -------------------------------------------------------------------------
  # Requirement 14.2 — Rate limit sem Retry-After (padrão 60s)
  # -------------------------------------------------------------------------

  describe "rate limit sem cabeçalho Retry-After (padrão 60s) (Req 14.2)" do
    context "quando o servidor retorna 429 sem Retry-After e depois 200" do
      it "aguarda 60s (padrão) e retorna o resultado" do
        http = build_http_double
        stub_http_sequence(http,
          rate_limit_response(retry_after: nil),
          ok_response
        )
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = curseforge_client
        sleep_calls = []
        allow(client).to receive(:sleep) { |n| sleep_calls << n }

        result = client.search(query: "sodium")

        expect(result).to eq({ "data" => [] })
        expect(sleep_calls).to eq([60]),
          "Esperado sleep de [60]s (padrão sem Retry-After), obtido #{sleep_calls.inspect}"
      end
    end

    context "quando o servidor retorna 429 com Retry-After vazio" do
      it "usa o padrão de 60s" do
        http = build_http_double
        stub_http_sequence(http,
          rate_limit_response(retry_after: ""),
          ok_response('{"hits":[]}')
        )
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = modrinth_client
        sleep_calls = []
        allow(client).to receive(:sleep) { |n| sleep_calls << n }

        result = client.search(query: "sodium")

        expect(result).to eq({ "hits" => [] })
        expect(sleep_calls).to eq([60]),
          "Esperado sleep de [60]s (Retry-After vazio), obtido #{sleep_calls.inspect}"
      end
    end
  end

  # -------------------------------------------------------------------------
  # Requirement 14.4 — HTTP 503 ao cliente após 3 falhas
  # -------------------------------------------------------------------------

  describe "HTTP 503 ao cliente após 3 falhas (Req 14.4)" do
    context "quando todas as 3 retentativas falham com HTTP 5xx" do
      it "levanta ServiceUnavailableError com o nome do serviço (CurseForge)" do
        http = build_http_double
        allow(http).to receive(:request).and_return(server_error_response(503))
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = curseforge_client
        allow(client).to receive(:sleep)

        expect {
          client.search(query: "sodium")
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq("curseforge")
          expect(err.message).to match(/curseforge/i)
        end
      end

      it "levanta ServiceUnavailableError para Modrinth após 3 falhas" do
        http = build_http_double
        allow(http).to receive(:request).and_return(server_error_response(503))
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = modrinth_client
        allow(client).to receive(:sleep)

        expect {
          client.search(query: "sodium")
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq("modrinth")
        end
      end

      it "levanta ServiceUnavailableError para find() após 3 falhas" do
        http = build_http_double
        allow(http).to receive(:request).and_return(server_error_response(500))
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = curseforge_client
        allow(client).to receive(:sleep)

        expect {
          client.find(id: 12345)
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq("curseforge")
        end
      end
    end

    context "quando timeout de rede ocorre em todas as tentativas" do
      it "levanta ServiceUnavailableError após 3 timeouts" do
        http = build_http_double
        allow(http).to receive(:request).and_raise(Net::ReadTimeout)
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = curseforge_client
        allow(client).to receive(:sleep)

        expect {
          client.search(query: "sodium")
        }.to raise_error(ExternalAPI::ServiceUnavailableError) do |err|
          expect(err.service).to eq("curseforge")
        end
      end
    end

    context "quando a requisição bem-sucedida retorna 200" do
      it "não levanta erro e retorna o resultado parseado" do
        http = build_http_double
        allow(http).to receive(:request).and_return(
          ok_response('{"data":[{"id":1,"name":"Sodium"}]}')
        )
        allow(Net::HTTP).to receive(:new).and_return(http)

        client = curseforge_client
        result = client.search(query: "sodium")

        expect(result).to eq({ "data" => [{ "id" => 1, "name" => "Sodium" }] })
      end
    end
  end

  # -------------------------------------------------------------------------
  # Combinação de erros — 5xx seguido de 429 seguido de sucesso
  # -------------------------------------------------------------------------

  describe "combinação de erros: 5xx → 429 → sucesso" do
    it "aplica backoff correto para cada tipo de erro e retorna resultado" do
      http = build_http_double
      stub_http_sequence(http,
        server_error_response(500),
        rate_limit_response(retry_after: 15),
        ok_response
      )
      allow(Net::HTTP).to receive(:new).and_return(http)

      client = curseforge_client
      sleep_calls = []
      allow(client).to receive(:sleep) { |n| sleep_calls << n }

      result = client.search(query: "sodium")

      expect(result).to eq({ "data" => [] })
      # First failure: 5xx → backoff 2s; second failure: 429 → Retry-After 15s
      expect(sleep_calls).to eq([2, 15]),
        "Esperado [2, 15]s (5xx backoff + Retry-After), obtido #{sleep_calls.inspect}"
    end
  end
end
