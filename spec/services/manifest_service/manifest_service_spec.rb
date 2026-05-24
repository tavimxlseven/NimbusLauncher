# frozen_string_literal: true

# Unit / example tests for ManifestService::Parser and ManifestService::Serializer
# Requirements: 13.1, 13.2, 13.3, 13.6

require "rails_helper"

# Ensure service files are loaded before the describe block evaluates constants.
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

RSpec.describe ManifestService, type: :service do
  # ---------------------------------------------------------------------------
  # Shared fixture helpers
  # ---------------------------------------------------------------------------

  # Minimal valid CurseForge manifest JSON
  def valid_curseforge_json(name: "My Pack", mc_version: "1.20.1", loader: "fabric-0.15.11", files: nil)
    files ||= [{ "projectID" => 123, "fileID" => 456, "required" => true }]
    JSON.generate({
      "manifestType"    => "minecraftModpack",
      "manifestVersion" => 1,
      "name"            => name,
      "minecraft"       => {
        "version"    => mc_version,
        "modLoaders" => [{ "id" => loader, "primary" => true }]
      },
      "files" => files
    })
  end

  # Minimal valid Modrinth manifest JSON
  def valid_modrinth_json(name: "My Pack", mc_version: "1.20.1", loader_key: "fabric-loader",
                          loader_version: "0.15.11", files: nil)
    files ||= [
      {
        "path"      => "mods/sodium.jar",
        "hashes"    => { "sha256" => "abc123def456" * 4 },
        "downloads" => ["https://cdn.modrinth.com/data/AANobbMI/versions/v0.5.8/sodium-fabric-0.5.8.jar"],
        "fileSize"  => 1024
      }
    ]
    JSON.generate({
      "formatVersion" => 1,
      "game"          => "minecraft",
      "name"          => name,
      "versionId"     => "#{name}-#{mc_version}",
      "dependencies"  => {
        "minecraft"  => mc_version,
        loader_key   => loader_version
      },
      "files" => files
    })
  end

  # Build a ManifestService::Modpack value object for serialization tests
  def build_modpack(name: "Test Pack", mc_version: "1.20.1", loader: :fabric,
                    loader_version: "0.15.11", mods: nil)
    mods ||= [
      ManifestService::ModEntry.new(
        source:     :curseforge,
        project_id: "123",
        version_id: "456",
        filename:   nil,
        sha256:     nil
      )
    ]
    ManifestService::Modpack.new(
      name:              name,
      minecraft_version: mc_version,
      loader:            loader,
      loader_version:    loader_version,
      mods:              mods
    )
  end

  # ---------------------------------------------------------------------------
  # ManifestService::Parser — valid CurseForge manifests (Req 13.1, 13.5)
  # ---------------------------------------------------------------------------

  describe "ManifestService::Parser — valid CurseForge manifests" do
    subject(:modpack) { ManifestService::Parser.parse(json, format: :curseforge) }

    context "with a minimal valid manifest" do
      let(:json) { valid_curseforge_json }

      it "returns a Modpack value object" do
        expect(modpack).to be_a(ManifestService::Modpack)
      end

      it "parses the name correctly" do
        expect(modpack.name).to eq("My Pack")
      end

      it "parses the minecraft_version correctly" do
        expect(modpack.minecraft_version).to eq("1.20.1")
      end

      it "parses the loader as :fabric" do
        expect(modpack.loader).to eq(:fabric)
      end

      it "parses the loader_version correctly" do
        expect(modpack.loader_version).to eq("0.15.11")
      end

      it "parses the mods list with one entry" do
        expect(modpack.mods.size).to eq(1)
      end

      it "parses the mod project_id as a string" do
        expect(modpack.mods.first.project_id).to eq("123")
      end

      it "parses the mod version_id as a string" do
        expect(modpack.mods.first.version_id).to eq("456")
      end

      it "sets the mod source to :curseforge" do
        expect(modpack.mods.first.source).to eq(:curseforge)
      end
    end

    context "with all four supported loaders" do
      %w[forge fabric quilt neoforge].each do |loader_name|
        it "parses loader '#{loader_name}' correctly" do
          json = valid_curseforge_json(loader: "#{loader_name}-1.0.0")
          result = ManifestService::Parser.parse(json, format: :curseforge)
          expect(result.loader).to eq(loader_name.to_sym)
          expect(result.loader_version).to eq("1.0.0")
        end
      end
    end

    context "with an empty files array" do
      let(:json) { valid_curseforge_json(files: []) }

      it "returns a Modpack with an empty mods list" do
        expect(modpack.mods).to be_empty
      end
    end

    context "with multiple mod entries" do
      let(:json) do
        valid_curseforge_json(files: [
          { "projectID" => 1, "fileID" => 10, "required" => true },
          { "projectID" => 2, "fileID" => 20, "required" => true },
          { "projectID" => 3, "fileID" => 30, "required" => false }
        ])
      end

      it "parses all three mods" do
        expect(modpack.mods.size).to eq(3)
      end

      it "preserves project_ids in order" do
        expect(modpack.mods.map(&:project_id)).to eq(%w[1 2 3])
      end
    end
  end

  # ---------------------------------------------------------------------------
  # ManifestService::Parser — valid Modrinth manifests (Req 13.1, 13.5)
  # ---------------------------------------------------------------------------

  describe "ManifestService::Parser — valid Modrinth manifests" do
    subject(:modpack) { ManifestService::Parser.parse(json, format: :modrinth) }

    context "with a minimal valid manifest" do
      let(:json) { valid_modrinth_json }

      it "returns a Modpack value object" do
        expect(modpack).to be_a(ManifestService::Modpack)
      end

      it "parses the name correctly" do
        expect(modpack.name).to eq("My Pack")
      end

      it "parses the minecraft_version correctly" do
        expect(modpack.minecraft_version).to eq("1.20.1")
      end

      it "parses the loader as :fabric" do
        expect(modpack.loader).to eq(:fabric)
      end

      it "parses the loader_version correctly" do
        expect(modpack.loader_version).to eq("0.15.11")
      end

      it "parses the mods list with one entry" do
        expect(modpack.mods.size).to eq(1)
      end

      it "sets the mod source to :modrinth" do
        expect(modpack.mods.first.source).to eq(:modrinth)
      end

      it "extracts the filename from the path" do
        expect(modpack.mods.first.filename).to eq("sodium.jar")
      end

      it "extracts the sha256 hash" do
        expect(modpack.mods.first.sha256).to eq("abc123def456" * 4)
      end
    end

    context "with all four supported loaders" do
      {
        "fabric-loader" => :fabric,
        "forge"         => :forge,
        "quilt-loader"  => :quilt,
        "neoforge"      => :neoforge
      }.each do |loader_key, expected_sym|
        it "parses loader key '#{loader_key}' as #{expected_sym.inspect}" do
          json = valid_modrinth_json(loader_key: loader_key, loader_version: "1.0.0")
          result = ManifestService::Parser.parse(json, format: :modrinth)
          expect(result.loader).to eq(expected_sym)
          expect(result.loader_version).to eq("1.0.0")
        end
      end
    end

    context "with a CDN download URL" do
      let(:json) do
        valid_modrinth_json(files: [
          {
            "path"      => "mods/sodium.jar",
            "hashes"    => { "sha256" => "deadbeef" * 8 },
            "downloads" => ["https://cdn.modrinth.com/data/AANobbMI/versions/v0.5.8/sodium.jar"],
            "fileSize"  => 512
          }
        ])
      end

      it "extracts project_id from the CDN URL" do
        expect(modpack.mods.first.project_id).to eq("AANobbMI")
      end

      it "extracts version_id from the CDN URL" do
        expect(modpack.mods.first.version_id).to eq("v0.5.8")
      end
    end

    context "with a non-CDN download URL" do
      let(:json) do
        valid_modrinth_json(files: [
          {
            "path"      => "mods/mymod.jar",
            "hashes"    => { "sha256" => "cafebabe" * 8 },
            "downloads" => ["https://example.com/mymod.jar"],
            "fileSize"  => 256
          }
        ])
      end

      it "uses the filename (without extension) as project_id" do
        expect(modpack.mods.first.project_id).to eq("mymod")
      end

      it "uses the full URL as version_id" do
        expect(modpack.mods.first.version_id).to eq("https://example.com/mymod.jar")
      end
    end

    context "with an empty files array" do
      let(:json) { valid_modrinth_json(files: []) }

      it "returns a Modpack with an empty mods list" do
        expect(modpack.mods).to be_empty
      end
    end
  end

  # ---------------------------------------------------------------------------
  # ManifestService::Parser — auto-detect format (Req 13.5)
  # ---------------------------------------------------------------------------

  describe "ManifestService::Parser.detect_format" do
    it "detects CurseForge format" do
      expect(ManifestService::Parser.detect_format(valid_curseforge_json)).to eq(:curseforge)
    end

    it "detects Modrinth format" do
      expect(ManifestService::Parser.detect_format(valid_modrinth_json)).to eq(:modrinth)
    end

    it "raises ParseError for unrecognized JSON structure" do
      json = JSON.generate({ "foo" => "bar" })
      expect {
        ManifestService::Parser.detect_format(json)
      }.to raise_error(ManifestService::ParseError) do |e|
        expect(e.field).to eq("manifest")
        expect(e.reason).to match(/Cannot detect format/)
      end
    end
  end

  # ---------------------------------------------------------------------------
  # ManifestService::Parser — invalid / corrupted manifests (Req 13.2)
  # ---------------------------------------------------------------------------

  describe "ManifestService::Parser — invalid manifests" do
    shared_examples "raises ParseError" do |expected_field: nil, expected_reason_pattern: nil|
      it "raises ManifestService::ParseError" do
        expect { subject }.to raise_error(ManifestService::ParseError)
      end

      if expected_field
        it "reports the correct field in the error" do
          begin
            subject
          rescue ManifestService::ParseError => e
            expect(e.field).to eq(expected_field)
          end
        end
      end

      if expected_reason_pattern
        it "includes a descriptive reason" do
          begin
            subject
          rescue ManifestService::ParseError => e
            expect(e.reason).to match(expected_reason_pattern)
          end
        end
      end
    end

    context "with invalid JSON" do
      subject { ManifestService::Parser.parse("not json {{{", format: :curseforge) }

      include_examples "raises ParseError", expected_field: "manifest", expected_reason_pattern: /Invalid JSON/
    end

    context "with empty string" do
      subject { ManifestService::Parser.parse("", format: :curseforge) }

      include_examples "raises ParseError", expected_field: "manifest"
    end

    # ---- CurseForge invalid cases ----

    context "CurseForge: missing 'name' field" do
      subject do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "minecraft"       => {
            "version"    => "1.20.1",
            "modLoaders" => [{ "id" => "fabric-0.15.11", "primary" => true }]
          },
          "files" => []
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError", expected_field: "name"
    end

    context "CurseForge: wrong manifestType value" do
      subject do
        json = JSON.generate({
          "manifestType"    => "wrongType",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => "1.20.1",
            "modLoaders" => [{ "id" => "fabric-0.15.11", "primary" => true }]
          },
          "files" => []
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError",
        expected_field: "manifestType",
        expected_reason_pattern: /minecraftModpack/
    end

    context "CurseForge: missing 'minecraft' object" do
      subject do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "files"           => []
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError", expected_field: "minecraft"
    end

    context "CurseForge: 'minecraft' is not an object" do
      subject do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => "1.20.1",
          "files"           => []
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError", expected_field: "minecraft"
    end

    context "CurseForge: empty modLoaders array" do
      subject do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => "1.20.1",
            "modLoaders" => []
          },
          "files" => []
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError",
        expected_field: "minecraft.modLoaders",
        expected_reason_pattern: /at least one/
    end

    context "CurseForge: unknown loader prefix" do
      subject do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => "1.20.1",
            "modLoaders" => [{ "id" => "unknown-1.0.0", "primary" => true }]
          },
          "files" => []
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError",
        expected_field: "minecraft.modLoaders[0].id",
        expected_reason_pattern: /Unknown loader prefix/
    end

    context "CurseForge: loader id without version (no hyphen)" do
      subject do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => "1.20.1",
            "modLoaders" => [{ "id" => "fabric", "primary" => true }]
          },
          "files" => []
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError", expected_field: "minecraft.modLoaders[0].id"
    end

    context "CurseForge: projectID is a string instead of integer" do
      subject do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => "1.20.1",
            "modLoaders" => [{ "id" => "fabric-0.15.11", "primary" => true }]
          },
          "files" => [{ "projectID" => "not-an-int", "fileID" => 456, "required" => true }]
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError",
        expected_field: "files[0].projectID",
        expected_reason_pattern: /integer/
    end

    context "CurseForge: fileID is nil" do
      subject do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => "1.20.1",
            "modLoaders" => [{ "id" => "fabric-0.15.11", "primary" => true }]
          },
          "files" => [{ "projectID" => 123, "fileID" => nil, "required" => true }]
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError", expected_field: "files[0].fileID"
    end

    context "CurseForge: 'files' is not an array" do
      subject do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => "1.20.1",
            "modLoaders" => [{ "id" => "fabric-0.15.11", "primary" => true }]
          },
          "files" => "not-an-array"
        })
        ManifestService::Parser.parse(json, format: :curseforge)
      end

      include_examples "raises ParseError", expected_field: "files"
    end

    # ---- Modrinth invalid cases ----

    context "Modrinth: wrong formatVersion" do
      subject do
        json = JSON.generate({
          "formatVersion" => 2,
          "game"          => "minecraft",
          "name"          => "Pack",
          "dependencies"  => { "minecraft" => "1.20.1", "fabric-loader" => "0.15.11" },
          "files"         => []
        })
        ManifestService::Parser.parse(json, format: :modrinth)
      end

      include_examples "raises ParseError",
        expected_field: "formatVersion",
        expected_reason_pattern: /Expected 1/
    end

    context "Modrinth: wrong game value" do
      subject do
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "terraria",
          "name"          => "Pack",
          "dependencies"  => { "minecraft" => "1.20.1", "fabric-loader" => "0.15.11" },
          "files"         => []
        })
        ManifestService::Parser.parse(json, format: :modrinth)
      end

      include_examples "raises ParseError",
        expected_field: "game",
        expected_reason_pattern: /minecraft/
    end

    context "Modrinth: missing 'name' field" do
      subject do
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "minecraft",
          "dependencies"  => { "minecraft" => "1.20.1", "fabric-loader" => "0.15.11" },
          "files"         => []
        })
        ManifestService::Parser.parse(json, format: :modrinth)
      end

      include_examples "raises ParseError", expected_field: "name"
    end

    context "Modrinth: missing 'dependencies' object" do
      subject do
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "minecraft",
          "name"          => "Pack",
          "files"         => []
        })
        ManifestService::Parser.parse(json, format: :modrinth)
      end

      include_examples "raises ParseError", expected_field: "dependencies"
    end

    context "Modrinth: no recognized loader key in dependencies" do
      subject do
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "minecraft",
          "name"          => "Pack",
          "dependencies"  => { "minecraft" => "1.20.1" },
          "files"         => []
        })
        ManifestService::Parser.parse(json, format: :modrinth)
      end

      include_examples "raises ParseError",
        expected_field: "dependencies",
        expected_reason_pattern: /No recognized loader key/
    end

    context "Modrinth: file entry missing 'path'" do
      subject do
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "minecraft",
          "name"          => "Pack",
          "dependencies"  => { "minecraft" => "1.20.1", "fabric-loader" => "0.15.11" },
          "files"         => [
            {
              "hashes"    => { "sha256" => "abc" },
              "downloads" => ["https://example.com/mod.jar"],
              "fileSize"  => 0
            }
          ]
        })
        ManifestService::Parser.parse(json, format: :modrinth)
      end

      include_examples "raises ParseError", expected_field: "files[0].path"
    end

    context "Modrinth: file entry with empty downloads array" do
      subject do
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "minecraft",
          "name"          => "Pack",
          "dependencies"  => { "minecraft" => "1.20.1", "fabric-loader" => "0.15.11" },
          "files"         => [
            {
              "path"      => "mods/mod.jar",
              "hashes"    => { "sha256" => "abc" },
              "downloads" => [],
              "fileSize"  => 0
            }
          ]
        })
        ManifestService::Parser.parse(json, format: :modrinth)
      end

      include_examples "raises ParseError",
        expected_field: "files[0].downloads",
        expected_reason_pattern: /at least one/
    end

    context "Modrinth: file entry missing 'hashes'" do
      subject do
        json = JSON.generate({
          "formatVersion" => 1,
          "game"          => "minecraft",
          "name"          => "Pack",
          "dependencies"  => { "minecraft" => "1.20.1", "fabric-loader" => "0.15.11" },
          "files"         => [
            {
              "path"      => "mods/mod.jar",
              "downloads" => ["https://example.com/mod.jar"],
              "fileSize"  => 0
            }
          ]
        })
        ManifestService::Parser.parse(json, format: :modrinth)
      end

      include_examples "raises ParseError", expected_field: "files[0].hashes"
    end

    context "ParseError carries field, value, and reason" do
      it "exposes all three attributes" do
        json = JSON.generate({
          "manifestType"    => "minecraftModpack",
          "manifestVersion" => 1,
          "name"            => "Pack",
          "minecraft"       => {
            "version"    => "1.20.1",
            "modLoaders" => [{ "id" => "badloader-1.0", "primary" => true }]
          },
          "files" => []
        })

        begin
          ManifestService::Parser.parse(json, format: :curseforge)
          fail "Expected ParseError to be raised"
        rescue ManifestService::ParseError => e
          expect(e.field).to be_a(String)
          expect(e.reason).to be_a(String)
          expect(e.message).to include(e.field)
          expect(e.message).to include(e.reason)
        end
      end
    end
  end

  # ---------------------------------------------------------------------------
  # ManifestService::Serializer — valid serialization (Req 13.3)
  # ---------------------------------------------------------------------------

  describe "ManifestService::Serializer — valid serialization" do
    let(:modpack) { build_modpack }

    context "CurseForge format" do
      subject(:json) { ManifestService::Serializer.serialize(modpack, format: :curseforge) }

      it "returns a String" do
        expect(json).to be_a(String)
      end

      it "returns valid JSON" do
        expect { JSON.parse(json) }.not_to raise_error
      end

      it "includes manifestType 'minecraftModpack'" do
        parsed = JSON.parse(json)
        expect(parsed["manifestType"]).to eq("minecraftModpack")
      end

      it "includes the modpack name" do
        parsed = JSON.parse(json)
        expect(parsed["name"]).to eq("Test Pack")
      end

      it "includes the minecraft version" do
        parsed = JSON.parse(json)
        expect(parsed.dig("minecraft", "version")).to eq("1.20.1")
      end

      it "includes the loader id in modLoaders" do
        parsed = JSON.parse(json)
        loader_id = parsed.dig("minecraft", "modLoaders", 0, "id")
        expect(loader_id).to eq("fabric-0.15.11")
      end

      it "includes the files array with integer projectID and fileID" do
        parsed = JSON.parse(json)
        expect(parsed["files"].first["projectID"]).to eq(123)
        expect(parsed["files"].first["fileID"]).to eq(456)
      end
    end

    context "Modrinth format" do
      let(:modpack) do
        build_modpack(mods: [
          ManifestService::ModEntry.new(
            source:     :modrinth,
            project_id: "AANobbMI",
            version_id: "v0.5.8",
            filename:   "sodium.jar",
            sha256:     "deadbeef" * 8
          )
        ])
      end

      subject(:json) { ManifestService::Serializer.serialize(modpack, format: :modrinth) }

      it "returns valid JSON" do
        expect { JSON.parse(json) }.not_to raise_error
      end

      it "includes formatVersion 1" do
        parsed = JSON.parse(json)
        expect(parsed["formatVersion"]).to eq(1)
      end

      it "includes game 'minecraft'" do
        parsed = JSON.parse(json)
        expect(parsed["game"]).to eq("minecraft")
      end

      it "includes the modpack name" do
        parsed = JSON.parse(json)
        expect(parsed["name"]).to eq("Test Pack")
      end

      it "includes the minecraft version in dependencies" do
        parsed = JSON.parse(json)
        expect(parsed.dig("dependencies", "minecraft")).to eq("1.20.1")
      end

      it "includes the loader version in dependencies" do
        parsed = JSON.parse(json)
        expect(parsed.dig("dependencies", "fabric-loader")).to eq("0.15.11")
      end

      it "includes the file path" do
        parsed = JSON.parse(json)
        expect(parsed["files"].first["path"]).to eq("mods/sodium.jar")
      end

      it "includes the sha256 hash" do
        parsed = JSON.parse(json)
        expect(parsed.dig("files", 0, "hashes", "sha256")).to eq("deadbeef" * 8)
      end

      it "includes a download URL" do
        parsed = JSON.parse(json)
        expect(parsed.dig("files", 0, "downloads", 0)).to be_a(String)
        expect(parsed.dig("files", 0, "downloads", 0)).not_to be_empty
      end
    end

    context "all four loaders serialize correctly in CurseForge format" do
      %i[forge fabric quilt neoforge].each do |loader_sym|
        it "serializes loader #{loader_sym.inspect}" do
          pack = build_modpack(loader: loader_sym, loader_version: "1.0.0")
          json = ManifestService::Serializer.serialize(pack, format: :curseforge)
          parsed = JSON.parse(json)
          loader_id = parsed.dig("minecraft", "modLoaders", 0, "id")
          expect(loader_id).to start_with("#{loader_sym}-")
        end
      end
    end

    context "all four loaders serialize correctly in Modrinth format" do
      {
        forge:    "forge",
        fabric:   "fabric-loader",
        quilt:    "quilt-loader",
        neoforge: "neoforge"
      }.each do |loader_sym, expected_key|
        it "serializes loader #{loader_sym.inspect} with key '#{expected_key}'" do
          pack = build_modpack(loader: loader_sym, loader_version: "1.0.0", mods: [
            ManifestService::ModEntry.new(
              source:     :modrinth,
              project_id: "proj",
              version_id: "v1",
              filename:   "mod.jar",
              sha256:     "abc"
            )
          ])
          json = ManifestService::Serializer.serialize(pack, format: :modrinth)
          parsed = JSON.parse(json)
          expect(parsed.dig("dependencies", expected_key)).to eq("1.0.0")
        end
      end
    end
  end

  # ---------------------------------------------------------------------------
  # ManifestService::Serializer — unsupported format (Req 13.6)
  # ---------------------------------------------------------------------------

  describe "ManifestService::Serializer — unsupported format" do
    let(:modpack) { build_modpack }

    it "raises UnsupportedFormatError for an unknown format symbol" do
      expect {
        ManifestService::Serializer.serialize(modpack, format: :unknown)
      }.to raise_error(ManifestService::UnsupportedFormatError)
    end

    it "raises UnsupportedFormatError for a string format" do
      expect {
        ManifestService::Serializer.serialize(modpack, format: "curseforge")
      }.to raise_error(ManifestService::UnsupportedFormatError)
    end

    it "raises UnsupportedFormatError for nil format" do
      expect {
        ManifestService::Serializer.serialize(modpack, format: nil)
      }.to raise_error(ManifestService::UnsupportedFormatError)
    end

    it "includes the unsupported format in the error message" do
      begin
        ManifestService::Serializer.serialize(modpack, format: :badformat)
        fail "Expected UnsupportedFormatError"
      rescue ManifestService::UnsupportedFormatError => e
        expect(e.message).to include("badformat")
      end
    end

    it "lists supported formats in the error message" do
      begin
        ManifestService::Serializer.serialize(modpack, format: :badformat)
        fail "Expected UnsupportedFormatError"
      rescue ManifestService::UnsupportedFormatError => e
        expect(e.message).to match(/curseforge/i)
        expect(e.message).to match(/modrinth/i)
      end
    end
  end

  # ---------------------------------------------------------------------------
  # ManifestService::Parser — unsupported format passed to parse (Req 13.2)
  # ---------------------------------------------------------------------------

  describe "ManifestService::Parser — unsupported format" do
    it "raises ParseError for an unknown format symbol" do
      expect {
        ManifestService::Parser.parse(valid_curseforge_json, format: :unknown)
      }.to raise_error(ManifestService::ParseError) do |e|
        expect(e.field).to eq("format")
        expect(e.reason).to match(/Unsupported format/)
      end
    end
  end
end
