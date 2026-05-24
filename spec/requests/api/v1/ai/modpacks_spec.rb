# frozen_string_literal: true

require "rails_helper"

# Ensure ManifestService value objects are autoloaded before the spec helpers
# reference them. Zeitwerk loads these lazily, so we trigger it explicitly.
require_relative "../../../../../app/services/manifest_service/value_objects"
require_relative "../../../../../app/services/ai_service"
require_relative "../../../../../app/services/ai_service/modpack_generator"

# Request specs for Api::V1::Ai::ModpacksController
#
# Covers:
#   POST  /api/v1/ai/generate              — generate a new modpack
#   PATCH /api/v1/ai/modpacks/:id/adjust   — adjust an existing modpack
#
# Requirements: 11.3, 11.7, 11.9
RSpec.describe "Api::V1::AI::ModpacksController", type: :request do
  let(:user) { create(:user) }

  before do
    # Disable CSRF verification for API request specs
    allow_any_instance_of(ApplicationController).to receive(:verify_authenticity_token)
  end

  # Helper: simulate an authenticated session by stubbing current_user.
  def authenticate_as(u)
    allow_any_instance_of(ApplicationController).to receive(:current_user).and_return(u)
  end

  # ---------------------------------------------------------------------------
  # Shared helpers for stubbing AIService::ModpackGenerator
  # ---------------------------------------------------------------------------

  def build_generation_result(modpack_name: "Tech Pack", minecraft_version: "1.20.1", loader: :forge)
    mods = [
      ManifestService::ModEntry.new(
        source:     :curseforge,
        project_id: "100",
        version_id: "200",
        filename:   "sodium.jar",
        sha256:     nil
      ),
      ManifestService::ModEntry.new(
        source:     :curseforge,
        project_id: "101",
        version_id: "201",
        filename:   "create.jar",
        sha256:     nil
      ),
      ManifestService::ModEntry.new(
        source:     :curseforge,
        project_id: "102",
        version_id: "202",
        filename:   "jei.jar",
        sha256:     nil
      )
    ]

    modpack = ManifestService::Modpack.new(
      name:              modpack_name,
      minecraft_version: minecraft_version,
      loader:            loader,
      loader_version:    "47.2.0",
      mods:              mods
    )

    selected_mods = [
      { source: :curseforge, project_id: "100", version_id: "200", slug: "sodium",    name: "Sodium",    rating: 4.5, downloads: 100_000 },
      { source: :curseforge, project_id: "101", version_id: "201", slug: "create",    name: "Create",    rating: 4.8, downloads: 80_000 },
      { source: :curseforge, project_id: "102", version_id: "202", slug: "jei",       name: "JEI",       rating: 4.2, downloads: 70_000 }
    ]

    AIService::GenerationResult.new(
      modpack:        modpack,
      selected_mods:  selected_mods,
      substitutions:  [],
      removed_mods:   [],
      optional_mods:  [],
      kubejs_scripts: [],
      report: {
        description:       "tech modpack",
        minecraft_version: minecraft_version,
        loader:            loader,
        total_mods:        3,
        generated_at:      Time.current.iso8601,
        mods:              selected_mods.map { |m| { name: m[:name], justification: "Good mod" } }
      }
    )
  end

  def stub_generator_generate(result)
    generator_double = instance_double(AIService::ModpackGenerator)
    allow(AIService::ModpackGenerator).to receive(:new).and_return(generator_double)
    allow(generator_double).to receive(:generate).and_return(result)
    generator_double
  end

  def stub_generator_adjust(result)
    generator_double = instance_double(AIService::ModpackGenerator)
    allow(AIService::ModpackGenerator).to receive(:new).and_return(generator_double)
    allow(generator_double).to receive(:adjust).and_return(result)
    generator_double
  end

  def stub_generator_raise(error_class, *args, **kwargs)
    generator_double = instance_double(AIService::ModpackGenerator)
    allow(AIService::ModpackGenerator).to receive(:new).and_return(generator_double)
    allow(generator_double).to receive(:generate).and_raise(error_class.new(*args, **kwargs))
    generator_double
  end

  # ---------------------------------------------------------------------------
  # POST /api/v1/ai/generate
  # ---------------------------------------------------------------------------

  describe "POST /api/v1/ai/generate" do
    let(:valid_params) do
      {
        description:       "tech modpack with automation",
        minecraft_version: "1.20.1",
        loader:            "forge"
      }
    end

    # ── Authentication ────────────────────────────────────────────────────────

    context "when unauthenticated" do
      it "returns HTTP 401 — Requirement 2.7" do
        post "/api/v1/ai/generate", params: valid_params

        expect(response).to have_http_status(:unauthorized)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
        expect(json["errors"].first["code"]).to eq("unauthorized")
      end
    end

    # ── Successful generation ─────────────────────────────────────────────────

    context "when authenticated with valid params" do
      before { authenticate_as(user) }

      it "returns HTTP 201 with the generated modpack — Requirement 11.1" do
        stub_generator_generate(build_generation_result)

        post "/api/v1/ai/generate", params: valid_params

        expect(response).to have_http_status(:created)
        json = JSON.parse(response.body)
        expect(json).to have_key("data")
        expect(json["data"]["minecraft_version"]).to eq("1.20.1")
        expect(json["data"]["loader"]).to eq("forge")
      end

      it "persists a GeneratedModpack record" do
        stub_generator_generate(build_generation_result)

        expect {
          post "/api/v1/ai/generate", params: valid_params
        }.to change(GeneratedModpack, :count).by(1)
      end

      it "associates the modpack with the current user" do
        stub_generator_generate(build_generation_result)

        post "/api/v1/ai/generate", params: valid_params

        modpack = GeneratedModpack.last
        expect(modpack.user_id).to eq(user.id)
      end

      it "persists GeneratedMod records for selected mods" do
        stub_generator_generate(build_generation_result)

        expect {
          post "/api/v1/ai/generate", params: valid_params
        }.to change(GeneratedMod, :count).by(3)
      end

      it "returns selected_mods in the response" do
        stub_generator_generate(build_generation_result)

        post "/api/v1/ai/generate", params: valid_params

        json = JSON.parse(response.body)
        expect(json["data"]["selected_mods"]).to be_an(Array)
        expect(json["data"]["selected_mods"].size).to eq(3)
      end

      it "returns the report in the response — Requirement 11.5" do
        stub_generator_generate(build_generation_result)

        post "/api/v1/ai/generate", params: valid_params

        json = JSON.parse(response.body)
        expect(json["data"]["report"]).to be_a(Hash)
        expect(json["data"]["report"]).to have_key("total_mods")
      end

      it "returns status 'completed' for the persisted modpack" do
        stub_generator_generate(build_generation_result)

        post "/api/v1/ai/generate", params: valid_params

        modpack = GeneratedModpack.last
        expect(modpack.status).to eq("completed")
      end
    end

    # ── Missing / invalid params ──────────────────────────────────────────────

    context "when authenticated with missing params" do
      before { authenticate_as(user) }

      it "returns HTTP 422 when description is blank" do
        post "/api/v1/ai/generate", params: valid_params.merge(description: "")

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].any? { |e| e["field"] == "description" }).to be true
      end

      it "returns HTTP 422 when description exceeds 500 characters" do
        post "/api/v1/ai/generate", params: valid_params.merge(description: "a" * 501)

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].any? { |e| e["field"] == "description" }).to be true
      end

      it "returns HTTP 422 when minecraft_version is blank" do
        post "/api/v1/ai/generate", params: valid_params.merge(minecraft_version: "")

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].any? { |e| e["field"] == "minecraft_version" }).to be true
      end

      it "returns HTTP 422 when loader is blank" do
        post "/api/v1/ai/generate", params: valid_params.merge(loader: "")

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].any? { |e| e["field"] == "loader" }).to be true
      end

      it "returns HTTP 422 when loader is invalid" do
        post "/api/v1/ai/generate", params: valid_params.merge(loader: "invalid_loader")

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].any? { |e| e["field"] == "loader" }).to be true
      end

      it "does not persist a GeneratedModpack on validation failure" do
        expect {
          post "/api/v1/ai/generate", params: valid_params.merge(description: "")
        }.not_to change(GeneratedModpack, :count)
      end
    end

    # ── InsufficientModsError (Req 11.7) ──────────────────────────────────────

    context "when the AI cannot find enough mods — Requirement 11.7" do
      before { authenticate_as(user) }

      it "returns HTTP 422 with code 'insufficient_mods'" do
        stub_generator_raise(
          AIService::InsufficientModsError,
          "Apenas 1 mod encontrado. Mínimo necessário: 3.",
          suggestions: ["Try a broader description", "Add 'tech' to your description"]
        )

        post "/api/v1/ai/generate", params: valid_params

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].first["code"]).to eq("insufficient_mods")
      end

      it "includes alternative suggestions in the error response" do
        stub_generator_raise(
          AIService::InsufficientModsError,
          "Mods insuficientes.",
          suggestions: ["Try 'tech modpack'", "Try 'magic modpack'"]
        )

        post "/api/v1/ai/generate", params: valid_params

        json = JSON.parse(response.body)
        expect(json["errors"].first["suggestions"]).to be_an(Array)
        expect(json["errors"].first["suggestions"]).not_to be_empty
      end

      it "does not persist a GeneratedModpack" do
        stub_generator_raise(AIService::InsufficientModsError, "Not enough mods.", suggestions: [])

        expect {
          post "/api/v1/ai/generate", params: valid_params
        }.not_to change(GeneratedModpack, :count)
      end
    end

    # ── CompatibilityError — irresolvable conflicts (Req 11.3) ────────────────

    context "when irresolvable compatibility conflicts are detected — Requirement 11.3" do
      before { authenticate_as(user) }

      it "returns HTTP 422 with code 'compatibility_error'" do
        stub_generator_raise(
          AIService::CompatibilityError,
          "Conflitos irresolvíveis detectados.",
          conflicting_mods: ["sodium", "optifine"]
        )

        post "/api/v1/ai/generate", params: valid_params

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].first["code"]).to eq("compatibility_error")
      end

      it "lists the conflicting mods in the error response" do
        stub_generator_raise(
          AIService::CompatibilityError,
          "Conflitos irresolvíveis.",
          conflicting_mods: ["sodium", "optifine"]
        )

        post "/api/v1/ai/generate", params: valid_params

        json = JSON.parse(response.body)
        expect(json["errors"].first["conflicting_mods"]).to include("sodium", "optifine")
      end

      it "does not persist a GeneratedModpack" do
        stub_generator_raise(
          AIService::CompatibilityError,
          "Conflitos.",
          conflicting_mods: ["mod-a", "mod-b"]
        )

        expect {
          post "/api/v1/ai/generate", params: valid_params
        }.not_to change(GeneratedModpack, :count)
      end
    end

    # ── External API unavailability (Req 11.9) ────────────────────────────────

    context "when an external API is unavailable — Requirement 11.9" do
      before { authenticate_as(user) }

      it "returns HTTP 503 when both APIs are unavailable" do
        generator_double = instance_double(AIService::ModpackGenerator)
        allow(AIService::ModpackGenerator).to receive(:new).and_return(generator_double)
        allow(generator_double).to receive(:generate).and_raise(
          ExternalAPI::ServiceUnavailableError.new(:curseforge)
        )

        post "/api/v1/ai/generate", params: valid_params

        expect(response).to have_http_status(:service_unavailable)
        json = JSON.parse(response.body)
        expect(json["errors"].first["code"]).to eq("service_unavailable")
      end

      it "succeeds when only one API is unavailable (service proceeds with the other)" do
        # The AIService handles partial unavailability internally and still returns a result.
        # This test verifies the controller returns 201 when the service succeeds despite
        # one API being unavailable (Req 11.9: proceed with available API).
        stub_generator_generate(build_generation_result)

        post "/api/v1/ai/generate", params: valid_params

        expect(response).to have_http_status(:created)
      end
    end
  end

  # ---------------------------------------------------------------------------
  # PATCH /api/v1/ai/modpacks/:id/adjust
  # ---------------------------------------------------------------------------

  describe "PATCH /api/v1/ai/modpacks/:id/adjust" do
    let(:modpack_record) do
      create(:generated_modpack,
             user:              user,
             status:            "completed",
             minecraft_version: "1.20.1",
             loader:            "forge",
             loader_version:    "47.2.0",
             manifest_json:     nil)
    end

    let(:valid_adjust_params) { { instruction: "remove magic mods and add more tech" } }

    # ── Authentication ────────────────────────────────────────────────────────

    context "when unauthenticated" do
      it "returns HTTP 401 — Requirement 2.7" do
        patch "/api/v1/ai/modpacks/#{modpack_record.id}/adjust", params: valid_adjust_params

        expect(response).to have_http_status(:unauthorized)
        json = JSON.parse(response.body)
        expect(json["errors"].first["code"]).to eq("unauthorized")
      end
    end

    # ── Successful adjustment ─────────────────────────────────────────────────

    context "when authenticated with valid params" do
      before { authenticate_as(user) }

      it "returns HTTP 200 with the updated modpack — Requirement 11.6" do
        stub_generator_adjust(build_generation_result(modpack_name: modpack_record.name))

        patch "/api/v1/ai/modpacks/#{modpack_record.id}/adjust", params: valid_adjust_params

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json).to have_key("data")
        expect(json["data"]["id"]).to eq(modpack_record.id)
      end

      it "updates the GeneratedModpack record" do
        stub_generator_adjust(build_generation_result(modpack_name: modpack_record.name))

        patch "/api/v1/ai/modpacks/#{modpack_record.id}/adjust", params: valid_adjust_params

        modpack_record.reload
        expect(modpack_record.status).to eq("completed")
        expect(modpack_record.mod_count).to eq(3)
      end

      it "replaces GeneratedMod records with the adjusted set" do
        # Pre-existing mods
        create_list(:generated_mod, 2, generated_modpack: modpack_record)

        stub_generator_adjust(build_generation_result(modpack_name: modpack_record.name))

        patch "/api/v1/ai/modpacks/#{modpack_record.id}/adjust", params: valid_adjust_params

        # Should now have exactly 3 mods (from the stub result)
        expect(modpack_record.reload.generated_mods.count).to eq(3)
      end

      it "returns selected_mods in the response" do
        stub_generator_adjust(build_generation_result(modpack_name: modpack_record.name))

        patch "/api/v1/ai/modpacks/#{modpack_record.id}/adjust", params: valid_adjust_params

        json = JSON.parse(response.body)
        expect(json["data"]["selected_mods"]).to be_an(Array)
        expect(json["data"]["selected_mods"].size).to eq(3)
      end
    end

    # ── Missing instruction ───────────────────────────────────────────────────

    context "when instruction is blank" do
      before { authenticate_as(user) }

      it "returns HTTP 422" do
        patch "/api/v1/ai/modpacks/#{modpack_record.id}/adjust", params: { instruction: "" }

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].any? { |e| e["field"] == "instruction" }).to be true
      end
    end

    # ── Not found ─────────────────────────────────────────────────────────────

    context "when the modpack does not exist" do
      before { authenticate_as(user) }

      it "returns HTTP 404" do
        patch "/api/v1/ai/modpacks/999999/adjust", params: valid_adjust_params

        expect(response).to have_http_status(:not_found)
        json = JSON.parse(response.body)
        expect(json).to have_key("errors")
      end
    end

    context "when the modpack belongs to another user" do
      before { authenticate_as(user) }

      it "returns HTTP 404 (scoped to current user)" do
        other_user = create(:user)
        other_modpack = create(:generated_modpack, user: other_user)

        patch "/api/v1/ai/modpacks/#{other_modpack.id}/adjust", params: valid_adjust_params

        expect(response).to have_http_status(:not_found)
      end
    end

    # ── InsufficientModsError after adjustment (Req 11.7) ─────────────────────

    context "when adjustment results in insufficient mods — Requirement 11.7" do
      before { authenticate_as(user) }

      it "returns HTTP 422 with code 'insufficient_mods'" do
        generator_double = instance_double(AIService::ModpackGenerator)
        allow(AIService::ModpackGenerator).to receive(:new).and_return(generator_double)
        allow(generator_double).to receive(:adjust).and_raise(
          AIService::InsufficientModsError.new("Após ajuste, apenas 1 mod restou.", suggestions: [])
        )

        patch "/api/v1/ai/modpacks/#{modpack_record.id}/adjust", params: valid_adjust_params

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].first["code"]).to eq("insufficient_mods")
      end
    end

    # ── CompatibilityError after adjustment (Req 11.3) ────────────────────────

    context "when adjustment introduces irresolvable conflicts — Requirement 11.3" do
      before { authenticate_as(user) }

      it "returns HTTP 422 with code 'compatibility_error'" do
        generator_double = instance_double(AIService::ModpackGenerator)
        allow(AIService::ModpackGenerator).to receive(:new).and_return(generator_double)
        allow(generator_double).to receive(:adjust).and_raise(
          AIService::CompatibilityError.new("Conflitos após ajuste.", conflicting_mods: ["mod-x", "mod-y"])
        )

        patch "/api/v1/ai/modpacks/#{modpack_record.id}/adjust", params: valid_adjust_params

        expect(response).to have_http_status(:unprocessable_entity)
        json = JSON.parse(response.body)
        expect(json["errors"].first["code"]).to eq("compatibility_error")
        expect(json["errors"].first["conflicting_mods"]).to include("mod-x", "mod-y")
      end
    end

    # ── External API unavailability during adjustment (Req 11.9) ──────────────

    context "when an external API is unavailable during adjustment — Requirement 11.9" do
      before { authenticate_as(user) }

      it "returns HTTP 503 when the service raises ServiceUnavailableError" do
        generator_double = instance_double(AIService::ModpackGenerator)
        allow(AIService::ModpackGenerator).to receive(:new).and_return(generator_double)
        allow(generator_double).to receive(:adjust).and_raise(
          ExternalAPI::ServiceUnavailableError.new(:modrinth)
        )

        patch "/api/v1/ai/modpacks/#{modpack_record.id}/adjust", params: valid_adjust_params

        expect(response).to have_http_status(:service_unavailable)
        json = JSON.parse(response.body)
        expect(json["errors"].first["code"]).to eq("service_unavailable")
      end
    end
  end
end
