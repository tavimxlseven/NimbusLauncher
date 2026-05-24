# frozen_string_literal: true

require "json"

module ManifestService
  # Parses CurseForge and Modrinth modpack manifests into +Modpack+ value objects.
  #
  # Usage:
  #   modpack = ManifestService::Parser.parse(json_string, format: :curseforge)
  #   modpack = ManifestService::Parser.parse(json_string, format: :modrinth)
  #
  #   # Auto-detect format:
  #   format  = ManifestService::Parser.detect_format(json_string)
  #   modpack = ManifestService::Parser.parse(json_string, format: format)
  #
  # Raises +ManifestService::ParseError+ on any validation failure.
  class Parser
    # ---------------------------------------------------------------------------
    # Public API
    # ---------------------------------------------------------------------------

    # Parse a manifest JSON string for the given +format+.
    #
    # @param json_string [String] raw JSON content of the manifest file
    # @param format [Symbol] :curseforge or :modrinth
    # @return [Modpack]
    # @raise [ManifestService::ParseError] on any validation failure
    def self.parse(json_string, format:)
      data = parse_json(json_string)

      case format
      when :curseforge then parse_curseforge(data)
      when :modrinth   then parse_modrinth(data)
      else
        raise ParseError.new(
          field:  "format",
          value:  format,
          reason: "Unsupported format. Supported formats: #{SUPPORTED_FORMATS.map(&:inspect).join(', ')}"
        )
      end
    end

    # Auto-detect the manifest format by inspecting JSON keys.
    #
    # CurseForge manifests contain +manifestType+ and +minecraft+ keys.
    # Modrinth manifests contain +formatVersion+ and +dependencies+ keys.
    #
    # @param json_string [String] raw JSON content
    # @return [Symbol] :curseforge or :modrinth
    # @raise [ManifestService::ParseError] when format cannot be determined
    def self.detect_format(json_string)
      data = parse_json(json_string)

      if data.key?("manifestType") && data.key?("minecraft")
        :curseforge
      elsif data.key?("formatVersion") && data.key?("dependencies")
        :modrinth
      else
        raise ParseError.new(
          field:  "manifest",
          value:  data.keys,
          reason: "Cannot detect format. Expected CurseForge keys (manifestType, minecraft) " \
                  "or Modrinth keys (formatVersion, dependencies)"
        )
      end
    end

    # ---------------------------------------------------------------------------
    # Private helpers
    # ---------------------------------------------------------------------------

    private_class_method def self.parse_json(json_string)
      JSON.parse(json_string)
    rescue JSON::ParserError => e
      raise ParseError.new(
        field:  "manifest",
        value:  json_string.to_s.slice(0, 120),
        reason: "Invalid JSON: #{e.message}"
      )
    end

    # ---- CurseForge -----------------------------------------------------------
    #
    # Expected structure:
    #   {
    #     "manifestType": "minecraftModpack",
    #     "name": "My Pack",
    #     "minecraft": {
    #       "version": "1.20.1",
    #       "modLoaders": [{ "id": "fabric-0.15.11", "primary": true }]
    #     },
    #     "files": [
    #       { "projectID": 123, "fileID": 456, "required": true }
    #     ]
    #   }
    private_class_method def self.parse_curseforge(data)
      # manifestType must be "minecraftModpack"
      manifest_type = fetch_field(data, "manifestType")
      unless manifest_type == "minecraftModpack"
        raise ParseError.new(
          field:  "manifestType",
          value:  manifest_type,
          reason: 'Expected "minecraftModpack"'
        )
      end

      # name
      name = fetch_string(data, "name")

      # minecraft object
      minecraft = fetch_object(data, "minecraft")

      # minecraft.version
      mc_version = fetch_string(minecraft, "minecraft.version", key: "version")

      # minecraft.modLoaders — must be a non-empty array
      mod_loaders = fetch_array(minecraft, "minecraft.modLoaders", key: "modLoaders")
      if mod_loaders.empty?
        raise ParseError.new(
          field:  "minecraft.modLoaders",
          value:  mod_loaders,
          reason: "Must contain at least one mod loader entry"
        )
      end

      primary_loader = mod_loaders.first
      unless primary_loader.is_a?(Hash) && primary_loader["id"].is_a?(String)
        raise ParseError.new(
          field:  "minecraft.modLoaders[0].id",
          value:  primary_loader,
          reason: "Expected an object with a string 'id' field (e.g. 'fabric-0.15.11')"
        )
      end

      loader_id_raw = primary_loader["id"]
      loader, loader_version = parse_loader_id(loader_id_raw, field: "minecraft.modLoaders[0].id")

      # files — must be an array (may be empty)
      files = fetch_array(data, "files")
      mods  = files.each_with_index.map do |file, idx|
        parse_curseforge_file(file, idx)
      end

      Modpack.new(
        name:              name,
        minecraft_version: mc_version,
        loader:            loader,
        loader_version:    loader_version,
        mods:              mods
      )
    end

    # Parse a single CurseForge file entry.
    private_class_method def self.parse_curseforge_file(file, idx)
      unless file.is_a?(Hash)
        raise ParseError.new(
          field:  "files[#{idx}]",
          value:  file,
          reason: "Expected an object"
        )
      end

      project_id = fetch_integer(file, "files[#{idx}].projectID", key: "projectID")
      file_id    = fetch_integer(file, "files[#{idx}].fileID",    key: "fileID")

      ModEntry.new(
        source:     :curseforge,
        project_id: project_id.to_s,
        version_id: file_id.to_s,
        filename:   nil,
        sha256:     nil
      )
    end

    # ---- Modrinth -------------------------------------------------------------
    #
    # Expected structure:
    #   {
    #     "formatVersion": 1,
    #     "game": "minecraft",
    #     "name": "My Pack",
    #     "dependencies": {
    #       "minecraft": "1.20.1",
    #       "fabric-loader": "0.15.11"   // or "forge", "quilt-loader", "neoforge"
    #     },
    #     "files": [
    #       {
    #         "path": "mods/sodium.jar",
    #         "hashes": { "sha256": "abc123..." },
    #         "downloads": ["https://cdn.modrinth.com/..."]
    #       }
    #     ]
    #   }
    private_class_method def self.parse_modrinth(data)
      # formatVersion must be 1
      format_version = fetch_field(data, "formatVersion")
      unless format_version == 1
        raise ParseError.new(
          field:  "formatVersion",
          value:  format_version,
          reason: "Expected 1"
        )
      end

      # game must be "minecraft"
      game = fetch_string(data, "game")
      unless game == "minecraft"
        raise ParseError.new(
          field:  "game",
          value:  game,
          reason: 'Expected "minecraft"'
        )
      end

      # name
      name = fetch_string(data, "name")

      # dependencies object
      deps = fetch_object(data, "dependencies")

      # dependencies.minecraft
      mc_version = fetch_string(deps, "dependencies.minecraft", key: "minecraft")

      # detect loader from dependencies keys
      loader, loader_version = detect_modrinth_loader(deps)

      # files — must be an array (may be empty)
      files = fetch_array(data, "files")
      mods  = files.each_with_index.map do |file, idx|
        parse_modrinth_file(file, idx)
      end

      Modpack.new(
        name:              name,
        minecraft_version: mc_version,
        loader:            loader,
        loader_version:    loader_version,
        mods:              mods
      )
    end

    # Detect loader symbol and version from Modrinth dependencies hash.
    # Modrinth uses keys like "fabric-loader", "forge", "quilt-loader", "neoforge".
    MODRINTH_LOADER_KEYS = {
      "fabric-loader" => :fabric,
      "forge"         => :forge,
      "quilt-loader"  => :quilt,
      "neoforge"      => :neoforge
    }.freeze

    private_class_method def self.detect_modrinth_loader(deps)
      MODRINTH_LOADER_KEYS.each do |key, loader_sym|
        next unless deps.key?(key)

        version = deps[key]
        unless version.is_a?(String) && !version.empty?
          raise ParseError.new(
            field:  "dependencies.#{key}",
            value:  version,
            reason: "Expected a non-empty string for loader version"
          )
        end
        return [loader_sym, version]
      end

      raise ParseError.new(
        field:  "dependencies",
        value:  deps.keys,
        reason: "No recognized loader key found. Expected one of: #{MODRINTH_LOADER_KEYS.keys.map(&:inspect).join(', ')}"
      )
    end

    # Parse a single Modrinth file entry.
    private_class_method def self.parse_modrinth_file(file, idx)
      unless file.is_a?(Hash)
        raise ParseError.new(
          field:  "files[#{idx}]",
          value:  file,
          reason: "Expected an object"
        )
      end

      # path
      path = fetch_string(file, "files[#{idx}].path", key: "path")

      # hashes.sha256
      hashes = fetch_object(file, "files[#{idx}].hashes", key: "hashes")
      sha256 = fetch_string(hashes, "files[#{idx}].hashes.sha256", key: "sha256")

      # downloads — must be a non-empty array
      downloads = fetch_array(file, "files[#{idx}].downloads", key: "downloads")
      if downloads.empty?
        raise ParseError.new(
          field:  "files[#{idx}].downloads",
          value:  downloads,
          reason: "Must contain at least one download URL"
        )
      end

      download_url = downloads.first
      unless download_url.is_a?(String) && !download_url.empty?
        raise ParseError.new(
          field:  "files[#{idx}].downloads[0]",
          value:  download_url,
          reason: "Expected a non-empty string URL"
        )
      end

      # Derive project_id and version_id from the download URL when possible.
      # Modrinth CDN URLs look like:
      #   https://cdn.modrinth.com/data/<project_id>/versions/<version_id>/<filename>
      project_id, version_id = extract_modrinth_ids(download_url, path)

      ModEntry.new(
        source:     :modrinth,
        project_id: project_id,
        version_id: version_id,
        filename:   File.basename(path),
        sha256:     sha256
      )
    end

    # Extract project_id and version_id from a Modrinth CDN URL.
    # Falls back to using the filename as a stable identifier when the URL
    # does not match the expected CDN pattern.
    MODRINTH_CDN_PATTERN = %r{/data/([^/]+)/versions/([^/]+)/}

    private_class_method def self.extract_modrinth_ids(url, path)
      if (match = url.match(MODRINTH_CDN_PATTERN))
        [match[1], match[2]]
      else
        # Non-CDN URL: use filename as project_id, URL as version_id
        [File.basename(path, ".*"), url]
      end
    end

    # ---- Loader ID parsing (CurseForge) ---------------------------------------
    #
    # CurseForge encodes loader and version as "<loader>-<version>",
    # e.g. "fabric-0.15.11", "forge-47.2.0", "quilt-0.24.0", "neoforge-20.4.80".
    LOADER_PREFIX_MAP = {
      "fabric"   => :fabric,
      "forge"    => :forge,
      "quilt"    => :quilt,
      "neoforge" => :neoforge
    }.freeze

    private_class_method def self.parse_loader_id(loader_id, field:)
      unless loader_id.is_a?(String) && loader_id.include?("-")
        raise ParseError.new(
          field:  field,
          value:  loader_id,
          reason: 'Expected format "<loader>-<version>" (e.g. "fabric-0.15.11")'
        )
      end

      # Split on first hyphen only so versions like "neoforge-20.4.80-beta" work.
      prefix, version = loader_id.split("-", 2)

      loader_sym = LOADER_PREFIX_MAP[prefix]
      unless loader_sym
        raise ParseError.new(
          field:  field,
          value:  loader_id,
          reason: "Unknown loader prefix '#{prefix}'. Expected one of: #{LOADER_PREFIX_MAP.keys.map(&:inspect).join(', ')}"
        )
      end

      if version.nil? || version.empty?
        raise ParseError.new(
          field:  field,
          value:  loader_id,
          reason: "Loader version is missing in '#{loader_id}'"
        )
      end

      [loader_sym, version]
    end

    # ---- Generic field helpers ------------------------------------------------

    # Fetch a field that must be present (non-nil). Returns the raw value.
    private_class_method def self.fetch_field(hash, field, key: nil)
      k = key || field
      unless hash.key?(k)
        raise ParseError.new(
          field:  field,
          value:  nil,
          reason: "Required field is missing"
        )
      end
      hash[k]
    end

    # Fetch a field that must be a non-empty String.
    private_class_method def self.fetch_string(hash, field, key: nil)
      value = fetch_field(hash, field, key: key)
      unless value.is_a?(String) && !value.empty?
        raise ParseError.new(
          field:  field,
          value:  value,
          reason: "Expected a non-empty string"
        )
      end
      value
    end

    # Fetch a field that must be a Hash.
    private_class_method def self.fetch_object(hash, field, key: nil)
      value = fetch_field(hash, field, key: key)
      unless value.is_a?(Hash)
        raise ParseError.new(
          field:  field,
          value:  value,
          reason: "Expected an object"
        )
      end
      value
    end

    # Fetch a field that must be an Array.
    private_class_method def self.fetch_array(hash, field, key: nil)
      value = fetch_field(hash, field, key: key)
      unless value.is_a?(Array)
        raise ParseError.new(
          field:  field,
          value:  value,
          reason: "Expected an array"
        )
      end
      value
    end

    # Fetch a field that must be an Integer.
    private_class_method def self.fetch_integer(hash, field, key: nil)
      value = fetch_field(hash, field, key: key)
      unless value.is_a?(Integer)
        raise ParseError.new(
          field:  field,
          value:  value,
          reason: "Expected an integer"
        )
      end
      value
    end
  end
end
