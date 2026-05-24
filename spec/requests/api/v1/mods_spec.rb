# frozen_string_literal: true

require "rails_helper"

RSpec.describe "GET /api/v1/mods", type: :request do
  before do
    # Disable CSRF verification for API request specs — consistent with other request specs.
    allow_any_instance_of(ApplicationController).to receive(:verify_authenticity_token)
  end

  let(:curseforge_search_response) do
    {
      "data" => [
        { "id" => 1, "name" => "Sodium", "downloadCount" => 5_000_000 },
        { "id" => 2, "name" => "Lithium", "downloadCount" => 3_000_000 }
      ],
      "pagination" => { "totalCount" => 2 }
    }
  end

  let(:modrinth_search_response) do
    {
      "hits"       => [{ "project_id" => "AANobbMI", "title" => "Sodium", "downloads" => 5_000_000 }],
      "total_hits" => 1
    }
  end

  let(:curseforge_find_response) do
    { "data" => { "id" => 1, "name" => "Sodium", "summary" => "A mod" } }
  end

  let(:modrinth_find_response) do
    { "id" => "AANobbMI", "title" => "Sodium", "description" => "A mod" }
  end

  # ---------------------------------------------------------------------------
  # index
  # ---------------------------------------------------------------------------

  describe "GET /api/v1/mods" do
    context "when source=curseforge" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(client)
        allow(client).to receive(:search).and_return(curseforge_search_response)
      end

      it "returns HTTP 200 with data and meta" do
        get "/api/v1/mods", params: { source: "curseforge", q: "sodium" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json).to have_key("data")
        expect(json).to have_key("meta")
      end

      it "includes pagination meta fields" do
        get "/api/v1/mods", params: { source: "curseforge", q: "sodium" }

        meta = JSON.parse(response.body)["meta"]
        expect(meta.keys).to include("page", "per_page", "total", "total_pages")
      end

      it "limits per_page to 20" do
        get "/api/v1/mods", params: { source: "curseforge", q: "sodium" }

        meta = JSON.parse(response.body)["meta"]
        expect(meta["per_page"]).to eq(20)
      end
    end

    context "when source=modrinth" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(client)
        allow(client).to receive(:search).and_return(modrinth_search_response)
      end

      it "returns HTTP 200 with data and meta" do
        get "/api/v1/mods", params: { source: "modrinth", q: "sodium" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]).to be_an(Array)
      end
    end

    context "when source=both (default)" do
      before do
        cf_client = instance_double(ExternalAPI::Client)
        mr_client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(cf_client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(mr_client)
        allow(cf_client).to receive(:search).and_return(curseforge_search_response)
        allow(mr_client).to receive(:search).and_return(modrinth_search_response)
      end

      it "merges results from both sources" do
        get "/api/v1/mods", params: { q: "sodium" }

        json = JSON.parse(response.body)
        # 2 from CurseForge + 1 from Modrinth
        expect(json["data"].size).to eq(3)
        expect(json["meta"]["total"]).to eq(3)
      end
    end

    context "when no results are found" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(client)
        allow(client).to receive(:search).and_return({ "data" => [], "pagination" => { "totalCount" => 0 } })
        client2 = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(client2)
        allow(client2).to receive(:search).and_return({ "hits" => [], "total_hits" => 0 })
      end

      it "returns empty data with a message in meta — Requirement 1.7" do
        get "/api/v1/mods", params: { q: "xyznonexistent" }

        json = JSON.parse(response.body)
        expect(json["data"]).to eq([])
        expect(json["meta"]["message"]).to include("xyznonexistent")
      end
    end

    context "when the API is unavailable" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(client)
        allow(client).to receive(:search).and_raise(ExternalAPI::ServiceUnavailableError.new("curseforge"))
        client2 = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(client2)
        allow(client2).to receive(:search).and_raise(ExternalAPI::ServiceUnavailableError.new("modrinth"))
      end

      it "returns HTTP 503 — Requirement 1.6" do
        get "/api/v1/mods", params: { q: "sodium" }

        expect(response).to have_http_status(:service_unavailable)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
      end
    end

    context "when only one source fails" do
      before do
        cf_client = instance_double(ExternalAPI::Client)
        mr_client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(cf_client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(mr_client)
        allow(cf_client).to receive(:search).and_raise(ExternalAPI::ServiceUnavailableError.new("curseforge"))
        allow(mr_client).to receive(:search).and_return(modrinth_search_response)
      end

      it "returns partial results from the available source" do
        get "/api/v1/mods", params: { q: "sodium" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"].size).to eq(1)
      end
    end

    context "pagination" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(client)
        allow(client).to receive(:search).and_return(
          "data" => Array.new(20) { |i| { "id" => i, "name" => "Mod #{i}" } },
          "pagination" => { "totalCount" => 100 }
        )
        client2 = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(client2)
        allow(client2).to receive(:search).and_return({ "hits" => [], "total_hits" => 0 })
      end

      it "returns correct total_pages — Requirement 1.8" do
        get "/api/v1/mods", params: { source: "curseforge", q: "mod", page: 1 }

        meta = JSON.parse(response.body)["meta"]
        expect(meta["total_pages"]).to eq(5)
        expect(meta["page"]).to eq(1)
      end
    end
  end

  # ---------------------------------------------------------------------------
  # show
  # ---------------------------------------------------------------------------

  describe "GET /api/v1/mods/:id" do
    context "with source=curseforge" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(client)
        allow(client).to receive(:find).with(id: "1").and_return(curseforge_find_response)
      end

      it "returns HTTP 200 with mod data" do
        get "/api/v1/mods/1", params: { source: "curseforge" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["name"]).to eq("Sodium")
      end

      it "does not include meta in the response" do
        get "/api/v1/mods/1", params: { source: "curseforge" }

        json = JSON.parse(response.body)
        expect(json).not_to have_key("meta")
      end
    end

    context "with source=modrinth" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(client)
        allow(client).to receive(:find).with(id: "AANobbMI").and_return(modrinth_find_response)
      end

      it "returns HTTP 200 with mod data" do
        get "/api/v1/mods/AANobbMI", params: { source: "modrinth" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["title"]).to eq("Sodium")
      end
    end

    context "with invalid source" do
      it "returns HTTP 422 with error message" do
        get "/api/v1/mods/1", params: { source: "invalid" }

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
      end
    end

    context "when API is unavailable" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(client)
        allow(client).to receive(:find).and_raise(ExternalAPI::ServiceUnavailableError.new("curseforge"))
      end

      it "returns HTTP 503" do
        get "/api/v1/mods/1", params: { source: "curseforge" }

        expect(response).to have_http_status(:service_unavailable)
      end
    end
  end
end
