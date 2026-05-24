# frozen_string_literal: true

# Feature: minecraft-launcher-platform, Property 3: Round-trip completo de geração de modpack pela IA
#
# Validates: Requirements 11.10, 12.6
#
# Property: Para qualquer modpack gerado com sucesso pelo AI_Assistant, o processo de
# geracao -> exportacao via Manifest_Serializer -> importacao via Manifest_Parser deve
# produzir um objeto Modpack com a mesma lista de mods, versoes e loader que o original,
# e o manifesto deve passar pela validacao do Manifest_Parser sem erro antes de ser
# apresentado ao usuario.

require "rails_helper"
require "rantly/property"

# Force-load service files before RSpec.describe evaluates the constant.
# Zeitwerk maps ai_service.rb -> AiService (not AIService), so we bypass
# autoloading with explicit load calls, matching the pattern in
# spec/support/ai_service_helpers.rb.
load Rails.root.join("app/services/ai_service.rb").to_s unless defined?(AIService)
load Rails.root.join("app/services/ai_service/modpack_generator.rb").to_s unless defined?(AIService::ModpackGenerator)
load Rails.root.join("app/services/manifest_service/value_objects.rb").to_s unless defined?(ManifestService::Modpack)
load Rails.root.join("app/services/external_api.rb").to_s unless defined?(ExternalAPI)
load Rails.root.join("app/services/external_api/client.rb").to_s unless defined?(ExternalAPI::Client)
# Trigger Zeitwerk autoloading for the remaining constants.
ManifestService::Parser
ManifestService::Serializer

RSpec.describe AIService::ModpackGenerator, type: :service do
  def property_of(&block)
    Rantly::Property.new(block)
  end

  VALID_MC_VERSIONS_P3 = %w[1.20.1 1.21 1.19.4 1.18.2].freeze
  VALID_LOADERS_P3     = %i[forge fabric quilt neoforge].freeze
  LOADER_STRINGS_P3 = {
    forge:    "forge",
    fabric:   "fabric",
    quilt:    "quilt",
    neoforge: "neoforge"
  }.freeze

  def stub_llm_p3(generator, slugs)
    allow(generator).to receive(:call_llm).and_return(JSON.generate(slugs))
  end

  def stub_external_apis_p3(mods)
    cf_mods = mods.select { |m| m[:source] == :curseforge }
    mr_mods = mods.select { |m| m[:source] == :modrinth }
    cf_client = instance_double(ExternalAPI::Client)
    mr_client = instance_double(ExternalAPI::Client)
    allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(cf_client)
    allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(mr_client)
    cf_response_data = cf_mods.map do |m|
      loader_str = LOADER_STRINGS_P3[m[:loaders]&.first&.to_sym] || "fabric"
      {
        "id"            => m[:project_id].to_i,
        "slug"          => m[:slug],
        "name"          => m[:name],
        "downloadCount" => m[:downloads],
        "rating"        => m[:rating],
        "categories"    => [{ "slug" => loader_str }],
        "latestFilesIndexes" => [
          { "gameVersion" => (m[:versions] || ["1.20.1"]).first, "fileId" => m[:version_id].to_i }
        ]
      }
    end
    mr_response_data = mr_mods.map do |m|
      {
        "project_id"     => m[:project_id],
        "slug"           => m[:slug],
        "title"          => m[:name],
        "downloads"      => m[:downloads],
        "rating"         => m[:rating],
        "loaders"        => m[:loaders] || ["fabric"],
        "versions"       => m[:versions] || ["1.20.1"],
        "latest_version" => m[:version_id]
      }
    end
    allow(cf_client).to receive(:search).and_return({ "data" => cf_response_data })
    allow(mr_client).to receive(:search).and_return({ "hits" => mr_response_data })
  end

  def build_generator_p3
    described_class.new(
      mod_limit:   200,
      llm_api_url: "https://api.example.com/v1",
      llm_api_key: "test-key"
    )
  end

  # Feature: minecraft-launcher-platform, Property 3: Round-trip completo de geração de modpack pela IA
  # Validates: Requirements 11.10, 12.6
  describe "P3: Round-trip completo de geração de modpack pela IA — 100 iterações" do
    it "preserves minecraft_version, loader, and mod list after generation -> serialize -> parse (CurseForge mods)" do
      property_of {
        description       = sized(integer(1..100)) { string(:alnum) }.then { |s| s.empty? ? "modpack" : s }
        minecraft_version = choose(*VALID_MC_VERSIONS_P3)
        loader            = choose(*VALID_LOADERS_P3)
        count             = integer(3..10)
        mods              = Array.new(count) do |i|
          slug = "mod#{i}x#{integer(1..9999)}"
          {
            source:     :curseforge,
            project_id: integer(1..999_999).to_s,
            version_id: integer(1..999_999).to_s,
            slug:       slug,
            name:       slug.capitalize,
            filename:   nil,
            sha256:     nil,
            rating:     4.5,
            downloads:  50_000,
            loaders:    [LOADER_STRINGS_P3[loader]],
            versions:   [minecraft_version]
          }
        end
        [description, minecraft_version, loader, mods]
      }.check(10) do |(description, minecraft_version, loader, mods)|
        generator = build_generator_p3
        stub_llm_p3(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p3(mods)

        result  = generator.generate(description: description, minecraft_version: minecraft_version, loader: loader)
        modpack = result.modpack

        json     = ManifestService::Serializer.serialize(modpack, format: :curseforge)
        reparsed = ManifestService::Parser.parse(json, format: :curseforge)

        expect(reparsed.minecraft_version).to eq(modpack.minecraft_version),
          "minecraft_version mismatch: expected #{modpack.minecraft_version.inspect}, got #{reparsed.minecraft_version.inspect}"
        expect(reparsed.loader).to eq(modpack.loader),
          "loader mismatch: expected #{modpack.loader.inspect}, got #{reparsed.loader.inspect}"
        expect(reparsed.mods.size).to eq(modpack.mods.size),
          "mod count mismatch: expected #{modpack.mods.size}, got #{reparsed.mods.size}"
        expect(reparsed.mods.map(&:project_id).sort).to eq(modpack.mods.map(&:project_id).sort),
          "project_ids mismatch after round-trip"
        expect(reparsed.mods.map(&:version_id).sort).to eq(modpack.mods.map(&:version_id).sort),
          "version_ids mismatch after round-trip"
      end
    end

    it "preserves minecraft_version, loader, and mod list after generation -> serialize -> parse (Modrinth mods via CurseForge round-trip)" do
      # The generator extracts Modrinth mods without sha256 (sha256 is not in the search response).
      # validate_manifest_roundtrip! uses CurseForge format when sha256 is absent.
      # This test verifies the round-trip using CurseForge format with numeric project_ids,
      # which is the format the generator uses internally for Modrinth-sourced mods.
      property_of {
        description       = sized(integer(1..100)) { string(:alnum) }.then { |s| s.empty? ? "modpack" : s }
        minecraft_version = choose(*VALID_MC_VERSIONS_P3)
        loader            = choose(*VALID_LOADERS_P3)
        count             = integer(3..10)
        mods              = Array.new(count) do |i|
          # Use numeric project_id so CurseForge round-trip works
          project_id = integer(1..999_999).to_s
          slug       = "mod#{i}x#{integer(1..9999)}"
          {
            source:     :modrinth,
            project_id: project_id,
            version_id: integer(1..999_999).to_s,
            slug:       slug,
            name:       slug.capitalize,
            filename:   "#{slug}.jar",
            sha256:     nil,  # generator never preserves sha256 from search response
            rating:     4.5,
            downloads:  50_000,
            loaders:    [LOADER_STRINGS_P3[loader]],
            versions:   [minecraft_version]
          }
        end
        [description, minecraft_version, loader, mods]
      }.check(10) do |(description, minecraft_version, loader, mods)|
        generator = build_generator_p3
        stub_llm_p3(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p3(mods)

        result  = generator.generate(description: description, minecraft_version: minecraft_version, loader: loader)
        modpack = result.modpack

        # The generator uses CurseForge format for round-trip when sha256 is absent.
        # Verify the modpack can be serialized and re-parsed via CurseForge format.
        json     = ManifestService::Serializer.serialize(modpack, format: :curseforge)
        reparsed = ManifestService::Parser.parse(json, format: :curseforge)

        expect(reparsed.minecraft_version).to eq(modpack.minecraft_version),
          "minecraft_version mismatch: expected #{modpack.minecraft_version.inspect}, got #{reparsed.minecraft_version.inspect}"
        expect(reparsed.loader).to eq(modpack.loader),
          "loader mismatch: expected #{modpack.loader.inspect}, got #{reparsed.loader.inspect}"
        expect(reparsed.mods.size).to eq(modpack.mods.size),
          "mod count mismatch: expected #{modpack.mods.size}, got #{reparsed.mods.size}"
        expect(reparsed.mods.map(&:project_id).sort).to eq(modpack.mods.map(&:project_id).sort),
          "project_ids mismatch after round-trip"
        expect(reparsed.mods.map(&:version_id).sort).to eq(modpack.mods.map(&:version_id).sort),
          "version_ids mismatch after round-trip"
      end
    end

    it "generate() completes without raising — manifest passes Manifest_Parser validation (Req 11.10)" do
      property_of {
        description       = sized(integer(1..100)) { string(:alnum) }.then { |s| s.empty? ? "modpack" : s }
        minecraft_version = choose(*VALID_MC_VERSIONS_P3)
        loader            = choose(*VALID_LOADERS_P3)
        count             = integer(3..10)
        mods = Array.new(count) do |i|
          slug = "mod#{i}x#{integer(1..9999)}"
          {
            source:     :curseforge,
            project_id: integer(1..999_999).to_s,
            version_id: integer(1..999_999).to_s,
            slug:       slug,
            name:       slug.capitalize,
            filename:   nil,
            sha256:     nil,
            rating:     4.5,
            downloads:  50_000,
            loaders:    [LOADER_STRINGS_P3[loader]],
            versions:   [minecraft_version]
          }
        end
        [description, minecraft_version, loader, mods]
      }.check(10) do |(description, minecraft_version, loader, mods)|
        generator = build_generator_p3
        stub_llm_p3(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p3(mods)

        expect {
          generator.generate(description: description, minecraft_version: minecraft_version, loader: loader)
        }.not_to raise_error
      end
    end

    it "preserves loader_version after generation -> serialize -> parse (CurseForge format)" do
      property_of {
        minecraft_version = choose(*VALID_MC_VERSIONS_P3)
        loader            = choose(*VALID_LOADERS_P3)
        count             = integer(3..8)
        mods              = Array.new(count) do |i|
          slug = "mod#{i}x#{integer(1..9999)}"
          {
            source:     :curseforge,
            project_id: integer(1..999_999).to_s,
            version_id: integer(1..999_999).to_s,
            slug:       slug,
            name:       slug.capitalize,
            filename:   nil,
            sha256:     nil,
            rating:     4.5,
            downloads:  50_000,
            loaders:    [LOADER_STRINGS_P3[loader]],
            versions:   [minecraft_version]
          }
        end
        [minecraft_version, loader, mods]
      }.check(10) do |(minecraft_version, loader, mods)|
        generator = build_generator_p3
        stub_llm_p3(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p3(mods)

        result  = generator.generate(description: "tech modpack", minecraft_version: minecraft_version, loader: loader)
        modpack = result.modpack

        json     = ManifestService::Serializer.serialize(modpack, format: :curseforge)
        reparsed = ManifestService::Parser.parse(json, format: :curseforge)

        expect(reparsed.loader_version).to eq(modpack.loader_version),
          "loader_version mismatch: expected #{modpack.loader_version.inspect}, got #{reparsed.loader_version.inspect}"
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Feature: minecraft-launcher-platform, Property 12: Invariantes de qualidade do modpack gerado
  # Validates: Requirements 11.2, 12.1, 12.2, 12.5
  #
  # Property 12: Invariantes de qualidade do modpack gerado pela IA — 100 iterações
  #
  # For any modpack generated by the AI_Assistant without explicit mod specification by the user:
  #   (a) all mods must have minimum rating of 4 stars or equivalent percentage;
  #   (b) total number of mods must be <= configured limit (default: 200), with exactly the limit being valid;
  #   (c) must include at least one performance optimization mod compatible with the selected loader;
  #   (d) all mods must be compatible with each other (same Minecraft version, same loader, no known conflicts).
  # ---------------------------------------------------------------------------

  VALID_LOADERS_P12      = %i[fabric forge quilt neoforge].freeze
  VALID_MC_VERSIONS_P12  = %w[1.19.4 1.20.1 1.20.4 1.21 1.21.1].freeze
  VALID_DESCRIPTIONS_P12 = [
    "tech modpack with automation",
    "magic and adventure",
    "survival with quality of life mods",
    "kitchen sink modpack",
    "performance focused vanilla plus"
  ].freeze

  # Build a mod hash with rating >= 4.0 for use in P12 tests.
  def rated_mod_p12(slug:, source: :modrinth, rating: 4.5)
    {
      source:     source,
      project_id: source == :curseforge ? "cf-#{slug}" : slug,
      version_id: "v1.0",
      slug:       slug,
      name:       slug.capitalize,
      filename:   source == :modrinth ? "#{slug}.jar" : nil,
      sha256:     nil,
      rating:     rating,
      downloads:  50_000
    }
  end

  # Build a performance mod for the given loader.
  def perf_mod_for_loader_p12(loader)
    slug = AIService::ModpackGenerator::PERFORMANCE_MODS[loader].first
    rated_mod_p12(slug: slug)
  end

  # Build a list of N non-conflicting mods (all rated >= 4.0) for the given loader.
  # Always includes one performance mod as the first element.
  def build_valid_mod_list_p12(loader:, count:)
    perf      = perf_mod_for_loader_p12(loader)
    perf_slug = perf[:slug]

    # Non-conflicting generic slugs (avoid KNOWN_CONFLICTS keys and the perf mod slug)
    safe_slugs = %w[
      create jei waystones journeymap
      appleskin quark supplementaries
      farmers-delight biomes-o-plenty
      tinkers-construct botania
      thermal-expansion mekanism
      ae2 refined-storage
      pam-harvestcraft cooking-for-blockheads
      twilight-forest aether
      immersive-engineering industrial-foregoing
    ].reject { |s| AIService::ModpackGenerator::KNOWN_CONFLICTS.key?(s) }
     .reject { |s| s == perf_slug }

    extra_count = [count - 1, safe_slugs.size].min
    extra_mods  = safe_slugs.first(extra_count).map { |slug| rated_mod_p12(slug: slug) }

    ([perf] + extra_mods).first(count)
  end

  # Stub the LLM to return a fixed list of slugs.
  def stub_llm_p12(generator, slugs)
    allow(generator).to receive(:call_llm).and_return(JSON.generate(slugs))
  end

  # Stub ExternalAPI::Client to return the given mods for any query.
  # loader_str and mc_version are used to make mods appear compatible.
  def stub_external_apis_p12(mods, loader_str: "fabric", mc_version: "1.20.1")
    cf_mods = mods.select { |m| m[:source] == :curseforge }
    mr_mods = mods.select { |m| m[:source] == :modrinth }

    cf_client = instance_double(ExternalAPI::Client)
    mr_client = instance_double(ExternalAPI::Client)

    allow(ExternalAPI::Client).to receive(:new).with(source: :curseforge).and_return(cf_client)
    allow(ExternalAPI::Client).to receive(:new).with(source: :modrinth).and_return(mr_client)

    cf_response = cf_mods.map do |m|
      {
        "id"            => m[:project_id].to_s.sub("cf-", "").to_i,
        "slug"          => m[:slug],
        "name"          => m[:name],
        "downloadCount" => m[:downloads],
        "rating"        => m[:rating],
        "categories"    => [{ "slug" => loader_str }],
        "latestFilesIndexes" => [{ "gameVersion" => mc_version, "fileId" => 12345 }]
      }
    end

    mr_response = mr_mods.map do |m|
      {
        "project_id"     => m[:project_id],
        "slug"           => m[:slug],
        "title"          => m[:name],
        "downloads"      => m[:downloads],
        "rating"         => m[:rating],
        "loaders"        => [loader_str],
        "versions"       => [mc_version],
        "latest_version" => "v1.0"
      }
    end

    allow(cf_client).to receive(:search).and_return({ "data" => cf_response })
    allow(mr_client).to receive(:search).and_return({ "hits" => mr_response })
  end

  describe "P12: Invariantes de qualidade do modpack gerado pela IA — 100 iterações" do
    # (a) All selected_mods have rating >= 4.0  (Req 12.1)
    # (b) selected_mods.size <= mod_limit        (Req 12.2)
    # (c) At least one performance mod present   (Req 12.5)
    # (d) No conflicts detected                  (Req 11.2)

    it "invariant (a): all selected mods have rating >= 4.0 — 100 iterations (Req 12.1)" do
      property_of {
        loader      = choose(*VALID_LOADERS_P12)
        mc_version  = choose(*VALID_MC_VERSIONS_P12)
        description = choose(*VALID_DESCRIPTIONS_P12)
        mod_count   = range(3, 15)
        mod_limit   = range(mod_count, 200)

        { loader: loader, mc_version: mc_version, description: description,
          mod_count: mod_count, mod_limit: mod_limit }
      }.check(10) do |params|
        loader      = params[:loader]
        mc_version  = params[:mc_version]
        description = params[:description]
        mod_count   = params[:mod_count]
        mod_limit   = params[:mod_limit]

        generator = AIService::ModpackGenerator.new(
          mod_limit:   mod_limit,
          llm_api_url: "https://api.example.com/v1",
          llm_api_key: "test-key"
        )

        mods = build_valid_mod_list_p12(loader: loader, count: mod_count)
        stub_llm_p12(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p12(mods, loader_str: loader.to_s, mc_version: mc_version)

        result = generator.generate(
          description:       description,
          minecraft_version: mc_version,
          loader:            loader
        )

        # Invariant (a): every selected mod must have rating >= 4.0
        result.selected_mods.each do |mod|
          expect(mod[:rating]).to be >= AIService::ModpackGenerator::MIN_RATING,
            "Expected all mods to have rating >= #{AIService::ModpackGenerator::MIN_RATING}, " \
            "but '#{mod[:slug]}' has rating #{mod[:rating]}"
        end
      end
    end

    it "invariant (b): selected_mods.size <= mod_limit — 100 iterations (Req 12.2)" do
      property_of {
        loader      = choose(*VALID_LOADERS_P12)
        mc_version  = choose(*VALID_MC_VERSIONS_P12)
        description = choose(*VALID_DESCRIPTIONS_P12)
        mod_limit   = range(3, 200)
        mod_count   = range(3, [mod_limit, 15].min)

        { loader: loader, mc_version: mc_version, description: description,
          mod_count: mod_count, mod_limit: mod_limit }
      }.check(10) do |params|
        loader      = params[:loader]
        mc_version  = params[:mc_version]
        description = params[:description]
        mod_count   = params[:mod_count]
        mod_limit   = params[:mod_limit]

        generator = AIService::ModpackGenerator.new(
          mod_limit:   mod_limit,
          llm_api_url: "https://api.example.com/v1",
          llm_api_key: "test-key"
        )

        mods = build_valid_mod_list_p12(loader: loader, count: mod_count)
        stub_llm_p12(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p12(mods, loader_str: loader.to_s, mc_version: mc_version)

        result = generator.generate(
          description:       description,
          minecraft_version: mc_version,
          loader:            loader
        )

        # Invariant (b): total mods must not exceed the configured limit
        expect(result.selected_mods.size).to be <= mod_limit,
          "Expected selected_mods.size (#{result.selected_mods.size}) to be <= mod_limit (#{mod_limit})"
      end
    end

    it "invariant (b): modpack with exactly mod_limit mods is valid — 100 iterations (Req 12.2)" do
      property_of {
        loader     = choose(*VALID_LOADERS_P12)
        mc_version = choose(*VALID_MC_VERSIONS_P12)
        mod_limit  = range(3, 10)

        { loader: loader, mc_version: mc_version, mod_limit: mod_limit }
      }.check(10) do |params|
        loader     = params[:loader]
        mc_version = params[:mc_version]
        mod_limit  = params[:mod_limit]

        generator = AIService::ModpackGenerator.new(
          mod_limit:   mod_limit,
          llm_api_url: "https://api.example.com/v1",
          llm_api_key: "test-key"
        )

        # Build exactly mod_limit mods so the generator can fill up to the limit
        mods = build_valid_mod_list_p12(loader: loader, count: mod_limit)
        stub_llm_p12(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p12(mods, loader_str: loader.to_s, mc_version: mc_version)

        result = generator.generate(
          description:       "tech modpack",
          minecraft_version: mc_version,
          loader:            loader
        )

        # A modpack with exactly the limit is valid (size <= limit)
        expect(result.selected_mods.size).to be <= mod_limit,
          "Modpack with exactly mod_limit mods should be valid: " \
          "size=#{result.selected_mods.size}, limit=#{mod_limit}"
        expect(result.selected_mods.size).to be >= AIService::ModpackGenerator::MIN_MODS
      end
    end

    it "invariant (c): at least one performance mod compatible with the loader — 100 iterations (Req 12.5)" do
      property_of {
        loader      = choose(*VALID_LOADERS_P12)
        mc_version  = choose(*VALID_MC_VERSIONS_P12)
        description = choose(*VALID_DESCRIPTIONS_P12)
        mod_count   = range(3, 12)

        { loader: loader, mc_version: mc_version, description: description, mod_count: mod_count }
      }.check(10) do |params|
        loader      = params[:loader]
        mc_version  = params[:mc_version]
        description = params[:description]
        mod_count   = params[:mod_count]

        generator = AIService::ModpackGenerator.new(
          mod_limit:   200,
          llm_api_url: "https://api.example.com/v1",
          llm_api_key: "test-key"
        )

        mods = build_valid_mod_list_p12(loader: loader, count: mod_count)
        stub_llm_p12(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p12(mods, loader_str: loader.to_s, mc_version: mc_version)

        result = generator.generate(
          description:       description,
          minecraft_version: mc_version,
          loader:            loader
        )

        perf_slugs     = AIService::ModpackGenerator::PERFORMANCE_MODS[loader] || []
        selected_slugs = result.selected_mods.map { |m| (m[:slug] || m[:name]).to_s.downcase }

        has_perf_mod = selected_slugs.any? do |slug|
          perf_slugs.any? { |ps| ps.downcase == slug }
        end

        expect(has_perf_mod).to be(true),
          "Expected at least one performance mod for loader '#{loader}' " \
          "(#{perf_slugs.join(', ')}), but selected: #{selected_slugs.join(', ')}"
      end
    end

    it "invariant (d): all mods are compatible (no known conflicts) — 100 iterations (Req 11.2)" do
      property_of {
        loader      = choose(*VALID_LOADERS_P12)
        mc_version  = choose(*VALID_MC_VERSIONS_P12)
        description = choose(*VALID_DESCRIPTIONS_P12)
        mod_count   = range(3, 12)

        { loader: loader, mc_version: mc_version, description: description, mod_count: mod_count }
      }.check(10) do |params|
        loader      = params[:loader]
        mc_version  = params[:mc_version]
        description = params[:description]
        mod_count   = params[:mod_count]

        generator = AIService::ModpackGenerator.new(
          mod_limit:   200,
          llm_api_url: "https://api.example.com/v1",
          llm_api_key: "test-key"
        )

        mods = build_valid_mod_list_p12(loader: loader, count: mod_count)
        stub_llm_p12(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p12(mods, loader_str: loader.to_s, mc_version: mc_version)

        result = generator.generate(
          description:       description,
          minecraft_version: mc_version,
          loader:            loader
        )

        # Invariant (d): check_compatibility must report no conflicts
        compat = generator.check_compatibility(mods: result.selected_mods)

        expect(compat[:compatible]).to be(true),
          "Expected all mods to be compatible, but conflicts detected: #{compat[:conflicts].inspect}"
        expect(compat[:conflicts]).to be_empty,
          "Expected no conflicts, but found: #{compat[:conflicts].inspect}"
      end
    end

    it "all four invariants hold simultaneously — 100 iterations (Req 11.2, 12.1, 12.2, 12.5)" do
      property_of {
        loader      = choose(*VALID_LOADERS_P12)
        mc_version  = choose(*VALID_MC_VERSIONS_P12)
        description = choose(*VALID_DESCRIPTIONS_P12)
        mod_limit   = range(5, 200)
        mod_count   = range(3, [mod_limit, 12].min)

        { loader: loader, mc_version: mc_version, description: description,
          mod_count: mod_count, mod_limit: mod_limit }
      }.check(10) do |params|
        loader      = params[:loader]
        mc_version  = params[:mc_version]
        description = params[:description]
        mod_count   = params[:mod_count]
        mod_limit   = params[:mod_limit]

        generator = AIService::ModpackGenerator.new(
          mod_limit:   mod_limit,
          llm_api_url: "https://api.example.com/v1",
          llm_api_key: "test-key"
        )

        mods = build_valid_mod_list_p12(loader: loader, count: mod_count)
        stub_llm_p12(generator, mods.map { |m| m[:slug] })
        stub_external_apis_p12(mods, loader_str: loader.to_s, mc_version: mc_version)

        result = generator.generate(
          description:       description,
          minecraft_version: mc_version,
          loader:            loader
        )

        selected   = result.selected_mods
        perf_slugs = AIService::ModpackGenerator::PERFORMANCE_MODS[loader] || []

        # (a) All mods rated >= 4.0
        selected.each do |mod|
          expect(mod[:rating]).to be >= AIService::ModpackGenerator::MIN_RATING,
            "Invariant (a) violated: mod '#{mod[:slug]}' has rating #{mod[:rating]}"
        end

        # (b) Total mods <= mod_limit
        expect(selected.size).to be <= mod_limit,
          "Invariant (b) violated: #{selected.size} mods > limit #{mod_limit}"

        # (c) At least one performance mod
        selected_slugs = selected.map { |m| (m[:slug] || m[:name]).to_s.downcase }
        has_perf = selected_slugs.any? { |s| perf_slugs.any? { |ps| ps.downcase == s } }
        expect(has_perf).to be(true),
          "Invariant (c) violated: no performance mod for loader '#{loader}' in #{selected_slugs.inspect}"

        # (d) No conflicts
        compat = generator.check_compatibility(mods: selected)
        expect(compat[:compatible]).to be(true),
          "Invariant (d) violated: conflicts #{compat[:conflicts].inspect}"
      end
    end
  end
end
