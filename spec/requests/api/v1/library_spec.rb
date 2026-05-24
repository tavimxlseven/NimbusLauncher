# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::LibraryController", type: :request do
  let(:user) { create(:user) }

  before do
    # Disable CSRF verification for API request specs — the API relies on
    # session-based auth (checked via current_user) rather than CSRF tokens
    # for JSON clients. This matches the pattern used in auth_spec.rb.
    allow_any_instance_of(ApplicationController).to receive(:verify_authenticity_token)
  end

  # Helper: simulate an authenticated session by stubbing current_user.
  def authenticate_as(u)
    allow_any_instance_of(ApplicationController).to receive(:current_user).and_return(u)
  end

  # ---------------------------------------------------------------------------
  # GET /api/v1/library
  # ---------------------------------------------------------------------------

  describe "GET /api/v1/library" do
    context "when unauthenticated" do
      it "returns HTTP 401 — Requirement 2.7" do
        get "/api/v1/library"

        expect(response).to have_http_status(:unauthorized)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
      end
    end

    context "when authenticated with an empty library" do
      before { authenticate_as(user) }

      it "returns HTTP 200 with empty data and a message — Requirement 4.5" do
        get "/api/v1/library"

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]).to eq([])
        expect(json.dig("meta", "message")).to eq("Nenhum item na sua biblioteca ainda")
      end
    end

    context "when authenticated with library items" do
      before { authenticate_as(user) }

      it "returns HTTP 200 with items ordered by added_at DESC — Requirement 4.4" do
        older = create(:library_item, user: user, external_id: "ext_old",
                       added_at: 2.days.ago, name: "Older Mod")
        newer = create(:library_item, user: user, external_id: "ext_new",
                       added_at: 1.day.ago,  name: "Newer Mod")

        get "/api/v1/library"

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        ids = json["data"].map { |i| i["external_id"] }
        expect(ids).to eq([newer.external_id, older.external_id])
      end

      it "does not include items from other users" do
        other_user = create(:user)
        create(:library_item, user: other_user, external_id: "other_ext")
        create(:library_item, user: user,       external_id: "my_ext")

        get "/api/v1/library"

        json = JSON.parse(response.body)
        expect(json["data"].map { |i| i["external_id"] }).to eq(["my_ext"])
      end

      it "returns serialized item fields" do
        create(:library_item, user: user, external_id: "ext_1", name: "Sodium",
               source: "modrinth", item_type: "mod", version: "0.5.8")

        get "/api/v1/library"

        item = JSON.parse(response.body)["data"].first
        expect(item.keys).to include("id", "source", "external_id", "item_type", "name", "version", "added_at")
        expect(item["name"]).to eq("Sodium")
      end
    end
  end

  # ---------------------------------------------------------------------------
  # POST /api/v1/library
  # ---------------------------------------------------------------------------

  describe "POST /api/v1/library" do
    let(:valid_params) do
      {
        library_item: {
          source:      "modrinth",
          external_id: "AANobbMI",
          item_type:   "mod",
          name:        "Sodium",
          version:     "0.5.8"
        }
      }
    end

    context "when unauthenticated" do
      it "returns HTTP 401" do
        post "/api/v1/library", params: valid_params

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "when authenticated" do
      before { authenticate_as(user) }

      it "creates a library item and returns HTTP 201 — Requirement 4.1" do
        expect {
          post "/api/v1/library", params: valid_params
        }.to change(LibraryItem, :count).by(1)

        expect(response).to have_http_status(:created)
        json = JSON.parse(response.body)
        expect(json["data"]["external_id"]).to eq("AANobbMI")
        expect(json["data"]["name"]).to eq("Sodium")
      end

      it "associates the item with the current user" do
        post "/api/v1/library", params: valid_params

        item = LibraryItem.last
        expect(item.user_id).to eq(user.id)
      end

      it "sets added_at automatically when not provided" do
        post "/api/v1/library", params: valid_params

        item = LibraryItem.last
        expect(item.added_at).not_to be_nil
      end

      it "returns HTTP 409 for a duplicate item — Requirement 4.2" do
        create(:library_item, user: user, source: "modrinth", external_id: "AANobbMI")

        post "/api/v1/library", params: valid_params

        expect(response).to have_http_status(:conflict)
        json = JSON.parse(response.body)
        expect(json["errors"].first["message"]).to eq("Item já está na sua biblioteca")
        expect(json["errors"].first["code"]).to eq("duplicate")
      end

      it "does not create a duplicate item in the database" do
        create(:library_item, user: user, source: "modrinth", external_id: "AANobbMI")

        expect {
          post "/api/v1/library", params: valid_params
        }.not_to change(LibraryItem, :count)
      end

      it "returns HTTP 422 for invalid source" do
        post "/api/v1/library", params: {
          library_item: valid_params[:library_item].merge(source: "invalid_source")
        }

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
      end

      it "allows the same external_id for different users" do
        other_user = create(:user)
        create(:library_item, user: other_user, source: "modrinth", external_id: "AANobbMI")

        expect {
          post "/api/v1/library", params: valid_params
        }.to change(LibraryItem, :count).by(1)

        expect(response).to have_http_status(:created)
      end
    end
  end

  # ---------------------------------------------------------------------------
  # DELETE /api/v1/library/:id
  # ---------------------------------------------------------------------------

  describe "DELETE /api/v1/library/:id" do
    context "when unauthenticated" do
      it "returns HTTP 401" do
        item = create(:library_item, user: user)
        delete "/api/v1/library/#{item.id}"

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "when authenticated" do
      before { authenticate_as(user) }

      it "deletes the item and returns HTTP 204 — Requirement 4.3" do
        item = create(:library_item, user: user)

        expect {
          delete "/api/v1/library/#{item.id}"
        }.to change(LibraryItem, :count).by(-1)

        expect(response).to have_http_status(:no_content)
      end

      it "returns HTTP 404 when item does not exist" do
        delete "/api/v1/library/999999"

        expect(response).to have_http_status(:not_found)
        json = JSON.parse(response.body)
        expect(json["errors"].first["code"]).to eq("not_found")
      end

      it "returns HTTP 404 when item belongs to another user" do
        other_user = create(:user)
        item = create(:library_item, user: other_user)

        delete "/api/v1/library/#{item.id}"

        expect(response).to have_http_status(:not_found)
      end

      it "does not delete items belonging to other users" do
        other_user = create(:user)
        item = create(:library_item, user: other_user)

        expect {
          delete "/api/v1/library/#{item.id}"
        }.not_to change(LibraryItem, :count)
      end
    end
  end

  # ---------------------------------------------------------------------------
  # PATCH /api/v1/library/:id
  # ---------------------------------------------------------------------------

  describe "PATCH /api/v1/library/:id" do
    context "when unauthenticated" do
      it "returns HTTP 401" do
        item = create(:library_item, user: user)
        patch "/api/v1/library/#{item.id}", params: { library_item: { name: "New Name" } }

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context "when authenticated" do
      before { authenticate_as(user) }

      it "updates the item and returns HTTP 200" do
        item = create(:library_item, user: user, name: "Old Name")

        patch "/api/v1/library/#{item.id}", params: {
          library_item: { name: "New Name" }
        }

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["name"]).to eq("New Name")
        expect(item.reload.name).to eq("New Name")
      end

      it "returns HTTP 404 when item does not exist" do
        patch "/api/v1/library/999999", params: {
          library_item: { name: "New Name" }
        }

        expect(response).to have_http_status(:not_found)
        json = JSON.parse(response.body)
        expect(json["errors"].first["code"]).to eq("not_found")
      end

      it "returns HTTP 404 when item belongs to another user" do
        other_user = create(:user)
        item = create(:library_item, user: other_user)

        patch "/api/v1/library/#{item.id}", params: {
          library_item: { name: "New Name" }
        }

        expect(response).to have_http_status(:not_found)
      end

      context "when updating version for a modpack — Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 15.4, 15.5" do
        let(:modpack) do
          create(:library_item,
                 user: user,
                 item_type: "modpack",
                 source: "modrinth",
                 external_id: "test_modpack_id",
                 version: "old_version_id",
                 installed: true)
        end

        it "validates version against external API and updates when valid" do
          # Mock the external API to return valid versions
          allow_any_instance_of(ExternalAPI::Client).to receive(:send).with(:with_retry).and_yield
          allow_any_instance_of(ExternalAPI::Client).to receive(:send).with(:get, "/project/test_modpack_id/version").and_return([
            { "id" => "new_version_id", "version_number" => "2.0.0" },
            { "id" => "old_version_id", "version_number" => "1.0.0" }
          ])

          patch "/api/v1/library/#{modpack.id}", params: {
            library_item: { version: "new_version_id" }
          }

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json["data"]["version"]).to eq("new_version_id")
          expect(json["data"]["installed"]).to eq(false) # Requirement 4.6
          expect(modpack.reload.version).to eq("new_version_id")
          expect(modpack.reload.installed).to eq(false)
        end

        it "returns error when version is invalid — Requirement 4.5" do
          # Mock the external API to return versions without the requested one
          allow_any_instance_of(ExternalAPI::Client).to receive(:send).with(:with_retry).and_yield
          allow_any_instance_of(ExternalAPI::Client).to receive(:send).with(:get, "/project/test_modpack_id/version").and_return([
            { "id" => "old_version_id", "version_number" => "1.0.0" }
          ])

          patch "/api/v1/library/#{modpack.id}", params: {
            library_item: { version: "invalid_version_id" }
          }

          expect(response).to have_http_status(:unprocessable_entity)
          json = JSON.parse(response.body)
          expect(json["errors"].first["code"]).to eq("invalid_version")
          expect(json["errors"].first["message"]).to include("não encontrada")
          expect(modpack.reload.version).to eq("old_version_id") # Version should not change
        end

        it "validates CurseForge versions correctly" do
          curseforge_modpack = create(:library_item,
                                      user: user,
                                      item_type: "modpack",
                                      source: "curseforge",
                                      external_id: "12345",
                                      version: "100",
                                      installed: true)

          # Mock CurseForge API response
          allow_any_instance_of(ExternalAPI::Client).to receive(:send).with(:with_retry).and_yield
          allow_any_instance_of(ExternalAPI::Client).to receive(:send)
            .with(:get, "/mods/12345/files?pageSize=50&sortField=1&sortOrder=desc")
            .and_return({
              "data" => [
                { "id" => 200, "fileName" => "modpack-2.0.0.zip" },
                { "id" => 100, "fileName" => "modpack-1.0.0.zip" }
              ]
            })

          patch "/api/v1/library/#{curseforge_modpack.id}", params: {
            library_item: { version: "200" }
          }

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json["data"]["version"]).to eq("200")
          expect(json["data"]["installed"]).to eq(false)
        end

        it "does not validate version for custom modpacks" do
          custom_modpack = create(:library_item,
                                  user: user,
                                  item_type: "modpack",
                                  source: "curseforge",
                                  external_id: "custom-123",
                                  version: "1.0.0",
                                  installed: true)

          # Should not call external API for custom modpacks
          expect_any_instance_of(ExternalAPI::Client).not_to receive(:send)

          patch "/api/v1/library/#{custom_modpack.id}", params: {
            library_item: { version: "2.0.0" }
          }

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json["data"]["version"]).to eq("2.0.0")
          expect(json["data"]["installed"]).to eq(false)
        end

        it "does not validate version for mods" do
          mod = create(:library_item,
                       user: user,
                       item_type: "mod",
                       source: "modrinth",
                       external_id: "mod_id",
                       version: "1.0.0")

          # Should not call external API for mods
          expect_any_instance_of(ExternalAPI::Client).not_to receive(:send)

          patch "/api/v1/library/#{mod.id}", params: {
            library_item: { version: "2.0.0" }
          }

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json["data"]["version"]).to eq("2.0.0")
        end

        it "handles external API unavailability gracefully" do
          # Mock external API to raise ServiceUnavailableError
          allow_any_instance_of(ExternalAPI::Client).to receive(:send).with(:with_retry).and_yield
          allow_any_instance_of(ExternalAPI::Client).to receive(:send)
            .with(:get, "/project/test_modpack_id/version")
            .and_raise(ExternalAPI::ServiceUnavailableError.new(:modrinth))

          patch "/api/v1/library/#{modpack.id}", params: {
            library_item: { version: "new_version_id" }
          }

          expect(response).to have_http_status(:service_unavailable)
          json = JSON.parse(response.body)
          expect(json["errors"].first["code"]).to eq("external_api_unavailable")
          expect(json["errors"].first["message"]).to include("serviço externo indisponível")
        end

        it "does not mark as uninstalled when version is not changed" do
          # Mock the external API
          allow_any_instance_of(ExternalAPI::Client).to receive(:send).with(:with_retry).and_yield
          allow_any_instance_of(ExternalAPI::Client).to receive(:send).with(:get, "/project/test_modpack_id/version").and_return([
            { "id" => "old_version_id", "version_number" => "1.0.0" }
          ])

          patch "/api/v1/library/#{modpack.id}", params: {
            library_item: { version: "old_version_id" }
          }

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json["data"]["installed"]).to eq(true) # Should remain installed
        end

        it "allows updating other fields without version validation" do
          patch "/api/v1/library/#{modpack.id}", params: {
            library_item: { name: "Updated Name" }
          }

          expect(response).to have_http_status(:ok)
          json = JSON.parse(response.body)
          expect(json["data"]["name"]).to eq("Updated Name")
          expect(json["data"]["version"]).to eq("old_version_id")
          expect(json["data"]["installed"]).to eq(true)
        end
      end
    end
  end
end
