# frozen_string_literal: true

# Feature: minecraft-launcher-platform, Property 1: Round-trip de Manifesto
# Feature: minecraft-launcher-platform, Property 2: Idempotência de parse
# Feature: minecraft-launcher-platform, Property 4: Rejeição de manifestos inválidos
#
# Validates: Requirements 13.2, 13.3, 13.4

require "rails_helper"
require "rantly/property"

# Ensure service files are loaded before the describe blocks evaluate constants.
# Zeitwerk does not eager-load in test mode, so we trigger autoloading explicitly.
# The support/ai_service_helpers.rb before(:each) hook also loads ExternalAPI and
# AIService for all type: :service specs — pre-load them here to avoid NameError.
load Rails.root.join("app/services/external_api.rb").to_s unless defined?(ExternalAPI)
load Rails.root.join("app/services/external_api/client.rb").to_s unless defined?(ExternalAPI::Client)
load Rails.root.join("app/services/ai_service.rb").to_s unless defined?(AIService)
load Rails.root.join("app/services/ai_service/modpack_generator.rb").to_s unless defined?(AIService::ModpackGenerator)
load Rails.root.join("app/services/manifest_service/value_objects.rb").to_s unless defined?(ManifestService::Modpack)
ManifestService::Parser
ManifestService::Serializer

RSpec.describe "ManifestService property-based tests", type: :service do
  # ---------------------------------------------------------------------------
  # Helper: Rantly property runner
  # ---------------------------------------------------------------------------

  def property_of(&block)
    Rantly::Property.new(block)
  end

  # ---------------------------------------------------------------------------
  # Generators / data helpers
  # ---------------------------------------------------------------------------

  VALID_MC_VERSIONS = %w[1.18.2 1.19.4 1.20.1 1.20.4 1.21 1.21.1].freeze
  VALID_LOADERS     = %i[forge fabric quilt neoforge].freeze

  # Modrinth serializer key for each loader symbol
  MODRINTH_LOADER_KEYS = {
    forge:    "forge",
    fabric:   "fabric-loader",
    quilt:    "quilt-loader",
    neoforge: "neoforge"
  }.freeze

  # Extend Rantly with custom generators so they are available inside property_of blocks
  # (which run via instance_eval on a Rantly instance).
  before(:all) do
    Rantly.class_eval do
      # Generate a safe non-empty alphanumeric string of length 1..max_len
      def gen_safe_string(max_len: 30)
        len = integer(1..max_len)
        sized(len) { string(:alnum) }.then { |s| s.empty? ? "x" : s }
      end

      # Generate a valid loader version string like "1.2.3" or "47.2.0"
      def gen_loader_version
        "#{integer(0..99)}.#{integer(0..99)}.#{integer(0..99)}"
      end

      # Generate a valid CurseForge ModEntry hash
      def gen_curseforge_mod_entry
        project_id = integer(1..999_999)
        version_id = integer(1..999_999)
        {
          source:          :curseforge,
          project_id:      project_id.to_s,
          version_id:      version_id.to_s,
          filename:        nil,
          sha256:          nil,
          _project_id_int: project_id,
          _version_id_int: version_id
        }
      end

      # Generate a valid Modrinth ModEntry hash
      def gen_modrinth_mod_entry
        project_id = gen_safe_string(max_len: 12)
        version_id = gen_safe_string(max_len: 12)
        filename   = "#{gen_safe_string(max_len: 10)}.jar"
        sha256     = Array.new(64) { integer(0..15).to_s(16) }.join
        {
          source:     :modrinth,
          project_id: project_id,
          version_id: version_id,
          filename:   filename,
          sha256:     sha256
        }
      end

      # Generate a non-string, non-nil value (for invalid type tests)
      def gen_invalid_string_value
        choose(42, true, false, [], {}, nil)
      end

      # Generate a non-integer value (for invalid type tests)
      def gen_invalid_integer_value
        choose("not_an_int", true, false, [], {}, nil, 3.14)
      end

      # Generate a non-array value (for invalid type tests)
      def gen_invalid_array_value
        choose(nil, "not-an-array", 42, true, {})
      end

      # Generate a non-object/hash value (for invalid type tests)
      def gen_invalid_object_value
        choose(nil, "not-an-object", 42, true, [])
      end
    end
  end

  # Build a ManifestService::Modpack from a hash of parameters
  def build_modpack_from(name:, mc_version:, loader:, loader_version:, mod_entries:)
    mods = mod_entries.map do |e|
      ManifestService::ModEntry.new(
        source:     e[:source],
        project_id: e[:project_id],
        version_id: e[:version_id],
        filename:   e[:filename],
        sha256:     e[:sha256]
      )
    end
    ManifestService::Modpack.new(
      name:              name,
      minecraft_version: mc_version,
      loader:            loader,
      loader_version:    loader_version,
      mods:              mods
    )
  end

  # Build a valid CurseForge JSON string from raw parameters (bypasses Serializer)
  def build_curseforge_json(name:, mc_version:, loader:, loader_version:, mod_entries:)
    files = mod_entries.map do |e|
      {
        "projectID" => Integer(e[:project_id]),
        "fileID"    => Integer(e[:version_id]),
        "required"  => true
      }
    end
    JSON.generate({
      "manifestType"    => "minecraftModpack",
      "manifestVersion" => 1,
      "name"            => name,
      "minecraft"       => {
        "version"    => mc_version,
        "modLoaders" => [{ "id" => "#{loader}-#{loader_version}", "primary" => true }]
      },
      "files" => files
    })
  end

  # Build a valid Modrinth JSON string from raw parameters (bypasses Serializer)
  def build_modrinth_json(name:, mc_version:, loader:, loader_version:, mod_entries:)
    loader_key = MODRINTH_LOADER_KEYS[loader]
    files = mod_entries.map do |e|
      filename = e[:filename] || "#{e[:project_id]}.jar"
      sha256   = e[:sha256]   || ""
      url      = "https://cdn.modrinth.com/data/#{e[:project_id]}/versions/#{e[:version_id]}/#{filename}"
      {
        "path"      => "mods/#{filename}",
        "hashes"    => { "sha256" => sha256 },
        "downloads" => [url],
        "fileSize"  => 0
      }
    end
    JSON.generate({
      "formatVersion" => 1,
      "game"          => "minecraft",
      "name"          => name,
      "versionId"     => "#{name}-#{mc_version}",
      "dependencies"  => {
        "minecraft" => mc_version,
        loader_key  => loader_version
      },
      "files" => files
    })
  end

  # ---------------------------------------------------------------------------
  # Property 1: Round-trip de Manifesto (CurseForge e Modrinth) — 200 iterações
  # Feature: minecraft-launcher-platform, Property 1: Round-trip de Manifesto
  # Validates: Requirements 13.3, 13.4
  #
  # For any valid Modpack object, parse(serialize(modpack, format), format) must
  # produce a Modpack with the same name, minecraft_version, loader, loader_version,
  # and mod list (project_ids and version_ids).
  # ---------------------------------------------------------------------------

  describe "P1: Round-trip de Manifesto (CurseForge e Modrinth) — 200 iterações" do
    # Validates: Requirements 13.3, 13.4

    it "CurseForge: parse(serialize(modpack)) preserves all fields — 20 iterations" do
      property_of {
        name           = gen_safe_string(max_len: 40)
        mc_version     = choose(*VALID_MC_VERSIONS)
        loader         = choose(*VALID_LOADERS)
        loader_version = gen_loader_version
        count          = integer(0..8)
        mod_entries    = Array.new(count) { gen_curseforge_mod_entry }

        { name: name, mc_version: mc_version, loader: loader,
          loader_version: loader_version, mod_entries: mod_entries }
      }.check(20) do |params|
        modpack = build_modpack_from(**params)

        json     = ManifestService::Serializer.serialize(modpack, format: :curseforge)
        reparsed = ManifestService::Parser.parse(json, format: :curseforge)

        expect(reparsed.name).to eq(modpack.name),
          "name mismatch: expected #{modpack.name.inspect}, got #{reparsed.name.inspect}"
        expect(reparsed.minecraft_version).to eq(modpack.minecraft_version),
          "minecraft_version mismatch"
        expect(reparsed.loader).to eq(modpack.loader),
          "loader mismatch: expected #{modpack.loader.inspect}, got #{reparsed.loader.inspect}"
        expect(reparsed.loader_version).to eq(modpack.loader_version),
          "loader_version mismatch"
        expect(reparsed.mods.size).to eq(modpack.mods.size),
          "mod count mismatch: expected #{modpack.mods.size}, got #{reparsed.mods.size}"
        expect(reparsed.mods.map(&:project_id).sort).to eq(modpack.mods.map(&:project_id).sort),
          "project_ids mismatch after CurseForge round-trip"
        expect(reparsed.mods.map(&:version_id).sort).to eq(modpack.mods.map(&:version_id).sort),
          "version_ids mismatch after CurseForge round-trip"
      end
    end

    it "Modrinth: parse(serialize(modpack)) preserves all fields — 20 iterations" do
      property_of {
        name           = gen_safe_string(max_len: 40)
        mc_version     = choose(*VALID_MC_VERSIONS)
        loader         = choose(*VALID_LOADERS)
        loader_version = gen_loader_version
        count          = integer(0..8)
        mod_entries    = Array.new(count) { gen_modrinth_mod_entry }

        { name: name, mc_version: mc_version, loader: loader,
          loader_version: loader_version, mod_entries: mod_entries }
      }.check(20) do |params|
        modpack = build_modpack_from(**params)

        json     = ManifestService::Serializer.serialize(modpack, format: :modrinth)
        reparsed = ManifestService::Parser.parse(json, format: :modrinth)

        expect(reparsed.name).to eq(modpack.name),
          "name mismatch: expected #{modpack.name.inspect}, got #{reparsed.name.inspect}"
        expect(reparsed.minecraft_version).to eq(modpack.minecraft_version),
          "minecraft_version mismatch"
        expect(reparsed.loader).to eq(modpack.loader),
          "loader mismatch: expected #{modpack.loader.inspect}, got #{reparsed.loader.inspect}"
        expect(reparsed.loader_version).to eq(modpack.loader_version),
          "loader_version mismatch"
        expect(reparsed.mods.size).to eq(modpack.mods.size),
          "mod count mismatch: expected #{modpack.mods.size}, got #{reparsed.mods.size}"
        expect(reparsed.mods.map(&:project_id).sort).to eq(modpack.mods.map(&:project_id).sort),
          "project_ids mismatch after Modrinth round-trip"
        expect(reparsed.mods.map(&:filename).sort).to eq(modpack.mods.map(&:filename).sort),
          "filenames mismatch after Modrinth round-trip"
        expect(reparsed.mods.map(&:sha256).sort).to eq(modpack.mods.map(&:sha256).sort),
          "sha256 hashes mismatch after Modrinth round-trip"
      end
    end

    it "CurseForge: serialized output is valid JSON — 20 iterations" do
      property_of {
        name           = gen_safe_string(max_len: 40)
        mc_version     = choose(*VALID_MC_VERSIONS)
        loader         = choose(*VALID_LOADERS)
        loader_version = gen_loader_version
        count          = integer(0..5)
        mod_entries    = Array.new(count) { gen_curseforge_mod_entry }

        { name: name, mc_version: mc_version, loader: loader,
          loader_version: loader_version, mod_entries: mod_entries }
      }.check(20) do |params|
        modpack = build_modpack_from(**params)
        json    = ManifestService::Serializer.serialize(modpack, format: :curseforge)

        expect { JSON.parse(json) }.not_to raise_error,
          "Serializer produced invalid JSON for CurseForge format"
      end
    end

    it "Modrinth: serialized output is valid JSON — 20 iterations" do
      property_of {
        name           = gen_safe_string(max_len: 40)
        mc_version     = choose(*VALID_MC_VERSIONS)
        loader         = choose(*VALID_LOADERS)
        loader_version = gen_loader_version
        count          = integer(0..5)
        mod_entries    = Array.new(count) { gen_modrinth_mod_entry }

        { name: name, mc_version: mc_version, loader: loader,
          loader_version: loader_version, mod_entries: mod_entries }
      }.check(20) do |params|
        modpack = build_modpack_from(**params)
        json    = ManifestService::Serializer.serialize(modpack, format: :modrinth)

        expect { JSON.parse(json) }.not_to raise_error,
          "Serializer produced invalid JSON for Modrinth format"
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Property 2: Idempotência de parse — round-trip duplo — 100 iterações
  # Feature: minecraft-launcher-platform, Property 2: Idempotência de parse
  # Validates: Requirements 13.4
  #
  # parse(serialize(parse(manifest))) must equal parse(manifest).
  # That is, a second serialize→parse cycle produces the same result as the first.
  # ---------------------------------------------------------------------------

  describe "P2: Idempotência de parse — round-trip duplo — 100 iterações" do
    # Validates: Requirements 13.4

    it "CurseForge: parse(serialize(parse(json))) == parse(json) — 10 iterations" do
      property_of {
        name           = gen_safe_string(max_len: 40)
        mc_version     = choose(*VALID_MC_VERSIONS)
        loader         = choose(*VALID_LOADERS)
        loader_version = gen_loader_version
        count          = integer(0..6)
        mod_entries    = Array.new(count) { gen_curseforge_mod_entry }

        { name: name, mc_version: mc_version, loader: loader,
          loader_version: loader_version, mod_entries: mod_entries }
      }.check(10) do |params|
        # Build the original JSON directly (not via Serializer) to test parse idempotency
        original_json = build_curseforge_json(**params)

        # First parse
        first_parse = ManifestService::Parser.parse(original_json, format: :curseforge)

        # Serialize the first parse result, then parse again
        second_json  = ManifestService::Serializer.serialize(first_parse, format: :curseforge)
        second_parse = ManifestService::Parser.parse(second_json, format: :curseforge)

        # The two parse results must be identical
        expect(second_parse.name).to eq(first_parse.name),
          "name changed after double round-trip"
        expect(second_parse.minecraft_version).to eq(first_parse.minecraft_version),
          "minecraft_version changed after double round-trip"
        expect(second_parse.loader).to eq(first_parse.loader),
          "loader changed after double round-trip"
        expect(second_parse.loader_version).to eq(first_parse.loader_version),
          "loader_version changed after double round-trip"
        expect(second_parse.mods.size).to eq(first_parse.mods.size),
          "mod count changed after double round-trip"
        expect(second_parse.mods.map(&:project_id).sort).to eq(first_parse.mods.map(&:project_id).sort),
          "project_ids changed after double round-trip"
        expect(second_parse.mods.map(&:version_id).sort).to eq(first_parse.mods.map(&:version_id).sort),
          "version_ids changed after double round-trip"
      end
    end

    it "Modrinth: parse(serialize(parse(json))) == parse(json) — 10 iterations" do
      property_of {
        name           = gen_safe_string(max_len: 40)
        mc_version     = choose(*VALID_MC_VERSIONS)
        loader         = choose(*VALID_LOADERS)
        loader_version = gen_loader_version
        count          = integer(0..6)
        mod_entries    = Array.new(count) { gen_modrinth_mod_entry }

        { name: name, mc_version: mc_version, loader: loader,
          loader_version: loader_version, mod_entries: mod_entries }
      }.check(10) do |params|
        original_json = build_modrinth_json(**params)

        # First parse
        first_parse = ManifestService::Parser.parse(original_json, format: :modrinth)

        # Serialize the first parse result, then parse again
        second_json  = ManifestService::Serializer.serialize(first_parse, format: :modrinth)
        second_parse = ManifestService::Parser.parse(second_json, format: :modrinth)

        expect(second_parse.name).to eq(first_parse.name),
          "name changed after double round-trip"
        expect(second_parse.minecraft_version).to eq(first_parse.minecraft_version),
          "minecraft_version changed after double round-trip"
        expect(second_parse.loader).to eq(first_parse.loader),
          "loader changed after double round-trip"
        expect(second_parse.loader_version).to eq(first_parse.loader_version),
          "loader_version changed after double round-trip"
        expect(second_parse.mods.size).to eq(first_parse.mods.size),
          "mod count changed after double round-trip"
        expect(second_parse.mods.map(&:project_id).sort).to eq(first_parse.mods.map(&:project_id).sort),
          "project_ids changed after double round-trip"
        expect(second_parse.mods.map(&:filename).sort).to eq(first_parse.mods.map(&:filename).sort),
          "filenames changed after double round-trip"
        expect(second_parse.mods.map(&:sha256).sort).to eq(first_parse.mods.map(&:sha256).sort),
          "sha256 hashes changed after double round-trip"
      end
    end
  end

  # ---------------------------------------------------------------------------
  # Property 4: Rejeição de manifestos inválidos com erro descritivo — 200 iterações
  # Feature: minecraft-launcher-platform, Property 4: Rejeição de manifestos inválidos
  # Validates: Requirements 13.2
  #
  # For any manifest with a required field missing or of the wrong type,
  # Parser.parse must raise ManifestService::ParseError with a non-empty
  # field, value, and reason.
  # ---------------------------------------------------------------------------

  describe "P4: Rejeição de manifestos inválidos com erro descritivo — 200 iterações" do
    # Validates: Requirements 13.2

    # Generators for invalid values to inject into manifests
    INVALID_SCALARS = [nil, 42, 3.14, true, false, [], {}].freeze

    # ---- CurseForge invalid manifests ----

    it "CurseForge: missing required top-level field raises ParseError — 200 iterations" do
      required_fields = %w[manifestType name minecraft files]

      property_of {
        field_to_remove = choose(*required_fields)
        mc_version      = choose(*VALID_MC_VERSIONS)
        loader          = choose(*VALID_LOADERS)
        loader_version  = gen_loader_version

        { field_to_remove: field_to_remove, mc_version: mc_version,
          loader: loader, loader_version: loader_version }
      }.check(20) do |params|
        base = {
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => params[:mc_version],
            "modLoaders" => [{ "id" => "#{params[:loader]}-#{params[:loader_version]}", "primary" => true }]
          },
          "files" => []
        }
        base.delete(params[:field_to_remove])
        json = JSON.generate(base)

        expect {
          ManifestService::Parser.parse(json, format: :curseforge)
        }.to raise_error(ManifestService::ParseError) do |e|
          expect(e.field).to be_a(String),
            "ParseError#field must be a String, got #{e.field.class}"
          expect(e.field).not_to be_empty,
            "ParseError#field must not be empty"
          expect(e.reason).to be_a(String),
            "ParseError#reason must be a String"
          expect(e.reason).not_to be_empty,
            "ParseError#reason must not be empty"
          expect(e.message).to include(e.field),
            "ParseError#message must include the field name"
          expect(e.message).to include(e.reason),
            "ParseError#message must include the reason"
        end
      end
    end

    it "CurseForge: wrong type for 'name' field raises ParseError — 200 iterations" do
      property_of {
        bad_name   = gen_invalid_string_value
        mc_version = choose(*VALID_MC_VERSIONS)
        loader     = choose(*VALID_LOADERS)

        { bad_name: bad_name, mc_version: mc_version, loader: loader }
      }.check(20) do |params|
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => params[:bad_name],
          "minecraft"       => {
            "version"    => params[:mc_version],
            "modLoaders" => [{ "id" => "#{params[:loader]}-1.0.0", "primary" => true }]
          },
          "files" => []
        })

        expect {
          ManifestService::Parser.parse(json, format: :curseforge)
        }.to raise_error(ManifestService::ParseError) do |e|
          expect(e.field).to be_a(String).and(satisfy { |f| !f.empty? }),
            "ParseError#field must be a non-empty String"
          expect(e.reason).to be_a(String).and(satisfy { |r| !r.empty? }),
            "ParseError#reason must be a non-empty String"
        end
      end
    end

    it "CurseForge: wrong type for projectID in files raises ParseError — 200 iterations" do
      property_of {
        bad_project_id = gen_invalid_integer_value
        mc_version     = choose(*VALID_MC_VERSIONS)
        loader         = choose(*VALID_LOADERS)

        { bad_project_id: bad_project_id, mc_version: mc_version, loader: loader }
      }.check(20) do |params|
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => params[:mc_version],
            "modLoaders" => [{ "id" => "#{params[:loader]}-1.0.0", "primary" => true }]
          },
          "files" => [
            { "projectID" => params[:bad_project_id], "fileID" => 456, "required" => true }
          ]
        })

        expect {
          ManifestService::Parser.parse(json, format: :curseforge)
        }.to raise_error(ManifestService::ParseError) do |e|
          expect(e.field).to be_a(String).and(satisfy { |f| !f.empty? })
          expect(e.reason).to be_a(String).and(satisfy { |r| !r.empty? })
        end
      end
    end

    it "CurseForge: invalid loader prefix raises ParseError with descriptive reason — 200 iterations" do
      property_of {
        # Generate a loader prefix that is NOT one of the valid ones
        bad_prefix = sized(integer(1..10)) { string(:alnum) }.then do |s|
          s = s.empty? ? "x" : s
          # Ensure it's not a valid prefix
          valid = %w[forge fabric quilt neoforge]
          valid.include?(s.downcase) ? "#{s}bad" : s
        end
        version    = gen_loader_version
        mc_version = choose(*VALID_MC_VERSIONS)

        { bad_prefix: bad_prefix, version: version, mc_version: mc_version }
      }.check(20) do |params|
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => params[:mc_version],
            "modLoaders" => [{ "id" => "#{params[:bad_prefix]}-#{params[:version]}", "primary" => true }]
          },
          "files" => []
        })

        expect {
          ManifestService::Parser.parse(json, format: :curseforge)
        }.to raise_error(ManifestService::ParseError) do |e|
          expect(e.field).to be_a(String).and(satisfy { |f| !f.empty? })
          expect(e.reason).to be_a(String).and(satisfy { |r| !r.empty? })
          # The error message must be descriptive (mention the field and reason)
          expect(e.message).to include(e.field)
          expect(e.message).to include(e.reason)
        end
      end
    end

    # ---- Modrinth invalid manifests ----

    it "Modrinth: missing required top-level field raises ParseError — 200 iterations" do
      required_fields = %w[formatVersion game name dependencies files]

      property_of {
        field_to_remove = choose(*required_fields)
        mc_version      = choose(*VALID_MC_VERSIONS)
        loader          = choose(*VALID_LOADERS)
        loader_version  = gen_loader_version

        { field_to_remove: field_to_remove, mc_version: mc_version,
          loader: loader, loader_version: loader_version }
      }.check(20) do |params|
        loader_key = MODRINTH_LOADER_KEYS[params[:loader]]
        base = {
          "formatVersion" => 1,
          "game"          => "minecraft",
          "name"          => "Pack",
          "dependencies"  => {
            "minecraft" => params[:mc_version],
            loader_key  => params[:loader_version]
          },
          "files" => []
        }
        base.delete(params[:field_to_remove])
        json = JSON.generate(base)

        expect {
          ManifestService::Parser.parse(json, format: :modrinth)
        }.to raise_error(ManifestService::ParseError) do |e|
          expect(e.field).to be_a(String).and(satisfy { |f| !f.empty? }),
            "ParseError#field must be a non-empty String"
          expect(e.reason).to be_a(String).and(satisfy { |r| !r.empty? }),
            "ParseError#reason must be a non-empty String"
          expect(e.message).to include(e.field)
          expect(e.message).to include(e.reason)
        end
      end
    end

    it "Modrinth: wrong type for 'name' field raises ParseError — 200 iterations" do
      property_of {
        bad_name   = gen_invalid_string_value
        mc_version = choose(*VALID_MC_VERSIONS)
        loader     = choose(*VALID_LOADERS)

        { bad_name: bad_name, mc_version: mc_version, loader: loader }
      }.check(20) do |params|
        loader_key = MODRINTH_LOADER_KEYS[params[:loader]]
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "minecraft",
          "name"          => params[:bad_name],
          "dependencies"  => {
            "minecraft" => params[:mc_version],
            loader_key  => "1.0.0"
          },
          "files" => []
        })

        expect {
          ManifestService::Parser.parse(json, format: :modrinth)
        }.to raise_error(ManifestService::ParseError) do |e|
          expect(e.field).to be_a(String).and(satisfy { |f| !f.empty? })
          expect(e.reason).to be_a(String).and(satisfy { |r| !r.empty? })
        end
      end
    end

    it "Modrinth: missing loader key in dependencies raises ParseError — 200 iterations" do
      property_of {
        mc_version = choose(*VALID_MC_VERSIONS)
        # Generate a random non-loader key to put in dependencies
        bad_key = sized(integer(1..15)) { string(:alnum) }.then do |s|
          s = s.empty? ? "x" : s
          valid_keys = %w[fabric-loader forge quilt-loader neoforge]
          valid_keys.include?(s) ? "#{s}-invalid" : s
        end

        { mc_version: mc_version, bad_key: bad_key }
      }.check(20) do |params|
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "minecraft",
          "name"          => "Pack",
          "dependencies"  => {
            "minecraft"      => params[:mc_version],
            params[:bad_key] => "1.0.0"
          },
          "files" => []
        })

        expect {
          ManifestService::Parser.parse(json, format: :modrinth)
        }.to raise_error(ManifestService::ParseError) do |e|
          expect(e.field).to eq("dependencies"),
            "Expected field 'dependencies', got #{e.field.inspect}"
          expect(e.reason).to match(/No recognized loader key/),
            "Expected reason to mention 'No recognized loader key', got: #{e.reason.inspect}"
        end
      end
    end

    it "Modrinth: file entry with empty downloads array raises ParseError — 200 iterations" do
      property_of {
        mc_version     = choose(*VALID_MC_VERSIONS)
        loader         = choose(*VALID_LOADERS)
        loader_version = gen_loader_version
        filename       = "#{gen_safe_string(max_len: 10)}.jar"
        sha256         = Array.new(64) { integer(0..15).to_s(16) }.join

        { mc_version: mc_version, loader: loader, loader_version: loader_version,
          filename: filename, sha256: sha256 }
      }.check(20) do |params|
        loader_key = MODRINTH_LOADER_KEYS[params[:loader]]
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "minecraft",
          "name"          => "Pack",
          "dependencies"  => {
            "minecraft" => params[:mc_version],
            loader_key  => params[:loader_version]
          },
          "files" => [
            {
              "path"      => "mods/#{params[:filename]}",
              "hashes"    => { "sha256" => params[:sha256] },
              "downloads" => [],   # empty — must be rejected
              "fileSize"  => 0
            }
          ]
        })

        expect {
          ManifestService::Parser.parse(json, format: :modrinth)
        }.to raise_error(ManifestService::ParseError) do |e|
          expect(e.field).to include("downloads"),
            "Expected field to mention 'downloads', got #{e.field.inspect}"
          expect(e.reason).to be_a(String).and(satisfy { |r| !r.empty? })
        end
      end
    end

    # ---- ParseError structure invariant (both formats) ----

    it "ParseError always has non-empty field, reason, and descriptive message — 200 iterations" do
      # Mix of CurseForge and Modrinth invalid manifests
      property_of {
        format = choose(:curseforge, :modrinth)
        # Produce a structurally broken manifest for the chosen format
        if format == :curseforge
          # Remove a random required field
          field_to_remove = choose("manifestType", "name", "minecraft", "files")
          base = {
            "manifestType"    => "minecraftModpack",
            "manifestVersion" => 1,
            "name"            => "Pack",
            "minecraft"       => {
              "version"    => "1.20.1",
              "modLoaders" => [{ "id" => "fabric-0.15.11", "primary" => true }]
            },
            "files" => []
          }
          base.delete(field_to_remove)
          [format, JSON.generate(base)]
        else
          field_to_remove = choose("formatVersion", "game", "name", "dependencies", "files")
          base = {
            "formatVersion" => 1,
            "game"          => "minecraft",
            "name"          => "Pack",
            "dependencies"  => { "minecraft" => "1.20.1", "fabric-loader" => "0.15.11" },
            "files"         => []
          }
          base.delete(field_to_remove)
          [format, JSON.generate(base)]
        end
      }.check(20) do |(format, json)|
        begin
          ManifestService::Parser.parse(json, format: format)
          # If no error is raised, the test should fail
          raise RSpec::Expectations::ExpectationNotMetError,
            "Expected ParseError but none was raised for format=#{format}"
        rescue ManifestService::ParseError => e
          expect(e.field).to be_a(String),
            "ParseError#field must be a String"
          expect(e.field).not_to be_empty,
            "ParseError#field must not be empty"
          expect(e.reason).to be_a(String),
            "ParseError#reason must be a String"
          expect(e.reason).not_to be_empty,
            "ParseError#reason must not be empty"
          expect(e.message).to be_a(String).and(satisfy { |m| m.length > 10 }),
            "ParseError#message must be a descriptive string"
          expect(e.message).to include(e.field),
            "ParseError#message must include the field name"
          expect(e.message).to include(e.reason),
            "ParseError#message must include the reason"
        end
      end
    end
  end
end
