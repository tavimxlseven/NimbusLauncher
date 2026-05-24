# frozen_string_literal: true

require "net/http"
require "json"
require "zip" # rubyzip — already pulled in by Rails for ActiveStorage indirectly

# ModpackImporter — downloads an external modpack archive (CurseForge .zip or
# Modrinth .mrpack), parses its manifest, and imports the embedded mod list as
# ModpackMod rows for a LibraryItem.
#
# Usage:
#   importer = ModpackImporter.new(library_item)
#   result   = importer.import!  # => { mods_added:, mods_skipped:, errors: [] }
class ModpackImporter
  ImportError = Class.new(StandardError)

  # @param library_item [LibraryItem] must be item_type "modpack" with a
  #   non-custom external_id.
  def initialize(library_item)
    @item = library_item
  end

  # Download modpack archive, parse manifest, insert ModpackMod rows.
  # Idempotent: re-running on an already-imported modpack just adds any
  # missing mods.
  def import!
    return { mods_added: 0, mods_skipped: 0, errors: [] } if @item.external_id.to_s.start_with?("custom-")

    case @item.source
    when "modrinth"   then import_modrinth!
    when "curseforge" then import_curseforge!
    else
      raise ImportError, "Source desconhecido: #{@item.source}"
    end
  end

  private

  # ── Modrinth ────────────────────────────────────────────────────────────

  def import_modrinth!
    client = ExternalAPI::Client.new(source: :modrinth)
    versions = with_retry { client.send(:get, "/project/#{@item.external_id}/version") }
    raise ImportError, "Nenhuma versão encontrada para o modpack" if versions.empty?

    # Pick the newest version that matches the modpack's mc_version + loader (if known).
    version = pick_modrinth_version(versions) || versions.first

    primary_file = (version["files"] || []).find { |f| f["primary"] } || (version["files"] || []).first
    raise ImportError, "Versão sem arquivo principal" unless primary_file

    archive = download_to_tempfile(primary_file["url"])
    begin
      mods_added, errors = parse_modrinth_archive(archive.path)
      { mods_added: mods_added, mods_skipped: 0, errors: errors }
    ensure
      archive.close!
    end
  end

  def pick_modrinth_version(versions)
    versions.find do |v|
      mc_ok = @item.mc_version.blank? || (v["game_versions"] || []).include?(@item.mc_version)
      ld_ok = @item.loader.blank?     || (v["loaders"]       || []).map(&:to_s).map(&:downcase).include?(@item.loader.downcase)
      mc_ok && ld_ok
    end
  end

  # Parse a .mrpack archive: it's a zip containing modrinth.index.json.
  def parse_modrinth_archive(zip_path)
    mods_added = 0
    errors     = []

    Zip::File.open(zip_path) do |zip|
      index_entry = zip.find_entry("modrinth.index.json")
      raise ImportError, "modrinth.index.json não encontrado no .mrpack" unless index_entry

      manifest = JSON.parse(index_entry.get_input_stream.read)

      # Update modpack metadata when present
      if manifest["dependencies"].is_a?(Hash) && @item.mc_version.blank?
        @item.update_columns(mc_version: manifest.dig("dependencies", "minecraft")) if manifest.dig("dependencies", "minecraft").present?
      end

      # Build all rows in memory, then insert in a single transaction
      # (avoids N+1 INSERTs that blow past nginx's 60s read timeout for big modpacks).
      now = Time.current
      to_upsert = []
      (manifest["files"] || []).each do |entry|
        url = entry.dig("downloads", 0)
        next if url.blank?

        # Pattern: https://cdn.modrinth.com/data/<projectId>/versions/<versionId>/<filename>.jar
        m = url.match(%r{cdn\.modrinth\.com/data/([A-Za-z0-9]+)/versions/([A-Za-z0-9]+)})
        next unless m

        project_id = m[1]
        version_id = m[2]
        filename   = File.basename(entry["path"].to_s)
        name       = filename.sub(/\.jar$/, "")

        to_upsert << {
          library_item_id: @item.id,
          source:          "modrinth",
          external_id:     project_id,
          version:         version_id,
          name:            name,
          enabled:         true,
          added_at:        now,
          created_at:      now,
          updated_at:      now,
        }
      rescue => e
        errors << "Erro ao importar #{entry['path']}: #{e.message}"
      end

      if to_upsert.any?
        ModpackMod.upsert_all(
          to_upsert,
          unique_by: %i[library_item_id source external_id],
        )
        mods_added = to_upsert.size
      end
    end

    [mods_added, errors]
  end

  # ── CurseForge ──────────────────────────────────────────────────────────

  def import_curseforge!
    client = ExternalAPI::Client.new(source: :curseforge)
    files_resp = with_retry { client.send(:get, "/mods/#{@item.external_id}/files?pageSize=10&sortField=11&sortOrder=desc") }
    files = files_resp["data"] || []
    raise ImportError, "Nenhum arquivo encontrado para o modpack" if files.empty?

    file = pick_curseforge_file(files) || files.first

    download_url = file["downloadUrl"]
    if download_url.blank? && file["id"]
      fid = file["id"].to_s
      download_url = "https://edge.forgecdn.net/files/#{fid[0,4].to_i}/#{fid[4..].to_i}/#{file['fileName']}"
    end
    raise ImportError, "URL de download indisponível" if download_url.blank?

    archive = download_to_tempfile(download_url)
    begin
      mods_added, errors = parse_curseforge_archive(archive.path, client)
      { mods_added: mods_added, mods_skipped: 0, errors: errors }
    ensure
      archive.close!
    end
  end

  def pick_curseforge_file(files)
    files.find do |f|
      mc_ok = @item.mc_version.blank? || (f["gameVersions"] || []).include?(@item.mc_version)
      ld_ok = @item.loader.blank?     ||
              (f["gameVersions"] || []).any? { |g| g.to_s.downcase == @item.loader.downcase }
      mc_ok && ld_ok && f["releaseType"] == 1
    end
  end

  # Parse a CurseForge modpack zip: it's a zip containing manifest.json with a
  # `files: [{ projectID, fileID, required }]` array.
  def parse_curseforge_archive(zip_path, client)
    mods_added = 0
    errors     = []

    Zip::File.open(zip_path) do |zip|
      manifest_entry = zip.find_entry("manifest.json")
      raise ImportError, "manifest.json não encontrado no zip CurseForge" unless manifest_entry

      manifest = JSON.parse(manifest_entry.get_input_stream.read)
      mc_version = manifest.dig("minecraft", "version")

      # CurseForge modLoaders is an array; the active one is the entry with
      # `primary: true`. Some packs only have one entry without the flag, so
      # fall back to first.
      modloaders = manifest.dig("minecraft", "modLoaders") || []
      primary    = modloaders.find { |ml| ml["primary"] } || modloaders.first
      modloader  = primary&.dig("id")

      # The modpack manifest is the AUTHORITATIVE source of mc_version and
      # loader — we always overwrite whatever was guessed from CurseForge's
      # `gameVersions` (which sometimes contains the wrong loader, e.g.
      # marking ATM 10 as Fabric because some compat tags are present).
      @item.update_columns(mc_version: mc_version) if mc_version.present?
      if modloader.present?
        loader_name = modloader.to_s.split("-").first&.downcase
        if %w[forge fabric neoforge quilt].include?(loader_name)
          @item.update_columns(loader: loader_name)
        end
      end

      file_entries = (manifest["files"] || []).select do |entry|
        entry["projectID"].present? && entry["fileID"].present?
      end
      project_ids = file_entries.map { |e| e["projectID"] }.uniq

      # Bulk-fetch project names in one (chunked) request instead of N round-trips.
      # ATM 10 has ~800 mods — sequentially this took ~30s and timed out behind nginx.
      names_by_id = {}
      begin
        bulk = client.find_bulk(ids: project_ids)
        bulk.each { |p| names_by_id[p["id"].to_s] = p["name"] }
      rescue => e
        Rails.logger.warn "[ModpackImporter] bulk find failed: #{e.class.name}: #{e.message}, falling back to placeholders"
      end

      # Build all rows in memory, then insert in a single transaction.
      now = Time.current
      to_upsert = []
      file_entries.each do |entry|
        project_id = entry["projectID"].to_s
        file_id    = entry["fileID"].to_s
        name       = names_by_id[project_id] || "Mod #{project_id}"
        to_upsert << {
          library_item_id: @item.id,
          source:          "curseforge",
          external_id:     project_id,
          version:         file_id,
          name:            name,
          enabled:         true,
          added_at:        now,
          created_at:      now,
          updated_at:      now,
        }
      rescue => e
        errors << "Erro ao preparar projeto #{entry['projectID']}: #{e.message}"
      end

      if to_upsert.any?
        ModpackMod.upsert_all(
          to_upsert,
          unique_by: %i[library_item_id source external_id],
        )
        mods_added = to_upsert.size
      end
    end

    [mods_added, errors]
  end

  # ── Shared helpers ─────────────────────────────────────────────────────

  def upsert_mod!(source:, external_id:, version:, name:)
    existing = @item.modpack_mods.find_by(source: source, external_id: external_id)
    if existing
      existing.update!(version: version, name: name) if existing.version != version
      :updated
    else
      @item.modpack_mods.create!(
        source:      source,
        external_id: external_id,
        version:     version,
        name:        name,
        enabled:     true,
        added_at:    Time.current,
      )
      :added
    end
  end

  # Stream-download to a Tempfile, following redirects. Returns the open Tempfile.
  def download_to_tempfile(url, max_redirects: 5)
    uri = URI.parse(url)
    redirects = 0
    file = Tempfile.new(["modpack-archive-", ".zip"], binmode: true)

    while true
      raise ImportError, "Excesso de redirecionamentos" if redirects > max_redirects

      Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|
        http.read_timeout = 120
        request = Net::HTTP::Get.new(uri.request_uri)
        http.request(request) do |response|
          case response
          when Net::HTTPRedirection
            redirects += 1
            uri = URI.parse(response["Location"])
            next
          when Net::HTTPSuccess
            response.read_body { |chunk| file.write(chunk) }
            file.flush
            file.rewind
            return file
          else
            raise ImportError, "HTTP #{response.code} ao baixar modpack"
          end
        end
      end
    end
  rescue ImportError
    file&.close!
    raise
  rescue => e
    file&.close!
    raise ImportError, "Falha ao baixar modpack: #{e.message}"
  end

  def with_retry(max: 3)
    attempts = 0
    begin
      yield
    rescue => e
      attempts += 1
      raise if attempts >= max
      sleep(2 ** attempts)
      retry
    end
  end
end
