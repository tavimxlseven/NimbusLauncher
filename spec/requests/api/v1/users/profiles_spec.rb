# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Api::V1::Users::ProfilesController", type: :request do
  let(:user) do
    create(:user,
           username:          "DiscordUser",
           avatar_url:        "https://cdn.discordapp.com/avatars/123/abc.png",
           theme_preference:  "dark",
           theme_color:       "#1a2b3c",
           session_expires_at: 30.days.from_now)
  end

  # Disable CSRF verification for all tests in this spec — API clients send JSON
  # and don't carry CSRF tokens. This matches the pattern used in other request specs.
  before do
    allow_any_instance_of(ApplicationController).to receive(:verify_authenticity_token)
  end

  # Helper: stub current_user so we don't need a real session.
  def authenticate_as(u)
    allow_any_instance_of(ApplicationController).to receive(:current_user).and_return(u)
  end

  # ---------------------------------------------------------------------------
  # GET /api/v1/users/me
  # ---------------------------------------------------------------------------

  describe "GET /api/v1/users/me" do
    context "when unauthenticated" do
      it "returns HTTP 401 — Requirement 2.7" do
        get "/api/v1/users/me"

        expect(response).to have_http_status(:unauthorized)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
      end
    end

    context "when authenticated" do
      before { authenticate_as(user) }

      it "returns HTTP 200" do
        get "/api/v1/users/me"

        expect(response).to have_http_status(:ok)
      end

      it "returns the user profile wrapped in data" do
        get "/api/v1/users/me"

        json = JSON.parse(response.body)
        expect(json).to have_key("data")
        expect(json).not_to have_key("errors")
      end

      it "includes id, username, avatar_url, theme_preference and theme_color" do
        get "/api/v1/users/me"

        data = JSON.parse(response.body)["data"]
        expect(data["id"]).to eq(user.id)
        expect(data["username"]).to eq("DiscordUser")
        expect(data["avatar_url"]).to eq("https://cdn.discordapp.com/avatars/123/abc.png")
        expect(data["theme_preference"]).to eq("dark")
        expect(data["theme_color"]).to eq("#1a2b3c")
      end

      it "does not include sensitive fields (discord_uid, session_expires_at)" do
        get "/api/v1/users/me"

        data = JSON.parse(response.body)["data"]
        expect(data).not_to have_key("discord_uid")
        expect(data).not_to have_key("session_expires_at")
      end

      it "does not include meta in the response" do
        get "/api/v1/users/me"

        json = JSON.parse(response.body)
        expect(json).not_to have_key("meta")
      end
    end
  end

  # ---------------------------------------------------------------------------
  # PATCH /api/v1/users/me/preferences
  # ---------------------------------------------------------------------------

  describe "PATCH /api/v1/users/me/preferences" do
    context "when unauthenticated" do
      it "returns HTTP 401 — Requirement 2.7" do
        patch "/api/v1/users/me/preferences", params: { theme_preference: "light" }, as: :json

        expect(response).to have_http_status(:unauthorized)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
      end
    end

    context "when authenticated" do
      before { authenticate_as(user) }

      it "updates theme_preference and returns HTTP 200 — Requirement 7.4" do
        patch "/api/v1/users/me/preferences",
              params: { theme_preference: "light" },
              as: :json

        expect(response).to have_http_status(:ok)
        data = JSON.parse(response.body)["data"]
        expect(data["theme_preference"]).to eq("light")
      end

      it "updates theme_color and returns HTTP 200 — Requirement 7.4" do
        patch "/api/v1/users/me/preferences",
              params: { theme_color: "#ff0000" },
              as: :json

        expect(response).to have_http_status(:ok)
        data = JSON.parse(response.body)["data"]
        expect(data["theme_color"]).to eq("#ff0000")
      end

      it "updates both theme_preference and theme_color together" do
        patch "/api/v1/users/me/preferences",
              params: { theme_preference: "system", theme_color: "#aabbcc" },
              as: :json

        expect(response).to have_http_status(:ok)
        data = JSON.parse(response.body)["data"]
        expect(data["theme_preference"]).to eq("system")
        expect(data["theme_color"]).to eq("#aabbcc")
      end

      it "persists the preference in the database — Requirement 7.4" do
        patch "/api/v1/users/me/preferences",
              params: { theme_preference: "light", theme_color: "#ffffff" },
              as: :json

        user.reload
        expect(user.theme_preference).to eq("light")
        expect(user.theme_color).to eq("#ffffff")
      end

      it "returns the full user profile in the response" do
        patch "/api/v1/users/me/preferences",
              params: { theme_preference: "dark" },
              as: :json

        data = JSON.parse(response.body)["data"]
        expect(data).to have_key("id")
        expect(data).to have_key("username")
        expect(data).to have_key("avatar_url")
        expect(data).to have_key("theme_preference")
        expect(data).to have_key("theme_color")
      end

      context "with invalid theme_preference" do
        it "returns HTTP 422 with validation errors — Requirement 3.4" do
          patch "/api/v1/users/me/preferences",
                params: { theme_preference: "rainbow" },
                as: :json

          expect(response).to have_http_status(:unprocessable_entity)
          json = JSON.parse(response.body)
          expect(json).to have_key("errors")
          expect(json["errors"]).not_to be_empty
        end
      end

      context "with invalid theme_color format" do
        it "returns HTTP 422 for non-hex color — Requirement 3.4" do
          patch "/api/v1/users/me/preferences",
                params: { theme_color: "red" },
                as: :json

          expect(response).to have_http_status(:unprocessable_entity)
          json = JSON.parse(response.body)
          expect(json).to have_key("errors")
        end

        it "returns HTTP 422 for hex without # prefix" do
          patch "/api/v1/users/me/preferences",
                params: { theme_color: "ff0000" },
                as: :json

          expect(response).to have_http_status(:unprocessable_entity)
        end

        it "returns HTTP 422 for short hex" do
          patch "/api/v1/users/me/preferences",
                params: { theme_color: "#fff" },
                as: :json

          expect(response).to have_http_status(:unprocessable_entity)
        end
      end

      context "with valid nil values (clearing preferences)" do
        it "accepts nil theme_preference" do
          patch "/api/v1/users/me/preferences",
                params: { theme_preference: nil },
                as: :json

          expect(response).to have_http_status(:ok)
          data = JSON.parse(response.body)["data"]
          expect(data["theme_preference"]).to be_nil
        end

        it "accepts nil theme_color" do
          patch "/api/v1/users/me/preferences",
                params: { theme_color: nil },
                as: :json

          expect(response).to have_http_status(:ok)
          data = JSON.parse(response.body)["data"]
          expect(data["theme_color"]).to be_nil
        end
      end

      context "with params wrapped in :user key" do
        it "also accepts user-wrapped params" do
          patch "/api/v1/users/me/preferences",
                params: { user: { theme_preference: "light" } },
                as: :json

          expect(response).to have_http_status(:ok)
          data = JSON.parse(response.body)["data"]
          expect(data["theme_preference"]).to eq("light")
        end
      end
    end
  end
end
