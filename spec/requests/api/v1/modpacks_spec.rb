# frozen_string_literal: true

require "rails_helper"

RSpec.describe "GET /api/v1/modpacks", type: :request do
  before do
    # Disable CSRF verification for API request specs — consistent with other request specs.
    allow_any_instance_of(ApplicationController).to receive(:verify_authenticity_token)
  end

  let(:curseforge_search_response) do
    {
      "data" => [
        { "id" => 10, "name" => "All the Mods 9", "downloadCount" => 8_000_000 },
        { "id" => 11, "name" => "FTB Skies",       "downloadCount" => 4_000_000 }
      ],
      "pagination" => { "totalCount" => 2 }
    }
  end

  let(:modrinth_search_response) do
    {
      "hits"       => [{ "project_id" => "modpack1", "title" => "Fabulously Optimized", "downloads" => 2_000_000 }],
      "total_hits" => 1
    }
  end

  let(:curseforge_find_response) do
    {
      "data" => {
        "id"          => 10,
        "name"        => "All the Mods 9",
        "summary"     => "A kitchen-sink modpack",
        "latestFiles" => [
          {
            "id"           => 999,
            "fileName"     => "ATM9-0.2.28.zip",
            "gameVersions" => ["1.20.1", "Forge"],
            "modules"      => [],
            "hashes"       => []
          }
        ]
      }
    }
  end

  let(:modrinth_find_response) do
    {
      "id"            => "modpack1",
      "title"         => "Fabulously Optimized",
      "description"   => "A performance modpack",
      "game_versions" => ["1.20.1"],
      "loaders"       => ["fabric"],
      "versions"      => []
    }
  end

  # ---------------------------------------------------------------------------
  # index
  # ---------------------------------------------------------------------------

  describe "GET /api/v1/modpacks" do
    context "when source=curseforge" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(client)
        allow(client).to receive(:search).and_return(curseforge_search_response)
      end

      it "returns HTTP 200 with data and meta" do
        get "/api/v1/modpacks", params: { source: "curseforge", q: "mods" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json).to have_key("data")
        expect(json).to have_key("meta")
      end

      it "includes pagination meta fields" do
        get "/api/v1/modpacks", params: { source: "curseforge", q: "mods" }

        meta = JSON.parse(response.body)["meta"]
        expect(meta.keys).to include("page", "per_page", "total", "total_pages")
      end

      it "limits per_page to 20 — Requirement 1.8" do
        get "/api/v1/modpacks", params: { source: "curseforge", q: "mods" }

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

      it "returns HTTP 200 with data" do
        get "/api/v1/modpacks", params: { source: "modrinth", q: "optimized" }

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
        get "/api/v1/modpacks", params: { q: "mods" }

        json = JSON.parse(response.body)
        expect(json["data"].size).to eq(3)
        expect(json["meta"]["total"]).to eq(3)
      end
    end

    context "when no results are found" do
      before do
        cf_client = instance_double(ExternalAPI::Client)
        mr_client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(cf_client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(mr_client)
        allow(cf_client).to receive(:search).and_return({ "data" => [], "pagination" => { "totalCount" => 0 } })
        allow(mr_client).to receive(:search).and_return({ "hits" => [], "total_hits" => 0 })
      end

      it "returns empty data with a message in meta — Requirement 1.7" do
        get "/api/v1/modpacks", params: { q: "xyznonexistent" }

        json = JSON.parse(response.body)
        expect(json["data"]).to eq([])
        expect(json["meta"]["message"]).to include("xyznonexistent")
      end
    end

    context "when the API is unavailable" do
      before do
        cf_client = instance_double(ExternalAPI::Client)
        mr_client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(cf_client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(mr_client)
        allow(cf_client).to receive(:search).and_raise(ExternalAPI::ServiceUnavailableError.new("curseforge"))
        allow(mr_client).to receive(:search).and_raise(ExternalAPI::ServiceUnavailableError.new("modrinth"))
      end

      it "returns HTTP 503 — Requirement 1.6" do
        get "/api/v1/modpacks", params: { q: "mods" }

        expect(response).to have_http_status(:service_unavailable)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
      end
    end
  end

  # ---------------------------------------------------------------------------
  # show
  # ---------------------------------------------------------------------------

  describe "GET /api/v1/modpacks/:id" do
    context "with source=curseforge" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(client)
        allow(client).to receive(:find).with(id: "10").and_return(curseforge_find_response)
      end

      it "returns HTTP 200 with modpack data" do
        get "/api/v1/modpacks/10", params: { source: "curseforge" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["name"]).to eq("All the Mods 9")
      end

      it "does not include meta in the response" do
        get "/api/v1/modpacks/10", params: { source: "curseforge" }

        json = JSON.parse(response.body)
        expect(json).not_to have_key("meta")
      end
    end

    context "with source=modrinth" do
      before do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(client)
        allow(client).to receive(:find).with(id: "modpack1").and_return(modrinth_find_response)
      end

      it "returns HTTP 200 with modpack data" do
        get "/api/v1/modpacks/modpack1", params: { source: "modrinth" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["title"]).to eq("Fabulously Optimized")
      end
    end

    context "with invalid source" do
      it "returns HTTP 422 with error message" do
        get "/api/v1/modpacks/10", params: { source: "invalid" }

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
      end
    end
  end

  # ---------------------------------------------------------------------------
  # manifest
  # ---------------------------------------------------------------------------

  describe "GET /api/v1/modpacks/:id/manifest" do
    context "when unauthenticated" do
      it "returns HTTP 401 — Requirement 4.6 (auth required)" do
        get "/api/v1/modpacks/10/manifest", params: { source: "curseforge" }

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "when authenticated" do
      let(:user) { create(:user) }

      before do
        # Stub current_user to simulate an authenticated session without going
        # through the full OAuth flow — consistent with other request specs.
        allow_any_instance_of(ApplicationController).to receive(:current_user).and_return(user)
        allow_any_instance_of(ApplicationController).to receive(:verify_authenticity_token)
      end

      it "returns HTTP 200 with manifest data for curseforge" do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(client)
        allow(client).to receive(:find).with(id: "10").and_return(curseforge_find_response)

        get "/api/v1/modpacks/10/manifest", params: { source: "curseforge" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]).to have_key("format_version")
        expect(json["data"]).to have_key("name")
        expect(json["data"]).to have_key("minecraft_version")
        expect(json["data"]).to have_key("loader")
        expect(json["data"]).to have_key("mods")
        expect(json["data"]).to have_key("generated_at")
      end

      it "returns HTTP 200 with manifest data for modrinth" do
        client = instance_double(ExternalAPI::Client)
        allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(client)
        allow(client).to receive(:find).with(id: "modpack1").and_return(modrinth_find_response)

        get "/api/v1/modpacks/modpack1/manifest", params: { source: "modrinth" }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["loader"]).to eq("fabric")
        expect(json["data"]["minecraft_version"]).to eq("1.20.1")
      end
    end
  end
end
