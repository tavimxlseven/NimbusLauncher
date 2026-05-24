# frozen_string_literal: true

require "json"

module ManifestService
  # Serializes a +Modpack+ value object into a JSON string in the requested format.
  #
  # Usage:
  #   json = ManifestService::Serializer.serialize(modpack, format: :curseforge)
  #   json = ManifestService::Serializer.serialize(modpack, format: :modrinth)
  #
  # Raises +ManifestService::UnsupportedFormatError+ when +format+ is not
  # +:curseforge+ or +:modrinth+.
  class Serializer
    # Loader key mapping used when serializing to Modrinth format.
    # Modrinth uses string keys in the +dependencies+ object.
    MODRINTH_LOADER_KEYS = {
      fabric:   "fabric-loader",
      forge:    "forge",
      quilt:    "quilt-loader",
      neoforge: "neoforge"
    }.freeze

    # Serialize a +Modpack+ value object to a JSON string.
    #
    # @param modpack [Modpack] the modpack to serialize
    # @param format [Symbol] :curseforge or :modrinth
    # @return [String] valid JSON string
    # @raise [ManifestService::UnsupportedFormatError] if format is not supported
    def self.serialize(modpack, format:)
      case format
      when :curseforge then serialize_curseforge(modpack)
      when :modrinth   then serialize_modrinth(modpack)
      else
        raise UnsupportedFormatError.new(format)
      end
    end

    # ---------------------------------------------------------------------------
    # Private helpers
    # ---------------------------------------------------------------------------

    # Serialize to CurseForge manifest.json format:
    #
    #   {
    #     "manifestType": "minecraftModpack",
    #     "manifestVersion": 1,
    #     "name": "<name>",
    #     "minecraft": {
    #       "version": "<minecraft_version>",
    #       "modLoaders": [{ "id": "<loader>-<loader_version>", "primary": true }]
    #     },
    #     "files": [
    #       { "projectID": <integer>, "fileID": <integer>, "required": true }
    #     ]
    #   }
    private_class_method def self.serialize_curseforge(modpack)
      files = modpack.mods.map do |mod|
        {
          "projectID" => Integer(mod.project_id),
          "fileID"    => Integer(mod.version_id),
          "required"  => true
        }
      end

      document = {
        "manifestType"    => "minecraftModpack",
        "manifestVersion" => 1,
        "name"            => modpack.name,
        "minecraft"       => {
          "version"    => modpack.minecraft_version,
          "modLoaders" => [
            {
              "id"      => "#{modpack.loader}-#{modpack.loader_version}",
              "primary" => true
            }
          ]
        },
        "files" => files
      }

      JSON.generate(document)
    end

    # Serialize to Modrinth modrinth.index.json format:
    #
    #   {
    #     "formatVersion": 1,
    #     "game": "minecraft",
    #     "name": "<name>",
    #     "versionId": "<name>-<minecraft_version>",
    #     "dependencies": {
    #       "minecraft": "<minecraft_version>",
    #       "<loader-key>": "<loader_version>"
    #     },
    #     "files": [
    #       {
    #         "path": "mods/<filename>",
    #         "hashes": { "sha256": "<sha256>" },
    #         "downloads": ["<download_url_or_placeholder>"],
    #         "fileSize": 0
    #       }
    #     ]
    #   }
    private_class_method def self.serialize_modrinth(modpack)
      loader_key = MODRINTH_LOADER_KEYS[modpack.loader]

      files = modpack.mods.map do |mod|
        filename     = mod.filename || "#{mod.project_id}.jar"
        sha256       = mod.sha256   || ""
        download_url = modrinth_download_url(mod)

        {
          "path"      => "mods/#{filename}",
          "hashes"    => { "sha256" => sha256 },
          "downloads" => [download_url],
          "fileSize"  => 0
        }
      end

      document = {
        "formatVersion" => 1,
        "game"          => "minecraft",
        "name"          => modpack.name,
        "versionId"     => "#{modpack.name}-#{modpack.minecraft_version}",
        "dependencies"  => {
          "minecraft" => modpack.minecraft_version,
          loader_key  => modpack.loader_version
        },
        "files" => files
      }

      JSON.generate(document)
    end

    # Build a Modrinth CDN download URL when the mod has proper project/version IDs,
    # or fall back to a placeholder that embeds the identifiers.
    #
    # Modrinth CDN pattern:
    #   https://cdn.modrinth.com/data/<project_id>/versions/<version_id>/<filename>
    private_class_method def self.modrinth_download_url(mod)
      filename = mod.filename || "#{mod.project_id}.jar"

      # If version_id looks like a URL (non-CDN fallback stored by the parser),
      # return it as-is so round-trips are stable.
      if mod.version_id.to_s.start_with?("http")
        mod.version_id
      else
        "https://cdn.modrinth.com/data/#{mod.project_id}/versions/#{mod.version_id}/#{filename}"
      end
    end
  end
end
