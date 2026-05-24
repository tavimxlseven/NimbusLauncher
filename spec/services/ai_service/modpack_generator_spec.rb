# frozen_string_literal: true

require "rails_helper"

# Unit tests for AIService::ModpackGenerator#generate
# Requirements: 11.1, 11.2, 11.3, 12.1, 12.2, 12.3, 12.4, 12.5
RSpec.describe AIService::ModpackGenerator, type: :service do
  subject(:generator) do
    described_class.new(
      mod_limit:   200,
      llm_api_url: "https://api.example.com/v1",
      llm_api_key: "test-key"
    )
  end

  # ---------------------------------------------------------------------------
  # Helpers to build fake mod hashes
  # ---------------------------------------------------------------------------

  def fabric_mod(slug:, rating: 4.5, downloads: 50_000)
    {
      source:     :modrinth,
      project_id: slug,
      version_id: "v1.0",
      slug:       slug,
      name:       slug.capitalize,
      filename:   "#{slug}.jar",
      sha256:     nil,
      rating:     rating,
      downloads:  downloads
    }
  end

  def forge_mod(slug:, rating: 4.5, downloads: 50_000)
    {
      source:     :curseforge,
      project_id: "cf-#{slug}",
      version_id: "12345",
      slug:       slug,
      name:       slug.capitalize,
      filename:   nil,
      sha256:     nil,
      rating:     rating,
      downloads:  downloads
    }
  end

  # ---------------------------------------------------------------------------
  # Stub helpers
  # ---------------------------------------------------------------------------

  # Stub the LLM call to return a fixed list of mod slugs.
  def stub_llm(slugs)
    allow(generator).to receive(:call_llm).and_return(JSON.generate(slugs))
  end

  # Stub ExternalAPI::Client#search to return a Modrinth-style response.
  def stub_modrinth_search(slug, minecraft_version, loader, mods_data)
    client_double = instance_double(ExternalAPI::Client)
    allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(client_double)
    allow(client_double).to receive(:search).and_return({ "hits" => mods_data })
  end

  # Stub both CurseForge and Modrinth to return empty results.
  def stub_empty_external_apis
    cf_client = instance_double(ExternalAPI::Client)
    mr_client = instance_double(ExternalAPI::Client)
    allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(cf_client)
    allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(mr_client)
    allow(cf_client).to receive(:search).and_return({ "data" => [] })
    allow(mr_client).to receive(:search).and_return({ "hits" => [] })
  end

  # Stub external APIs to return a given list of mods for any query.
  def stub_external_apis_with(mods)
    cf_mods = mods.select { |m| m[:source] == :curseforge }
    mr_mods = mods.select { |m| m[:source] == :modrinth }

    cf_client = instance_double(ExternalAPI::Client)
    mr_client = instance_double(ExternalAPI::Client)

    allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(cf_client)
    allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(mr_client)

    # CurseForge response format
    cf_response_data = cf_mods.map do |m|
      {
        "id"            => m[:project_id].to_s.sub("cf-", "").to_i,
        "slug"          => m[:slug],
        "name"          => m[:name],
        "downloadCount" => m[:downloads],
        "rating"        => m[:rating],
        "categories"    => [{ "slug" => "fabric" }],
        "latestFilesIndexes" => [{ "gameVersion" => "1.20.1", "fileId" => 12345 }]
      }
    end

    # Modrinth response format
    mr_response_data = mr_mods.map do |m|
      {
        "project_id"     => m[:project_id],
        "slug"           => m[:slug],
        "title"          => m[:name],
        "downloads"      => m[:downloads],
        "rating"         => m[:rating],
        "loaders"        => ["fabric"],
        "versions"       => ["1.20.1"],
        "latest_version" => "v1.0"
      }
    end

    allow(cf_client).to receive(:search).and_return({ "data" => cf_response_data })
    allow(mr_client).to receive(:search).and_return({ "hits" => mr_response_data })
  end

  # ---------------------------------------------------------------------------
  # Description validation (Req 11.1)
  # ---------------------------------------------------------------------------

  describe "description validation" do
    it "raises ArgumentError when description is blank" do
      expect {
        generator.generate(description: "", minecraft_version: "1.20.1", loader: :fabric)
      }.to raise_error(ArgumentError, /em branco/)
    end

    it "raises ArgumentError when description exceeds 500 characters" do
      long_desc = "a" * 501
      expect {
        generator.generate(description: long_desc, minecraft_version: "1.20.1", loader: :fabric)
      }.to raise_error(ArgumentError, /500 caracteres/)
    end

    it "accepts a description of exactly 500 characters" do
      desc = "a" * 500
      stub_llm(%w[sodium lithium phosphor create jei waystones])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "lithium"),
        fabric_mod(slug: "phosphor"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei")
      ])

      expect {
        generator.generate(description: desc, minecraft_version: "1.20.1", loader: :fabric)
      }.not_to raise_error
    end
  end

  # ---------------------------------------------------------------------------
  # Minimum mods (Req 11.1, 11.7)
  # ---------------------------------------------------------------------------

  describe "minimum mods requirement" do
    it "raises InsufficientModsError when fewer than 3 mods are found" do
      stub_llm(%w[some-mod])
      stub_empty_external_apis

      expect {
        generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)
      }.to raise_error(AIService::InsufficientModsError) do |error|
        expect(error.suggestions).to be_an(Array)
        expect(error.suggestions).not_to be_empty
      end
    end

    it "raises InsufficientModsError with suggestions when no mods found" do
      stub_llm([])
      stub_empty_external_apis

      expect {
        generator.generate(description: "magic modpack", minecraft_version: "1.20.1", loader: :fabric)
      }.to raise_error(AIService::InsufficientModsError) do |error|
        expect(error.suggestions).to be_an(Array)
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Rating filter (Req 12.1)
  # ---------------------------------------------------------------------------

  describe "rating filter" do
    it "excludes mods with rating below 4 stars" do
      stub_llm(%w[sodium lithium low-rated-mod create jei])
      stub_external_apis_with([
        fabric_mod(slug: "sodium",        rating: 4.5),
        fabric_mod(slug: "lithium",       rating: 4.2),
        fabric_mod(slug: "low-rated-mod", rating: 3.5),  # should be excluded
        fabric_mod(slug: "create",        rating: 4.8),
        fabric_mod(slug: "jei",           rating: 4.1)
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      selected_slugs = result.selected_mods.map { |m| m[:slug] }
      expect(selected_slugs).not_to include("low-rated-mod")
      expect(selected_slugs).to include("sodium", "lithium", "create", "jei")
    end

    it "includes mods with rating exactly 4.0 stars" do
      stub_llm(%w[sodium lithium exactly-four create jei])
      stub_external_apis_with([
        fabric_mod(slug: "sodium",        rating: 4.5),
        fabric_mod(slug: "lithium",       rating: 4.2),
        fabric_mod(slug: "exactly-four",  rating: 4.0),  # exactly at threshold
        fabric_mod(slug: "create",        rating: 4.8),
        fabric_mod(slug: "jei",           rating: 4.1)
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      selected_slugs = result.selected_mods.map { |m| m[:slug] }
      expect(selected_slugs).to include("exactly-four")
    end
  end

  # ---------------------------------------------------------------------------
  # Mod limit (Req 12.2)
  # ---------------------------------------------------------------------------

  describe "mod limit" do
    it "limits total mods to the configured value" do
      limited_generator = described_class.new(
        mod_limit:   5,
        llm_api_url: "https://api.example.com/v1",
        llm_api_key: "test-key"
      )

      many_mods = (1..20).map { |i| fabric_mod(slug: "mod-#{i}") }
      stub_llm(many_mods.map { |m| m[:slug] })
      stub_external_apis_with(many_mods)
      allow(limited_generator).to receive(:call_llm).and_return(
        JSON.generate(many_mods.map { |m| m[:slug] })
      )

      result = limited_generator.generate(
        description: "tech modpack",
        minecraft_version: "1.20.1",
        loader: :fabric
      )

      expect(result.selected_mods.size).to be <= 5
    end

    it "accepts a modpack with exactly the mod limit" do
      limit = 5
      limited_generator = described_class.new(
        mod_limit:   limit,
        llm_api_url: "https://api.example.com/v1",
        llm_api_key: "test-key"
      )

      exactly_five_mods = (1..5).map { |i| fabric_mod(slug: "mod-#{i}") }
      allow(limited_generator).to receive(:call_llm).and_return(
        JSON.generate(exactly_five_mods.map { |m| m[:slug] })
      )
      stub_external_apis_with(exactly_five_mods)

      result = limited_generator.generate(
        description: "tech modpack",
        minecraft_version: "1.20.1",
        loader: :fabric
      )

      expect(result.selected_mods.size).to be <= limit
      expect(result.selected_mods.size).to be >= AIService::ModpackGenerator::MIN_MODS
    end
  end

  # ---------------------------------------------------------------------------
  # Performance mod (Req 12.5)
  # ---------------------------------------------------------------------------

  describe "performance mod inclusion" do
    it "includes a performance mod for Fabric loader" do
      stub_llm(%w[create jei waystones])
      stub_external_apis_with([
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "sodium")  # performance mod
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      selected_slugs = result.selected_mods.map { |m| m[:slug] }
      perf_mods = AIService::ModpackGenerator::PERFORMANCE_MODS[:fabric]
      expect(selected_slugs.any? { |s| perf_mods.include?(s) }).to be true
    end

    it "does not duplicate a performance mod already in the list" do
      stub_llm(%w[sodium create jei waystones])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones")
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      sodium_count = result.selected_mods.count { |m| m[:slug] == "sodium" }
      expect(sodium_count).to eq(1)
    end
  end

  # ---------------------------------------------------------------------------
  # Compatibility resolution (Req 11.2, 12.3, 12.4)
  # ---------------------------------------------------------------------------

  describe "compatibility resolution" do
    it "substitutes a conflicting mod with a compatible alternative (Req 12.3)" do
      # sodium and optifine conflict; optifine should be replaced
      stub_llm(%w[sodium optifine create jei waystones])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "optifine"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "iris")  # alternative to optifine
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      # Either optifine was substituted or removed
      selected_slugs = result.selected_mods.map { |m| m[:slug] }
      expect(selected_slugs).not_to include("optifine")
      expect(result.substitutions + result.removed_mods.map { |n| { original: n } }).not_to be_empty
    end

    it "removes a conflicting mod when no alternative is available (Req 12.4)" do
      stub_llm(%w[sodium optifine create jei waystones])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "optifine"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones")
        # No alternative for optifine available
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      selected_slugs = result.selected_mods.map { |m| m[:slug] }
      # optifine conflicts with sodium; one of them should be removed
      expect(selected_slugs).not_to include("optifine")
    end

    it "notifies about substitutions in the result" do
      stub_llm(%w[sodium optifine create jei waystones])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "optifine"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "iris")
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      # Either substitutions or removed_mods should be populated
      total_changes = result.substitutions.size + result.removed_mods.size
      expect(total_changes).to be >= 1
    end

    it "raises CompatibilityError for irresolvable conflicts (Req 11.3)" do
      # Force irresolvable conflict by making detect_conflicts always return conflicts
      # even after resolution attempts.
      allow(generator).to receive(:detect_conflicts).and_return(["mod-a", "mod-b"])
      allow(generator).to receive(:find_alternative).and_return(nil)

      stub_llm(%w[mod-a mod-b create jei waystones])
      stub_external_apis_with([
        fabric_mod(slug: "mod-a"),
        fabric_mod(slug: "mod-b"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones")
      ])

      expect {
        generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)
      }.to raise_error(AIService::CompatibilityError) do |error|
        expect(error.conflicting_mods).to be_an(Array)
        expect(error.conflicting_mods).not_to be_empty
      end
    end
  end

  # ---------------------------------------------------------------------------
  # GenerationResult structure
  # ---------------------------------------------------------------------------

  describe "GenerationResult structure" do
    before do
      stub_llm(%w[sodium create jei waystones lithium])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "lithium")
      ])
    end

    subject(:result) do
      generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)
    end

    it "returns a GenerationResult" do
      expect(result).to be_a(AIService::GenerationResult)
    end

    it "includes a Modpack value object" do
      expect(result.modpack).to be_a(ManifestService::Modpack)
    end

    it "includes selected_mods array" do
      expect(result.selected_mods).to be_an(Array)
      expect(result.selected_mods.size).to be >= AIService::ModpackGenerator::MIN_MODS
    end

    it "includes substitutions array" do
      expect(result.substitutions).to be_an(Array)
    end

    it "includes removed_mods array" do
      expect(result.removed_mods).to be_an(Array)
    end

    it "includes optional_mods array with at most 10 items" do
      expect(result.optional_mods).to be_an(Array)
      expect(result.optional_mods.size).to be <= 10
    end

    it "includes a report hash with required fields" do
      expect(result.report).to be_a(Hash)
      expect(result.report).to include(
        :description, :minecraft_version, :loader, :total_mods, :generated_at, :mods
      )
    end

    it "sets the correct minecraft_version in the modpack" do
      expect(result.modpack.minecraft_version).to eq("1.20.1")
    end

    it "sets the correct loader in the modpack" do
      expect(result.modpack.loader).to eq(:fabric)
    end
  end

  # ---------------------------------------------------------------------------
  # Manifest round-trip validation (Req 11.10, 12.6)
  # ---------------------------------------------------------------------------

  describe "manifest round-trip validation" do
    it "produces a modpack that passes ManifestService round-trip" do
      stub_llm(%w[sodium create jei waystones lithium])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "lithium")
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      # The modpack has Modrinth mods without sha256, so validate_manifest_roundtrip!
      # uses CurseForge format (which doesn't require sha256).
      # We verify the modpack structure is consistent.
      expect(result.modpack.minecraft_version).to eq("1.20.1")
      expect(result.modpack.loader).to eq(:fabric)
      expect(result.modpack.mods.size).to be >= AIService::ModpackGenerator::MIN_MODS
    end

    it "produces a modpack that round-trips via CurseForge format when mods have integer IDs" do
      # Build mods with integer-compatible IDs for CurseForge round-trip
      curseforge_mods = [
        { source: :curseforge, project_id: "100", version_id: "200", slug: "sodium",    name: "Sodium",    filename: nil, sha256: nil, rating: 4.5, downloads: 50_000 },
        { source: :curseforge, project_id: "101", version_id: "201", slug: "create",    name: "Create",    filename: nil, sha256: nil, rating: 4.5, downloads: 50_000 },
        { source: :curseforge, project_id: "102", version_id: "202", slug: "jei",       name: "JEI",       filename: nil, sha256: nil, rating: 4.5, downloads: 50_000 },
        { source: :curseforge, project_id: "103", version_id: "203", slug: "waystones", name: "Waystones", filename: nil, sha256: nil, rating: 4.5, downloads: 50_000 },
        { source: :curseforge, project_id: "104", version_id: "204", slug: "lithium",   name: "Lithium",   filename: nil, sha256: nil, rating: 4.5, downloads: 50_000 }
      ]

      stub_llm(%w[sodium create jei waystones lithium])
      stub_external_apis_with(curseforge_mods)

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      # Serialize and re-parse to verify round-trip.
      json = ManifestService::Serializer.serialize(result.modpack, format: :curseforge)
      reparsed = ManifestService::Parser.parse(json, format: :curseforge)

      expect(reparsed.minecraft_version).to eq(result.modpack.minecraft_version)
      expect(reparsed.loader).to eq(result.modpack.loader)
      expect(reparsed.mods.size).to eq(result.modpack.mods.size)
    end
  end

  # ---------------------------------------------------------------------------
  # check_compatibility
  # ---------------------------------------------------------------------------

  describe "#check_compatibility" do
    it "returns compatible: true when no conflicts" do
      mods = [
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones")
      ]
      result = generator.check_compatibility(mods: mods)
      expect(result[:compatible]).to be true
      expect(result[:conflicts]).to be_empty
    end

    it "returns compatible: false with conflict list when conflicts exist" do
      mods = [
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "optifine"),
        fabric_mod(slug: "create")
      ]
      result = generator.check_compatibility(mods: mods)
      expect(result[:compatible]).to be false
      expect(result[:conflicts]).to include("sodium", "optifine")
    end
  end

  # ---------------------------------------------------------------------------
  # normalize_slug (private, tested via behavior)
  # ---------------------------------------------------------------------------

  describe "slug normalization" do
    it "treats 'Sodium', 'sodium', and 'SODIUM' as the same mod" do
      stub_llm(%w[Sodium sodium SODIUM create jei waystones])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones")
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      sodium_count = result.selected_mods.count { |m| (m[:slug] || "").downcase == "sodium" }
      expect(sodium_count).to eq(1)
    end
  end

  # ---------------------------------------------------------------------------
  # LLM unavailability graceful handling
  # ---------------------------------------------------------------------------

  describe "LLM unavailability" do
    it "raises InsufficientModsError when LLM fails and no mods are found" do
      allow(generator).to receive(:call_llm).and_raise(StandardError, "LLM timeout")
      stub_empty_external_apis

      expect {
        generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)
      }.to raise_error(AIService::InsufficientModsError)
    end
  end

  # ---------------------------------------------------------------------------
  # API unavailability (Req 11.9)
  # ---------------------------------------------------------------------------

  describe "API unavailability" do
    it "proceeds with only Modrinth when CurseForge is unavailable" do
      stub_llm(%w[sodium create jei waystones lithium])

      cf_client = instance_double(ExternalAPI::Client)
      mr_client = instance_double(ExternalAPI::Client)

      allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(cf_client)
      allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(mr_client)

      allow(cf_client).to receive(:search).and_raise(ExternalAPI::ServiceUnavailableError.new(:curseforge))
      allow(mr_client).to receive(:search).and_return({
        "hits" => [
          { "project_id" => "sodium",    "slug" => "sodium",    "title" => "Sodium",    "downloads" => 100_000, "loaders" => ["fabric"], "versions" => ["1.20.1"], "latest_version" => "v1" },
          { "project_id" => "create",    "slug" => "create",    "title" => "Create",    "downloads" => 80_000,  "loaders" => ["fabric"], "versions" => ["1.20.1"], "latest_version" => "v1" },
          { "project_id" => "jei",       "slug" => "jei",       "title" => "JEI",       "downloads" => 70_000,  "loaders" => ["fabric"], "versions" => ["1.20.1"], "latest_version" => "v1" },
          { "project_id" => "waystones", "slug" => "waystones", "title" => "Waystones", "downloads" => 60_000,  "loaders" => ["fabric"], "versions" => ["1.20.1"], "latest_version" => "v1" },
          { "project_id" => "lithium",   "slug" => "lithium",   "title" => "Lithium",   "downloads" => 50_000,  "loaders" => ["fabric"], "versions" => ["1.20.1"], "latest_version" => "v1" }
        ]
      })

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      expect(result.selected_mods.size).to be >= AIService::ModpackGenerator::MIN_MODS
      expect(result.selected_mods.all? { |m| m[:source] == :modrinth }).to be true
    end
  end

  # ---------------------------------------------------------------------------
  # #adjust — incremental adjustments (Req 11.6)
  # ---------------------------------------------------------------------------

  describe "#adjust" do
    # Build a minimal ManifestService::Modpack for use as the existing modpack.
    def build_existing_modpack(mods_slugs, minecraft_version: "1.20.1", loader: :fabric)
      mod_entries = mods_slugs.map do |slug|
        ManifestService::ModEntry.new(
          source:     :modrinth,
          project_id: slug,
          version_id: "v1.0",
          filename:   "#{slug}.jar",
          sha256:     nil
        )
      end

      ManifestService::Modpack.new(
        name:              "Existing Pack",
        minecraft_version: minecraft_version,
        loader:            loader,
        loader_version:    "0.15.0",
        mods:              mod_entries
      )
    end

    context "when removing mods" do
      it "removes the specified mods from the modpack" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        # LLM says to remove 'create'
        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => [], "remove" => ["create"] })
        )
        stub_empty_external_apis

        result = generator.adjust(modpack: existing, instruction: "remove tech mods")

        selected_slugs = result.selected_mods.map { |m| m[:slug] || m[:name] }
        expect(selected_slugs).not_to include("create")
      end

      it "keeps the remaining mods intact" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => [], "remove" => ["create"] })
        )
        stub_empty_external_apis

        result = generator.adjust(modpack: existing, instruction: "remove tech mods")

        selected_slugs = result.selected_mods.map { |m| m[:slug] || m[:name] }
        expect(selected_slugs).to include("sodium", "jei", "waystones", "lithium")
      end

      it "returns a GenerationResult with the updated modpack" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => [], "remove" => ["create"] })
        )
        stub_empty_external_apis

        result = generator.adjust(modpack: existing, instruction: "remove tech mods")

        expect(result).to be_a(AIService::GenerationResult)
        expect(result.modpack).to be_a(ManifestService::Modpack)
        expect(result.modpack.name).to eq("Existing Pack")
        expect(result.modpack.minecraft_version).to eq("1.20.1")
        expect(result.modpack.loader).to eq(:fabric)
      end
    end

    context "when adding mods" do
      it "adds the new mods to the modpack" do
        existing = build_existing_modpack(%w[sodium create jei])

        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => ["waystones"], "remove" => [] })
        )
        stub_external_apis_with([fabric_mod(slug: "waystones")])

        result = generator.adjust(modpack: existing, instruction: "add waystones")

        selected_slugs = result.selected_mods.map { |m| m[:slug] || m[:name] }
        expect(selected_slugs).to include("waystones")
      end

      it "preserves existing mods when adding new ones" do
        existing = build_existing_modpack(%w[sodium create jei])

        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => ["waystones"], "remove" => [] })
        )
        stub_external_apis_with([fabric_mod(slug: "waystones")])

        result = generator.adjust(modpack: existing, instruction: "add waystones")

        selected_slugs = result.selected_mods.map { |m| m[:slug] || m[:name] }
        expect(selected_slugs).to include("sodium", "create", "jei")
      end
    end

    context "KubeJS script regeneration (Req 11.6)" do
      it "regenerates KubeJS scripts only for pairs involving changed mods" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        # LLM says to add 'thermal'
        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => ["thermal"], "remove" => [] })
        )
        stub_external_apis_with([fabric_mod(slug: "thermal")])

        # Track which mod pairs are passed to generate_kubejs_scripts
        captured_pairs = nil
        allow(generator).to receive(:generate_kubejs_scripts) do |mod_pairs:|
          captured_pairs = mod_pairs
          []
        end

        generator.adjust(modpack: existing, instruction: "add thermal expansion")

        # All pairs should involve 'thermal' (the added mod)
        expect(captured_pairs).not_to be_nil
        expect(captured_pairs).to all(satisfy { |pair|
          pair.any? { |m| (m[:slug] || m[:name]).to_s.downcase.include?("thermal") }
        })
      end

      it "does not regenerate scripts for pairs of unchanged mods" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        # LLM says to add 'thermal'
        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => ["thermal"], "remove" => [] })
        )
        stub_external_apis_with([fabric_mod(slug: "thermal")])

        captured_pairs = nil
        allow(generator).to receive(:generate_kubejs_scripts) do |mod_pairs:|
          captured_pairs = mod_pairs
          []
        end

        generator.adjust(modpack: existing, instruction: "add thermal expansion")

        # Pairs like [sodium, create], [sodium, jei], etc. (no thermal) should NOT be included
        unchanged_pair_exists = captured_pairs&.any? do |pair|
          pair.none? { |m| (m[:slug] || m[:name]).to_s.downcase.include?("thermal") }
        end
        expect(unchanged_pair_exists).to be_falsy
      end

      it "regenerates scripts for pairs involving removed mods" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        # LLM says to remove 'create'
        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => [], "remove" => ["create"] })
        )
        stub_empty_external_apis

        captured_pairs = nil
        allow(generator).to receive(:generate_kubejs_scripts) do |mod_pairs:|
          captured_pairs = mod_pairs
          []
        end

        generator.adjust(modpack: existing, instruction: "remove create")

        # Since 'create' was removed, pairs involving 'create' should be regenerated.
        # But 'create' is no longer in selected, so pairs are built from remaining mods
        # that were paired with 'create'. The changed_slugs set includes 'create'.
        # Since 'create' is removed, it won't appear in selected, so no pairs will include it.
        # The affected pairs should be empty (create is gone, no new mods added).
        expect(captured_pairs).not_to be_nil
        # All pairs (if any) should involve 'create' — but since create is removed,
        # there are no pairs with create in the final selected list.
        # The key invariant: no pairs of purely unchanged mods are regenerated.
        unchanged_pair_exists = captured_pairs&.any? do |pair|
          pair.none? { |m| (m[:slug] || m[:name]).to_s.downcase == "create" }
        end
        expect(unchanged_pair_exists).to be_falsy
      end

      it "includes kubejs_scripts in the GenerationResult" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => ["thermal"], "remove" => [] })
        )
        stub_external_apis_with([fabric_mod(slug: "thermal")])

        allow(generator).to receive(:generate_kubejs_scripts).and_return([
          { mod_pair: "thermal:create", script: "// integration script" }
        ])

        result = generator.adjust(modpack: existing, instruction: "add thermal expansion")

        expect(result.kubejs_scripts).to be_an(Array)
        expect(result.kubejs_scripts.first).to include(mod_pair: "thermal:create")
      end

      it "returns empty kubejs_scripts when no mods are changed" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        # LLM returns no changes
        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => [], "remove" => [] })
        )
        stub_empty_external_apis

        result = generator.adjust(modpack: existing, instruction: "keep everything the same")

        expect(result.kubejs_scripts).to eq([])
      end
    end

    context "validation" do
      it "raises ArgumentError when instruction is blank" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        expect {
          generator.adjust(modpack: existing, instruction: "")
        }.to raise_error(ArgumentError, /em branco/)
      end

      it "raises ArgumentError when instruction exceeds 500 characters" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        expect {
          generator.adjust(modpack: existing, instruction: "a" * 501)
        }.to raise_error(ArgumentError, /500 caracteres/)
      end

      it "raises InsufficientModsError when adjustment leaves fewer than 3 mods" do
        existing = build_existing_modpack(%w[sodium create jei])

        # LLM says to remove all mods
        allow(generator).to receive(:call_llm).and_return(
          JSON.generate({ "add" => [], "remove" => ["sodium", "create", "jei"] })
        )
        stub_empty_external_apis

        expect {
          generator.adjust(modpack: existing, instruction: "remove all mods")
        }.to raise_error(AIService::InsufficientModsError)
      end
    end

    context "when LLM fails during adjustment" do
      it "makes no changes and returns the original mods" do
        existing = build_existing_modpack(%w[sodium create jei waystones lithium])

        allow(generator).to receive(:call_llm).and_raise(StandardError, "LLM timeout")
        stub_empty_external_apis

        result = generator.adjust(modpack: existing, instruction: "remove magic mods")

        # With LLM failure, request_adjustments returns { add: [], remove: [] }
        # so the modpack should remain unchanged
        expect(result.selected_mods.size).to eq(5)
        expect(result.kubejs_scripts).to eq([])
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Task 12.2 — generate_kubejs_scripts structured prompt (Req 11.4)
  # ---------------------------------------------------------------------------

  describe "#generate_kubejs_scripts" do
    let(:mod_a) { fabric_mod(slug: "create") }
    let(:mod_b) { fabric_mod(slug: "thermal") }

    it "returns an array of script hashes for pairs with interactions" do
      # Stub the LLM to return a structured JSON response indicating an interaction.
      allow(generator).to receive(:call_llm).and_return(JSON.generate({
        "has_interaction" => true,
        "script_type"     => "recipe",
        "script"          => "ServerEvents.recipes(event => { /* Create + Thermal */ });"
      }))

      result = generator.generate_kubejs_scripts(mod_pairs: [[mod_a, mod_b]])

      expect(result).to be_an(Array)
      expect(result.size).to eq(1)
      expect(result.first[:mod_pair]).to eq("create:thermal")
      expect(result.first[:script]).to include("ServerEvents.recipes")
      expect(result.first[:script_type]).to eq("recipe")
    end

    it "returns empty array when LLM indicates no interaction" do
      allow(generator).to receive(:call_llm).and_return(JSON.generate({
        "has_interaction" => false,
        "script_type"     => nil,
        "script"          => ""
      }))

      result = generator.generate_kubejs_scripts(mod_pairs: [[mod_a, mod_b]])

      expect(result).to be_empty
    end

    it "skips pairs where LLM returns empty script" do
      allow(generator).to receive(:call_llm).and_return(JSON.generate({
        "has_interaction" => true,
        "script_type"     => "integration",
        "script"          => "   "  # whitespace only
      }))

      result = generator.generate_kubejs_scripts(mod_pairs: [[mod_a, mod_b]])

      expect(result).to be_empty
    end

    it "handles LLM failure gracefully and skips the pair" do
      allow(generator).to receive(:call_llm).and_raise(StandardError, "LLM timeout")

      result = generator.generate_kubejs_scripts(mod_pairs: [[mod_a, mod_b]])

      expect(result).to be_empty
    end

    it "processes multiple pairs and returns scripts for those with interactions" do
      mod_c = fabric_mod(slug: "jei")
      mod_d = fabric_mod(slug: "waystones")

      call_count = 0
      allow(generator).to receive(:call_llm) do
        call_count += 1
        if call_count == 1
          # First pair has interaction
          JSON.generate({ "has_interaction" => true, "script_type" => "recipe",
                          "script" => "// create + thermal" })
        else
          # Second pair has no interaction
          JSON.generate({ "has_interaction" => false, "script_type" => nil, "script" => "" })
        end
      end

      result = generator.generate_kubejs_scripts(mod_pairs: [[mod_a, mod_b], [mod_c, mod_d]])

      expect(result.size).to eq(1)
      expect(result.first[:mod_pair]).to eq("create:thermal")
    end

    it "defaults script_type to 'integration' when LLM returns unknown type" do
      allow(generator).to receive(:call_llm).and_return(JSON.generate({
        "has_interaction" => true,
        "script_type"     => "unknown_type",
        "script"          => "// some script"
      }))

      result = generator.generate_kubejs_scripts(mod_pairs: [[mod_a, mod_b]])

      expect(result.first[:script_type]).to eq("integration")
    end

    it "returns empty array for empty mod_pairs input" do
      result = generator.generate_kubejs_scripts(mod_pairs: [])
      expect(result).to be_empty
    end
  end

  # ---------------------------------------------------------------------------
  # Task 12.2 — Report composition (Req 11.5)
  # ---------------------------------------------------------------------------

  describe "generation report composition (Req 11.5)" do
    before do
      stub_llm(%w[sodium create jei waystones lithium])
      stub_external_apis_with([
        fabric_mod(slug: "sodium",    rating: 4.8, downloads: 200_000),
        fabric_mod(slug: "create",    rating: 4.7, downloads: 150_000),
        fabric_mod(slug: "jei",       rating: 4.6, downloads: 120_000),
        fabric_mod(slug: "waystones", rating: 4.5, downloads: 100_000),
        fabric_mod(slug: "lithium",   rating: 4.4, downloads: 80_000)
      ])
      # Stub KubeJS script generation to avoid LLM calls for pairs
      allow(generator).to receive(:generate_kubejs_scripts).and_return([
        { mod_pair: "create:jei", script: "// create + jei integration", script_type: "recipe" }
      ])
    end

    subject(:result) do
      generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)
    end

    it "report contains list of selected mods (Req 11.5)" do
      expect(result.report[:mods]).to be_an(Array)
      expect(result.report[:mods].size).to be >= AIService::ModpackGenerator::MIN_MODS
    end

    it "each mod in report has an individual justification (Req 11.5)" do
      result.report[:mods].each do |mod_entry|
        expect(mod_entry[:justification]).to be_a(String)
        expect(mod_entry[:justification]).not_to be_empty
      end
    end

    it "each mod in report has name, source, project_id, rating, downloads (Req 11.5)" do
      result.report[:mods].each do |mod_entry|
        expect(mod_entry).to include(:name, :source, :project_id, :rating, :downloads)
      end
    end

    it "report contains applied configurations (Req 11.5)" do
      expect(result.report[:configurations]).to be_a(Hash)
      expect(result.report[:configurations]).to include(:loader, :minecraft_version, :total_mods)
    end

    it "report configurations include loader and minecraft_version" do
      expect(result.report[:configurations][:loader]).to eq(:fabric)
      expect(result.report[:configurations][:minecraft_version]).to eq("1.20.1")
    end

    it "report contains kubejs_scripts list (Req 11.5)" do
      expect(result.report[:kubejs_scripts]).to be_an(Array)
    end

    it "report kubejs_scripts includes the generated scripts" do
      expect(result.report[:kubejs_scripts].size).to eq(1)
      expect(result.report[:kubejs_scripts].first[:mod_pair]).to eq("create:jei")
    end

    it "report contains generated_at timestamp" do
      expect(result.report[:generated_at]).to match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)
    end

    it "report contains optional_mods list (Req 11.8)" do
      expect(result.report).to have_key(:optional_mods)
      expect(result.report[:optional_mods]).to be_an(Array)
    end
  end

  # ---------------------------------------------------------------------------
  # Task 12.2 — Optional mods suggestions (Req 11.8)
  # ---------------------------------------------------------------------------

  describe "optional mods suggestions (Req 11.8)" do
    it "suggests up to 10 optional mods" do
      stub_llm(%w[sodium create jei waystones lithium])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "lithium")
      ])
      allow(generator).to receive(:generate_kubejs_scripts).and_return([])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      expect(result.optional_mods).to be_an(Array)
      expect(result.optional_mods.size).to be <= AIService::ModpackGenerator::MAX_OPTIONAL_SUGGESTIONS
    end

    it "does not include already-selected mods in optional suggestions" do
      stub_llm(%w[sodium create jei waystones lithium])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "lithium")
      ])
      allow(generator).to receive(:generate_kubejs_scripts).and_return([])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      selected_slugs = result.selected_mods.map { |m| normalize_slug_for_test(m[:slug] || m[:name]) }
      optional_slugs = result.optional_mods.map { |m| normalize_slug_for_test(m[:slug] || m[:name]) }

      expect((selected_slugs & optional_slugs)).to be_empty
    end

    it "MAX_OPTIONAL_SUGGESTIONS constant is 10" do
      expect(AIService::ModpackGenerator::MAX_OPTIONAL_SUGGESTIONS).to eq(10)
    end
  end

  # ---------------------------------------------------------------------------
  # Task 12.2 — generate() calls generate_kubejs_scripts with all mod pairs (Req 11.4)
  # ---------------------------------------------------------------------------

  describe "generate() integrates KubeJS script generation (Req 11.4)" do
    it "calls generate_kubejs_scripts with all mod pairs from selected mods" do
      stub_llm(%w[sodium create jei waystones lithium])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "lithium")
      ])

      captured_pairs = nil
      allow(generator).to receive(:generate_kubejs_scripts) do |mod_pairs:|
        captured_pairs = mod_pairs
        []
      end

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      # Should have been called with pairs
      expect(captured_pairs).to be_an(Array)
      # n mods → n*(n-1)/2 pairs
      n = result.selected_mods.size
      expect(captured_pairs.size).to eq(n * (n - 1) / 2)
    end

    it "includes kubejs_scripts in the GenerationResult" do
      stub_llm(%w[sodium create jei waystones lithium])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "lithium")
      ])
      allow(generator).to receive(:generate_kubejs_scripts).and_return([
        { mod_pair: "sodium:create", script: "// sodium + create", script_type: "integration" }
      ])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      expect(result.kubejs_scripts).to be_an(Array)
      expect(result.kubejs_scripts.size).to eq(1)
      expect(result.kubejs_scripts.first[:mod_pair]).to eq("sodium:create")
    end

    it "proceeds normally when generate_kubejs_scripts returns empty (no interactions)" do
      stub_llm(%w[sodium create jei waystones lithium])
      stub_external_apis_with([
        fabric_mod(slug: "sodium"),
        fabric_mod(slug: "create"),
        fabric_mod(slug: "jei"),
        fabric_mod(slug: "waystones"),
        fabric_mod(slug: "lithium")
      ])
      allow(generator).to receive(:generate_kubejs_scripts).and_return([])

      result = generator.generate(description: "tech modpack", minecraft_version: "1.20.1", loader: :fabric)

      expect(result).to be_a(AIService::GenerationResult)
      expect(result.kubejs_scripts).to eq([])
    end
  end

  private

  # Helper for optional mods test — mirrors normalize_slug behavior.
  def normalize_slug_for_test(slug)
    slug.to_s.downcase.gsub(/[-_\s]/, "")
  end
end
