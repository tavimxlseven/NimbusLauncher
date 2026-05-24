# frozen_string_literal: true

module ManifestService
  # Immutable value object representing a single mod entry inside a modpack.
  #
  # Fields:
  #   source      — :curseforge | :modrinth
  #   project_id  — String identifier of the project on the source platform
  #   version_id  — String identifier of the specific file/version
  #   filename    — Original filename of the mod JAR (may be nil for CurseForge)
  #   sha256      — SHA-256 hex digest of the file (may be nil for CurseForge)
  ModEntry = Data.define(:source, :project_id, :version_id, :filename, :sha256)

  # Immutable value object representing a parsed modpack manifest.
  #
  # Fields:
  #   name              — Human-readable name of the modpack
  #   minecraft_version — Minecraft version string (e.g. "1.20.1")
  #   loader            — Mod loader symbol: :forge | :fabric | :quilt | :neoforge
  #   loader_version    — Version string of the mod loader (e.g. "0.15.11")
  #   mods              — Array<ModEntry>
  Modpack = Data.define(:name, :minecraft_version, :loader, :loader_version, :mods)

  VALID_LOADERS = %i[forge fabric quilt neoforge].freeze
end
