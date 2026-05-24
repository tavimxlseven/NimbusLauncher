# frozen_string_literal: true

require "rails_helper"

RSpec.describe "GET /api/v1/launcher/version", type: :request do
  before do
    # Disable CSRF verification for API request specs
    allow_any_instance_of(ApplicationController).to receive(:verify_authenticity_token)
  end

  describe "GET /api/v1/launcher/version" do
    context "when version information exists" do
      let!(:version_info) do
        LauncherVersion.create!(
          current: "1.2.0",
          minimum: "1.1.0",
          download_url: "https://nimbusgg.me/download",
          release_notes: "## What's New\n- Feature A\n- Bug fix B",
          active: true
        )
      end

      it "returns HTTP 200 with version data" do
        get "/api/v1/launcher/version"

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json).to have_key("data")
      end

      it "includes current version" do
        get "/api/v1/launcher/version"

        json = JSON.parse(response.body)
        expect(json["data"]["current"]).to eq("1.2.0")
      end

      it "includes minimum version" do
        get "/api/v1/launcher/version"

        json = JSON.parse(response.body)
        expect(json["data"]["minimum"]).to eq("1.1.0")
      end

      it "includes download URL" do
        get "/api/v1/launcher/version"

        json = JSON.parse(response.body)
        expect(json["data"]["downloadUrl"]).to eq("https://nimbusgg.me/download")
      end

      it "includes release notes when present" do
        get "/api/v1/launcher/version"

        json = JSON.parse(response.body)
        expect(json["data"]["releaseNotes"]).to include("What's New")
      end

      it "does not require authentication — Requirement 7.3" do
        # No authentication setup, should still work
        get "/api/v1/launcher/version"

        expect(response).to have_http_status(:ok)
      end
    end

    context "when no version information exists" do
      before do
        LauncherVersion.destroy_all
      end

      it "returns HTTP 200 with safe default values" do
        get "/api/v1/launcher/version"

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["current"]).to eq("0.0.0")
        expect(json["data"]["minimum"]).to eq("0.0.0")
        expect(json["data"]["downloadUrl"]).to eq("https://nimbusgg.me/download")
      end

      it "does not include releaseNotes in safe default" do
        get "/api/v1/launcher/version"

        json = JSON.parse(response.body)
        expect(json["data"]).not_to have_key("releaseNotes")
      end
    end

    context "when multiple version records exist" do
      let!(:old_version) do
        LauncherVersion.create!(
          current: "1.0.0",
          minimum: "1.0.0",
          download_url: "https://nimbusgg.me/download",
          active: true,
          created_at: 1.day.ago
        )
      end

      let!(:new_version) do
        LauncherVersion.create!(
          current: "1.2.0",
          minimum: "1.1.0",
          download_url: "https://nimbusgg.me/download",
          active: true,
          created_at: Time.current
        )
      end

      it "returns the most recent active version" do
        get "/api/v1/launcher/version"

        json = JSON.parse(response.body)
        expect(json["data"]["current"]).to eq("1.2.0")
      end
    end

    context "response format" do
      let!(:version_info) do
        LauncherVersion.create!(
          current: "1.2.0",
          minimum: "1.1.0",
          download_url: "https://nimbusgg.me/download",
          active: true
        )
      end

      it "uses camelCase for JSON keys" do
        get "/api/v1/launcher/version"

        json = JSON.parse(response.body)
        expect(json["data"]).to have_key("downloadUrl")
        expect(json["data"]).not_to have_key("download_url")
      end

      it "does not include meta in the response" do
        get "/api/v1/launcher/version"

        json = JSON.parse(response.body)
        expect(json).not_to have_key("meta")
      end
    end
  end
end
