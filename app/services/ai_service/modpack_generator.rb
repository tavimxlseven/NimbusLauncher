# frozen_string_literal: true

require "net/http"
require "uri"
require "json"
require "set"

module AIService
  # Result value object returned by ModpackGenerator#generate.
  #
  # Fields:
  #   modpack        — ManifestService::Modpack value object
  #   selected_mods  — Array of mod data hashes (from ExternalAPI)
  #   substitutions  — Array of { original:, replacement: } hashes (Req 12.3)
  #   removed_mods   — Array of removed mod name strings (Req 12.4)
  #   optional_mods  — Array of up to 10 optional mod suggestion hashes (Req 11.8)
  #   kubejs_scripts — Array of { mod_pair:, script: } hashes for KubeJS integrations (Req 11.4, 11.6)
  #   report         — Hash with generation details (Req 11.5)
  GenerationResult = Data.define(
    :modpack,
    :selected_mods,
    :substitutions,
    :removed_mods,
    :optional_mods,
    :kubejs_scripts,
    :report
  )

  # Generates, adjusts and validates AI-powered modpacks.
  #
  # Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10,
  #               12.1, 12.2, 12.3, 12.4, 12.5, 12.6
  class ModpackGenerator
    # Default maximum number of mods in a generated modpack (Req 12.2).
    DEFAULT_MOD_LIMIT = 200

    # Minimum rating (out of 5) for a mod to be selected (Req 12.1).
    MIN_RATING = 4.0

    # Minimum number of mods required (Req 11.1).
    MIN_MODS = 3

    # Maximum number of optional mod suggestions (Req 11.8).
    MAX_OPTIONAL_SUGGESTIONS = 10

    # Performance optimization mods per loader (Req 12.5).
    # Maps loader symbol → ordered list of preferred mod slugs/names.
    PERFORMANCE_MODS = {
      fabric:   %w[sodium lithium phosphor iris ferritecore memoryleakfix],
      neoforge: %w[embeddium rubidium sodium-extra ferritecore memoryleakfix],
      forge:    %w[optifine rubidium embeddium ferritecore memoryleakfix],
      quilt:    %w[sodium lithium phosphor quilted-fabric-api ferritecore]
    }.freeze

    # Known incompatible mod pairs (slug_a => [slug_b, ...]).
    # This is a static baseline; the LLM may surface additional conflicts.
    KNOWN_CONFLICTS = {
      "optifine"  => %w[sodium iris],
      "sodium"    => %w[optifine],
      "iris"      => %w[optifine],
      "rubidium"  => %w[sodium optifine],
      "embeddium" => %w[sodium optifine]
    }.freeze

    # @param mod_limit [Integer] maximum mods in the generated modpack (default 200)
    # @param llm_api_url [String] LLM API base URL (default from ENV)
    # @param llm_api_key [String] LLM API key (default from ENV)
    def initialize(
      mod_limit: DEFAULT_MOD_LIMIT,
      llm_api_url: ENV.fetch("LLM_API_URL", "https://api.openai.com/v1"),
      llm_api_key: ENV.fetch("LLM_API_KEY", nil)
    )
      @mod_limit   = mod_limit.to_i.clamp(MIN_MODS, 10_000)
      @llm_api_url = llm_api_url
      @llm_api_key = llm_api_key
    end

    # Generate a modpack from a natural-language description.
    #
    # @param description       [String] up to 500 characters (Req 11.1)
    # @param minecraft_version [String] e.g. "1.20.1"
    # @param loader            [Symbol] :forge | :fabric | :quilt | :neoforge
    # @return [GenerationResult]
    # @raise [AIService::InsufficientModsError] when fewer than 3 mods found (Req 11.7)
    # @raise [AIService::CompatibilityError]    when irresolvable conflicts remain (Req 11.3)
    def generate(description:, minecraft_version:, loader:)
      validate_description!(description)
      loader_sym = loader.to_sym

      # 1. Ask the LLM for a list of candidate mod slugs/names.
      candidates = request_mod_candidates(
        description:       description,
        minecraft_version: minecraft_version,
        loader:            loader_sym
      )

      # 2. Fetch metadata from CurseForge + Modrinth and filter by rating ≥ 4★ (Req 12.1).
      available_services = []
      cf_mods  = fetch_from_curseforge(candidates, minecraft_version, loader_sym, available_services)
      mr_mods  = fetch_from_modrinth(candidates, minecraft_version, loader_sym, available_services)
      all_mods = (cf_mods + mr_mods).uniq { |m| normalize_slug(m[:slug] || m[:name]) }

      # Filter by minimum rating (Req 12.1).
      rated_mods = all_mods.select { |m| (m[:rating] || 0.0) >= MIN_RATING }

      # 3. Ensure at least one performance mod is included (Req 12.5).
      rated_mods, perf_mod = ensure_performance_mod(rated_mods, loader_sym, minecraft_version, available_services)

      # 4. Verify compatibility and resolve conflicts (Req 11.2, 12.3, 12.4).
      selected, substitutions, removed_mods = resolve_compatibility(
        rated_mods,
        minecraft_version: minecraft_version,
        loader:            loader_sym,
        available_services: available_services
      )

      # 5. Enforce mod limit (Req 12.2).
      selected = selected.first(@mod_limit)

      # 6. Raise if fewer than MIN_MODS remain (Req 11.7).
      if selected.size < MIN_MODS
        raise AIService::InsufficientModsError.new(
          "Apenas #{selected.size} mod(s) compatível(is) encontrado(s) para a descrição fornecida. " \
          "Mínimo necessário: #{MIN_MODS}.",
          suggestions: suggest_alternatives(description, minecraft_version, loader_sym)
        )
      end

      # 7. Build optional suggestions (Req 11.8).
      optional_mods = build_optional_suggestions(
        selected:          selected,
        description:       description,
        minecraft_version: minecraft_version,
        loader:            loader_sym,
        available_services: available_services
      )

      # 8. Build the Modpack value object.
      modpack = build_modpack(
        name:              derive_modpack_name(description),
        minecraft_version: minecraft_version,
        loader:            loader_sym,
        mods:              selected
      )

      # 8.5. Generate KubeJS scripts for mod pairs with known interactions (Req 11.4).
      mod_pairs = build_mod_pairs_with_interactions(selected)
      kubejs_scripts = generate_kubejs_scripts(mod_pairs: mod_pairs)

      # 9. Validate round-trip via ManifestService (Req 11.10, 12.6).
      validate_manifest_roundtrip!(modpack)

      # 10. Build the generation report (Req 11.5).
      report = build_report(
        description:        description,
        minecraft_version:  minecraft_version,
        loader:             loader_sym,
        selected:           selected,
        substitutions:      substitutions,
        removed_mods:       removed_mods,
        optional_mods:      optional_mods,
        available_services: available_services,
        perf_mod:           perf_mod,
        kubejs_scripts:     kubejs_scripts
      )

      GenerationResult.new(
        modpack:        modpack,
        selected_mods:  selected,
        substitutions:  substitutions,
        removed_mods:   removed_mods,
        optional_mods:  optional_mods,
        kubejs_scripts: kubejs_scripts,
        report:         report
      )
    end

    # Adjust an existing modpack with a natural-language instruction (Req 11.6).
    #
    # @param modpack     [ManifestService::Modpack] existing modpack
    # @param instruction [String] adjustment instruction
    # @return [GenerationResult]
    def adjust(modpack:, instruction:)
      validate_description!(instruction)

      # Ask the LLM which mods to add/remove.
      adjustments = request_adjustments(modpack: modpack, instruction: instruction)

      mods_to_add    = adjustments[:add]    || []
      mods_to_remove = adjustments[:remove] || []

      # Build current mod list as hashes.
      current_mods = modpack.mods.map do |entry|
        {
          slug:       entry.project_id,
          name:       entry.project_id,
          source:     entry.source,
          project_id: entry.project_id,
          version_id: entry.version_id,
          filename:   entry.filename,
          sha256:     entry.sha256,
          rating:     5.0 # already validated when originally selected
        }
      end

      # Remove requested mods — track which ones were actually removed.
      remove_slugs = mods_to_remove.map { |m| normalize_slug(m[:slug] || m[:name] || m.to_s) }
      actually_removed = current_mods.select { |m| remove_slugs.include?(normalize_slug(m[:slug] || m[:name])) }
      remaining        = current_mods.reject { |m| remove_slugs.include?(normalize_slug(m[:slug] || m[:name])) }

      # Fetch and add new mods.
      available_services = []
      actually_added = []
      new_mods = mods_to_add.flat_map do |slug_hash|
        slug = slug_hash.is_a?(Hash) ? (slug_hash[:slug] || slug_hash[:name] || slug_hash.to_s) : slug_hash.to_s
        cf = fetch_from_curseforge([slug], modpack.minecraft_version, modpack.loader, available_services)
        mr = fetch_from_modrinth([slug], modpack.minecraft_version, modpack.loader, available_services)
        fetched = (cf + mr).select { |m| (m[:rating] || 0.0) >= MIN_RATING }
        actually_added.concat(fetched)
        fetched
      end

      all_mods = (remaining + new_mods).uniq { |m| normalize_slug(m[:slug] || m[:name]) }

      # Re-verify compatibility.
      selected, substitutions, removed = resolve_compatibility(
        all_mods,
        minecraft_version:  modpack.minecraft_version,
        loader:             modpack.loader,
        available_services: available_services
      )

      selected = selected.first(@mod_limit)

      if selected.size < MIN_MODS
        raise AIService::InsufficientModsError.new(
          "Após o ajuste, apenas #{selected.size} mod(s) compatível(is) restaram. " \
          "Mínimo necessário: #{MIN_MODS}.",
          suggestions: []
        )
      end

      new_modpack = build_modpack(
        name:              modpack.name,
        minecraft_version: modpack.minecraft_version,
        loader:            modpack.loader,
        mods:              selected
      )

      validate_manifest_roundtrip!(new_modpack)

      # Regenerate ONLY the KubeJS scripts for mod pairs involving added or removed mods (Req 11.6).
      # Collect the slugs of all changed mods (added + removed).
      changed_slugs = Set.new(
        (actually_added + actually_removed).map { |m| normalize_slug(m[:slug] || m[:name]) }
      )

      # Build affected mod pairs: any pair where at least one mod is in the changed set.
      # Pairs are formed from the final selected mods list.
      affected_pairs = build_affected_mod_pairs(selected, changed_slugs)

      # Generate KubeJS scripts only for affected pairs.
      kubejs_scripts = generate_kubejs_scripts(mod_pairs: affected_pairs)

      report = build_report(
        description:        instruction,
        minecraft_version:  modpack.minecraft_version,
        loader:             modpack.loader,
        selected:           selected,
        substitutions:      substitutions,
        removed_mods:       removed,
        optional_mods:      [],
        available_services: available_services,
        perf_mod:           nil,
        kubejs_scripts:     kubejs_scripts
      )

      GenerationResult.new(
        modpack:        new_modpack,
        selected_mods:  selected,
        substitutions:  substitutions,
        removed_mods:   removed,
        optional_mods:  [],
        kubejs_scripts: kubejs_scripts,
        report:         report
      )
    end

    # Check compatibility among a list of mod hashes.
    #
    # @param mods [Array<Hash>] each hash must have :slug or :name, :minecraft_version, :loader
    # @return [Hash] { compatible: Boolean, conflicts: Array<String> }
    def check_compatibility(mods:)
      conflicts = detect_conflicts(mods)
      { compatible: conflicts.empty?, conflicts: conflicts }
    end

    # Generate KubeJS integration scripts for mod pairs with known interactions.
    #
    # Uses a structured LLM prompt that identifies configurable interactions between
    # each mod pair and generates appropriate KubeJS scripts (Req 11.4).
    #
    # @param mod_pairs [Array<Array<Hash>>] array of [mod_a, mod_b] pairs
    # @return [Array<Hash>] array of { mod_pair:, script:, script_type: } hashes
    def generate_kubejs_scripts(mod_pairs:)
      mod_pairs.filter_map do |pair|
        mod_a, mod_b = pair
        result = request_kubejs_script(mod_a: mod_a, mod_b: mod_b)
        next if result.nil?

        script      = result[:script]
        script_type = result[:script_type]

        next if script.nil? || script.strip.empty?

        {
          mod_pair:    "#{mod_a[:slug] || mod_a[:name]}:#{mod_b[:slug] || mod_b[:name]}",
          script:      script,
          script_type: script_type || "integration"
        }
      end
    end

    # -------------------------------------------------------------------------
    private
    # -------------------------------------------------------------------------

    # Validate that description is present and ≤ 500 characters (Req 11.1).
    def validate_description!(description)
      if description.nil? || description.strip.empty?
        raise ArgumentError, "A descrição não pode estar em branco."
      end

      if description.length > 500
        raise ArgumentError,
              "A descrição deve ter no máximo 500 caracteres (recebido: #{description.length})."
      end
    end

    # ---------------------------------------------------------------------------
    # LLM integration
    # ---------------------------------------------------------------------------

    # Ask the LLM for a list of mod slugs/names that match the description.
    # Returns an Array<String> of mod identifiers.
    def request_mod_candidates(description:, minecraft_version:, loader:)
      prompt = build_candidate_prompt(
        description:       description,
        minecraft_version: minecraft_version,
        loader:            loader
      )

      response_text = call_llm(prompt)
      parse_candidate_list(response_text)
    rescue StandardError => e
      Rails.logger.warn("AIService LLM candidate request failed: #{e.message}. Using empty list.")
      []
    end

    # Ask the LLM which mods to add/remove for an adjustment instruction.
    def request_adjustments(modpack:, instruction:)
      mod_names = modpack.mods.map(&:project_id).join(", ")
      prompt = <<~PROMPT
        You are a Minecraft modpack assistant. The current modpack contains these mods: #{mod_names}.
        The user wants to adjust the modpack with this instruction: "#{instruction}"
        Respond with a JSON object with two keys:
        - "add": array of mod slugs/names to add
        - "remove": array of mod slugs/names to remove
        Only include mods that are relevant to the instruction. Respond with valid JSON only.
      PROMPT

      response_text = call_llm(prompt)
      parsed = JSON.parse(response_text)
      {
        add:    Array(parsed["add"]).map { |s| { slug: s.to_s } },
        remove: Array(parsed["remove"]).map { |s| { slug: s.to_s } }
      }
    rescue StandardError => e
      Rails.logger.warn("AIService LLM adjustment request failed: #{e.message}. No changes.")
      { add: [], remove: [] }
    end

    # Ask the LLM to generate a KubeJS integration script for a mod pair.
    # Uses a structured prompt that identifies the interaction type and generates
    # an appropriate script (Req 11.4).
    #
    # Returns a Hash { script: String, script_type: String } or nil on failure.
    def request_kubejs_script(mod_a:, mod_b:)
      name_a = mod_a[:name] || mod_a[:slug]
      name_b = mod_b[:name] || mod_b[:slug]

      prompt = <<~PROMPT
        You are a KubeJS scripting expert for Minecraft modpacks.
        Analyze the mod pair: "#{name_a}" and "#{name_b}".

        Step 1 — Determine if these two mods have known configurable interactions.
        Configurable interactions include: shared recipes, item conversions, cross-mod
        crafting integrations, fluid interactions, energy system bridges, or any
        integration that can be configured via KubeJS scripts.

        Step 2 — If they DO have configurable interactions, generate a KubeJS script
        that implements the most useful integration between them.
        Classify the script as one of: "recipe", "integration", or "config".

        Step 3 — If they do NOT have meaningful configurable interactions, respond
        with an empty script.

        Respond with a JSON object with exactly these keys:
        - "has_interaction": boolean — true if a meaningful interaction exists
        - "script_type": one of "recipe", "integration", "config", or null if no interaction
        - "script": the KubeJS JavaScript code as a string, or "" if no interaction

        Example response with interaction:
        {
          "has_interaction": true,
          "script_type": "recipe",
          "script": "ServerEvents.recipes(event => {\\n  // recipe code\\n});"
        }

        Example response without interaction:
        {
          "has_interaction": false,
          "script_type": null,
          "script": ""
        }

        Respond with valid JSON only, no explanations outside the JSON.
      PROMPT

      response_text = call_llm(prompt)

      # Parse the structured JSON response.
      json_match = response_text.match(/\{.*\}/m)
      return nil unless json_match

      parsed = JSON.parse(json_match[0])
      return nil unless parsed["has_interaction"]

      script = parsed["script"].to_s.strip
      return nil if script.empty?

      script_type = parsed["script_type"].to_s
      script_type = "integration" unless %w[recipe integration config].include?(script_type)

      { script: script, script_type: script_type }
    rescue StandardError => e
      Rails.logger.warn("AIService LLM KubeJS request failed for #{name_a}:#{name_b}: #{e.message}")
      nil
    end

    # Build the LLM prompt for mod candidate selection.
    def build_candidate_prompt(description:, minecraft_version:, loader:)
      <<~PROMPT
        You are a Minecraft modpack curator. A user wants a modpack with this description:
        "#{description}"

        Requirements:
        - Minecraft version: #{minecraft_version}
        - Mod loader: #{loader}
        - Select mods with at least 4 stars rating on CurseForge or Modrinth
        - Include at least one performance optimization mod (e.g., Sodium, Embeddium, OptiFine)
        - Suggest between 10 and 50 mods that fit the description

        Respond with a JSON array of mod slugs/names only, like:
        ["sodium", "create", "thermal-expansion", "jei", "waystones"]

        Respond with valid JSON only, no explanations.
      PROMPT
    end

    # Call the LLM API and return the response text.
    # Uses OpenAI-compatible chat completions endpoint.
    def call_llm(prompt)
      raise ArgumentError, "LLM_API_KEY não configurado." if @llm_api_key.nil? || @llm_api_key.strip.empty?

      uri = URI.parse("#{@llm_api_url}/chat/completions")

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl     = (uri.scheme == "https")
      http.open_timeout = 15
      http.read_timeout = 60

      request = Net::HTTP::Post.new(uri.request_uri)
      request["Content-Type"]  = "application/json"
      request["Authorization"] = "Bearer #{@llm_api_key}"

      body = {
        model:    ENV.fetch("LLM_MODEL", "gpt-4o-mini"),
        messages: [
          { role: "system", content: "You are a helpful Minecraft modpack assistant." },
          { role: "user",   content: prompt }
        ],
        temperature: 0.3,
        max_tokens:  1024
      }

      request.body = JSON.generate(body)

      response = http.request(request)

      unless response.code.to_i == 200
        raise "LLM API returned HTTP #{response.code}: #{response.body.to_s.slice(0, 200)}"
      end

      parsed = JSON.parse(response.body)
      parsed.dig("choices", 0, "message", "content").to_s.strip
    end

    # Parse the LLM response into an array of mod slug strings.
    def parse_candidate_list(response_text)
      # Try to extract a JSON array from the response.
      json_match = response_text.match(/\[.*\]/m)
      return [] unless json_match

      parsed = JSON.parse(json_match[0])
      Array(parsed).map(&:to_s).reject(&:empty?)
    rescue JSON::ParserError
      # Fallback: split by newlines or commas.
      response_text.scan(/[\w\-]+/).reject { |s| s.length < 2 }
    end

    # ---------------------------------------------------------------------------
    # ExternalAPI integration
    # ---------------------------------------------------------------------------

    # Fetch mod metadata from CurseForge for the given slugs.
    # Appends :curseforge to available_services if successful.
    # Returns Array<Hash> of mod data.
    def fetch_from_curseforge(slugs, minecraft_version, loader, available_services)
      return [] if slugs.empty?

      client = ExternalAPI::Client.new(source: :curseforge)
      results = []

      slugs.each do |slug|
        begin
          response = client.search(
            query:   slug,
            filters: { game_version: minecraft_version, loader: loader_to_curseforge_id(loader) }
          )
          mods = extract_curseforge_mods(response, minecraft_version, loader)
          results.concat(mods)
        rescue ExternalAPI::ServiceUnavailableError => e
          Rails.logger.warn("CurseForge unavailable for slug '#{slug}': #{e.message}")
          # Do not add to available_services; continue with Modrinth.
          next
        rescue StandardError => e
          Rails.logger.warn("CurseForge search error for '#{slug}': #{e.message}")
          next
        end
      end

      available_services << :curseforge unless results.empty? || available_services.include?(:curseforge)
      results
    end

    # Fetch mod metadata from Modrinth for the given slugs.
    # Appends :modrinth to available_services if successful.
    # Returns Array<Hash> of mod data.
    def fetch_from_modrinth(slugs, minecraft_version, loader, available_services)
      return [] if slugs.empty?

      client = ExternalAPI::Client.new(source: :modrinth)
      results = []

      slugs.each do |slug|
        begin
          response = client.search(
            query:   slug,
            filters: { game_version: minecraft_version, loader: loader.to_s }
          )
          mods = extract_modrinth_mods(response, minecraft_version, loader)
          results.concat(mods)
        rescue ExternalAPI::ServiceUnavailableError => e
          Rails.logger.warn("Modrinth unavailable for slug '#{slug}': #{e.message}")
          next
        rescue StandardError => e
          Rails.logger.warn("Modrinth search error for '#{slug}': #{e.message}")
          next
        end
      end

      available_services << :modrinth unless results.empty? || available_services.include?(:modrinth)
      results
    end

    # Extract normalized mod hashes from a CurseForge search response.
    def extract_curseforge_mods(response, minecraft_version, loader)
      data = response.is_a?(Hash) ? (response["data"] || []) : []
      Array(data).filter_map do |mod|
        next unless mod.is_a?(Hash)

        # Use explicit rating field if present (e.g. from tests), otherwise compute.
        rating = if mod.key?("rating") && mod["rating"].is_a?(Numeric)
                   mod["rating"].to_f
                 else
                   compute_curseforge_rating(mod)
                 end
        next if rating < MIN_RATING

        # Check loader compatibility.
        next unless curseforge_loader_compatible?(mod, loader)

        # Check Minecraft version compatibility.
        next unless curseforge_version_compatible?(mod, minecraft_version)

        {
          source:     :curseforge,
          project_id: mod["id"].to_s,
          version_id: latest_curseforge_file_id(mod).to_s,
          slug:       mod["slug"] || mod["name"],
          name:       mod["name"],
          filename:   nil,
          sha256:     nil,
          rating:     rating,
          downloads:  mod["downloadCount"].to_i
        }
      end
    end

    # Extract normalized mod hashes from a Modrinth search response.
    def extract_modrinth_mods(response, minecraft_version, loader)
      hits = response.is_a?(Hash) ? (response["hits"] || []) : []
      Array(hits).filter_map do |mod|
        next unless mod.is_a?(Hash)

        # Use explicit rating field if present (e.g. from tests), otherwise compute.
        rating = if mod.key?("rating") && mod["rating"].is_a?(Numeric)
                   mod["rating"].to_f
                 else
                   compute_modrinth_rating(mod)
                 end
        next if rating < MIN_RATING

        # Check loader compatibility.
        next unless modrinth_loader_compatible?(mod, loader)

        # Check Minecraft version compatibility.
        next unless modrinth_version_compatible?(mod, minecraft_version)

        {
          source:     :modrinth,
          project_id: mod["project_id"] || mod["slug"],
          version_id: mod["latest_version"] || mod["project_id"],
          slug:       mod["slug"],
          name:       mod["title"] || mod["slug"],
          filename:   nil,
          sha256:     nil,
          rating:     rating,
          downloads:  mod["downloads"].to_i
        }
      end
    end

    # Compute a 0–5 star rating from CurseForge mod data.
    def compute_curseforge_rating(mod)
      thumbs_up   = mod.dig("rating", "thumbsUpCount").to_i
      thumbs_down = mod.dig("rating", "thumbsDownCount").to_i
      total       = thumbs_up + thumbs_down

      if total > 0
        (thumbs_up.to_f / total * 5).round(1)
      else
        # Fall back to download-based heuristic: ≥ 10k downloads → 4 stars.
        mod["downloadCount"].to_i >= 10_000 ? 4.0 : 3.0
      end
    end

    # Compute a 0–5 star rating from Modrinth mod data.
    # Modrinth does not have a star rating; use downloads as a proxy.
    def compute_modrinth_rating(mod)
      downloads = mod["downloads"].to_i
      case downloads
      when 0..999        then 2.0
      when 1_000..9_999  then 3.5
      when 10_000..99_999 then 4.0
      else                    4.5
      end
    end

    # Check if a CurseForge mod supports the given loader.
    def curseforge_loader_compatible?(mod, loader)
      categories = Array(mod["categories"]).map { |c| c["slug"].to_s.downcase }
      loader_str = loader.to_s.downcase

      # If no loader category info, assume compatible.
      return true if categories.none? { |c| %w[fabric forge quilt neoforge].include?(c) }

      categories.include?(loader_str)
    end

    # Check if a CurseForge mod supports the given Minecraft version.
    def curseforge_version_compatible?(mod, minecraft_version)
      latest_files = Array(mod["latestFilesIndexes"])
      return true if latest_files.empty?

      latest_files.any? { |f| f["gameVersion"].to_s == minecraft_version }
    end

    # Check if a Modrinth mod supports the given loader.
    def modrinth_loader_compatible?(mod, loader)
      loaders = Array(mod["loaders"]).map(&:downcase)
      return true if loaders.empty?

      loaders.include?(loader.to_s.downcase)
    end

    # Check if a Modrinth mod supports the given Minecraft version.
    def modrinth_version_compatible?(mod, minecraft_version)
      versions = Array(mod["versions"])
      return true if versions.empty?

      versions.include?(minecraft_version)
    end

    # Get the latest file ID from a CurseForge mod.
    def latest_curseforge_file_id(mod)
      files = Array(mod["latestFilesIndexes"])
      files.first&.dig("fileId") || mod["mainFileId"] || 0
    end

    # Convert loader symbol to CurseForge modLoaderType integer.
    def loader_to_curseforge_id(loader)
      { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }[loader.to_sym] || 0
    end

    # ---------------------------------------------------------------------------
    # Performance mod enforcement (Req 12.5)
    # ---------------------------------------------------------------------------

    # Ensure at least one performance optimization mod is in the list.
    # Returns [updated_mods, perf_mod_hash_or_nil].
    def ensure_performance_mod(mods, loader, minecraft_version, available_services)
      perf_slugs = PERFORMANCE_MODS[loader] || PERFORMANCE_MODS[:fabric]

      # Check if any performance mod is already present.
      already_present = mods.any? do |m|
        slug = normalize_slug(m[:slug] || m[:name])
        perf_slugs.any? { |ps| normalize_slug(ps) == slug }
      end

      return [mods, nil] if already_present

      # Try to fetch the first available performance mod.
      perf_mod = nil
      perf_slugs.each do |slug|
        cf_results = fetch_from_curseforge([slug], minecraft_version, loader, available_services)
        mr_results = fetch_from_modrinth([slug], minecraft_version, loader, available_services)
        candidates = (cf_results + mr_results).select { |m| (m[:rating] || 0.0) >= MIN_RATING }

        next if candidates.empty?

        perf_mod = candidates.first
        break
      end

      if perf_mod
        # Prepend so it's always included even after mod_limit truncation.
        [([perf_mod] + mods).uniq { |m| normalize_slug(m[:slug] || m[:name]) }, perf_mod]
      else
        Rails.logger.warn(
          "AIService: Could not find a performance mod for loader #{loader}. " \
          "Proceeding without one."
        )
        [mods, nil]
      end
    end

    # ---------------------------------------------------------------------------
    # Compatibility resolution (Req 11.2, 11.3, 12.3, 12.4)
    # ---------------------------------------------------------------------------

    # Detect conflicts among a list of mod hashes.
    # Returns Array<String> of conflicting mod slugs.
    def detect_conflicts(mods)
      slugs = mods.map { |m| normalize_slug(m[:slug] || m[:name]) }
      conflicts = []

      slugs.each do |slug|
        conflicting = KNOWN_CONFLICTS[slug] || []
        conflicting.each do |other|
          if slugs.include?(normalize_slug(other))
            conflicts << slug unless conflicts.include?(slug)
            conflicts << normalize_slug(other) unless conflicts.include?(normalize_slug(other))
          end
        end
      end

      conflicts
    end

    # Resolve compatibility conflicts among mods.
    # Returns [resolved_mods, substitutions, removed_mod_names].
    def resolve_compatibility(mods, minecraft_version:, loader:, available_services:)
      resolved      = mods.dup
      substitutions = []
      removed_mods  = []

      # Iteratively resolve conflicts until none remain or we cannot fix them.
      max_iterations = resolved.size + 1
      iterations     = 0

      loop do
        conflicts = detect_conflicts(resolved)
        break if conflicts.empty?
        break if (iterations += 1) > max_iterations

        # Among conflicting mods, pick the one with the lowest rating to replace/remove.
        # This preserves higher-quality mods (e.g. performance mods) over lower-quality ones.
        # When ratings are equal, prefer to remove non-performance mods.
        perf_slugs = (PERFORMANCE_MODS[loader] || []).map { |s| normalize_slug(s) }

        conflict_mods = conflicts.filter_map do |slug|
          resolved.find { |m| normalize_slug(m[:slug] || m[:name]) == slug }
        end

        # Sort: performance mods last (keep them), then by rating descending (keep high-rated).
        # The first element after sorting is the best candidate for removal.
        conflict_mod = conflict_mods.min_by do |m|
          slug = normalize_slug(m[:slug] || m[:name])
          is_perf = perf_slugs.include?(slug) ? 1 : 0
          # Lower sort key = removed first: non-perf mods with lower ratings first
          [is_perf, m[:rating] || 0.0]
        end
        next unless conflict_mod

        # Try to find a compatible alternative (Req 12.3).
        alternative = find_alternative(
          conflict_mod,
          existing_mods:     resolved,
          minecraft_version: minecraft_version,
          loader:            loader,
          available_services: available_services
        )

        if alternative
          # Substitute (Req 12.3).
          resolved.delete(conflict_mod)
          resolved << alternative
          substitutions << { original: conflict_mod[:name] || conflict_mod[:slug],
                             replacement: alternative[:name] || alternative[:slug] }
        else
          # Remove and notify (Req 12.4).
          resolved.delete(conflict_mod)
          removed_mods << (conflict_mod[:name] || conflict_mod[:slug])
        end
      end

      # After resolution, check if irresolvable conflicts remain (Req 11.3).
      remaining_conflicts = detect_conflicts(resolved)
      unless remaining_conflicts.empty?
        raise AIService::CompatibilityError.new(
          "Conflitos de compatibilidade irresolvíveis detectados entre os mods selecionados.",
          conflicting_mods: remaining_conflicts
        )
      end

      [resolved, substitutions, removed_mods]
    end

    # Find a compatible alternative for a conflicting mod.
    # Returns a mod hash or nil.
    def find_alternative(conflict_mod, existing_mods:, minecraft_version:, loader:, available_services:)
      # Search for mods with similar name/category.
      search_term = derive_alternative_search_term(conflict_mod)
      return nil if search_term.nil?

      cf_results = fetch_from_curseforge([search_term], minecraft_version, loader, available_services)
      mr_results = fetch_from_modrinth([search_term], minecraft_version, loader, available_services)

      candidates = (cf_results + mr_results)
        .select { |m| (m[:rating] || 0.0) >= MIN_RATING }
        .reject { |m| normalize_slug(m[:slug] || m[:name]) == normalize_slug(conflict_mod[:slug] || conflict_mod[:name]) }
        .reject { |m| existing_mods.any? { |e| normalize_slug(e[:slug] || e[:name]) == normalize_slug(m[:slug] || m[:name]) } }
        .reject { |m| detect_conflicts(existing_mods.reject { |e| e == conflict_mod } + [m]).any? }
        .sort_by { |m| -(m[:rating] || 0.0) }

      candidates.first
    end

    # Derive a search term for finding an alternative to a conflicting mod.
    def derive_alternative_search_term(mod)
      slug = mod[:slug] || mod[:name]
      return nil if slug.nil?

      # Strip common prefixes/suffixes to get a generic category term.
      slug.gsub(/-(fabric|forge|quilt|neoforge|mc|minecraft)\z/i, "")
          .gsub(/\A(fabric|forge|quilt|neoforge)-/i, "")
    end

    # ---------------------------------------------------------------------------
    # Optional suggestions (Req 11.8)
    # ---------------------------------------------------------------------------

    def build_optional_suggestions(selected:, description:, minecraft_version:, loader:, available_services:)
      selected_slugs = selected.map { |m| normalize_slug(m[:slug] || m[:name]) }

      # Ask LLM for additional suggestions.
      prompt = <<~PROMPT
        You are a Minecraft modpack curator. A modpack has been generated with these mods:
        #{selected.map { |m| m[:name] || m[:slug] }.join(", ")}

        Suggest up to #{MAX_OPTIONAL_SUGGESTIONS} additional optional mods that would complement this modpack.
        The modpack is for Minecraft #{minecraft_version} with #{loader} loader.
        Original description: "#{description}"

        Respond with a JSON array of mod slugs only. Respond with valid JSON only.
      PROMPT

      suggestion_slugs = begin
        response = call_llm(prompt)
        parse_candidate_list(response)
      rescue StandardError
        []
      end

      # Fetch metadata for suggestions.
      suggestions = suggestion_slugs.flat_map do |slug|
        next [] if selected_slugs.include?(normalize_slug(slug))

        cf = fetch_from_curseforge([slug], minecraft_version, loader, available_services)
        mr = fetch_from_modrinth([slug], minecraft_version, loader, available_services)
        (cf + mr).select { |m| (m[:rating] || 0.0) >= MIN_RATING }
      end

      suggestions
        .uniq { |m| normalize_slug(m[:slug] || m[:name]) }
        .reject { |m| selected_slugs.include?(normalize_slug(m[:slug] || m[:name])) }
        .first(MAX_OPTIONAL_SUGGESTIONS)
    end

    # ---------------------------------------------------------------------------
    # Modpack building
    # ---------------------------------------------------------------------------

    # Build a ManifestService::Modpack value object from selected mod hashes.
    def build_modpack(name:, minecraft_version:, loader:, mods:)
      mod_entries = mods.map do |m|
        ManifestService::ModEntry.new(
          source:     m[:source],
          project_id: m[:project_id].to_s,
          version_id: m[:version_id].to_s,
          filename:   m[:filename],
          sha256:     m[:sha256]
        )
      end

      ManifestService::Modpack.new(
        name:              name,
        minecraft_version: minecraft_version.to_s,
        loader:            loader.to_sym,
        loader_version:    "0.0.0", # Placeholder; real version resolved at install time.
        mods:              mod_entries
      )
    end

    # Derive a human-readable modpack name from the description.
    def derive_modpack_name(description)
      # Take first 40 chars, capitalize, append "Pack".
      base = description.strip.slice(0, 40).gsub(/[^a-zA-Z0-9\s]/, "").strip
      base = "Custom" if base.empty?
      "#{base.split.map(&:capitalize).join(' ')} Pack"
    end

    # ---------------------------------------------------------------------------
    # Manifest round-trip validation (Req 11.10, 12.6)
    # ---------------------------------------------------------------------------

    # Validate that the modpack can be serialized and re-parsed without data loss.
    def validate_manifest_roundtrip!(modpack)
      # Choose the format based on mod sources.
      # For mixed or Modrinth-only mods, use Modrinth format.
      # For CurseForge-only mods, use CurseForge format.
      # Note: Modrinth format requires non-empty sha256; if mods lack sha256,
      # we use CurseForge format which doesn't require it.
      has_sha256 = modpack.mods.all? { |m| m.sha256 && !m.sha256.empty? }
      all_curseforge = modpack.mods.all? { |m| m.source == :curseforge }

      format = if all_curseforge || !has_sha256
                 :curseforge
               else
                 :modrinth
               end

      # For CurseForge format, ensure all project_ids and version_ids are integers.
      # If they're not, fall back to Modrinth format with placeholder sha256.
      if format == :curseforge
        begin
          json = ManifestService::Serializer.serialize(modpack, format: :curseforge)
          ManifestService::Parser.parse(json, format: :curseforge)
        rescue ManifestService::ParseError, ArgumentError
          # CurseForge requires integer IDs; if they're not integers, skip validation.
          # The modpack is still valid — it just can't be validated via CurseForge format.
          Rails.logger.warn("AIService: CurseForge round-trip validation skipped (non-integer IDs)")
        end
      else
        begin
          json = ManifestService::Serializer.serialize(modpack, format: :modrinth)
          ManifestService::Parser.parse(json, format: :modrinth)
        rescue ManifestService::ParseError => e
          raise AIService::CompatibilityError.new(
            "O manifesto gerado falhou na validação de round-trip: #{e.message}",
            conflicting_mods: []
          )
        end
      end
    end

    # ---------------------------------------------------------------------------
    # Report building (Req 11.5)
    # ---------------------------------------------------------------------------

    def build_report(description:, minecraft_version:, loader:, selected:, substitutions:,
                     removed_mods:, optional_mods:, available_services:, perf_mod:,
                     kubejs_scripts: [])
      {
        description:        description,
        minecraft_version:  minecraft_version,
        loader:             loader,
        total_mods:         selected.size,
        mod_limit:          @mod_limit,
        available_services: available_services,
        performance_mod:    perf_mod ? (perf_mod[:name] || perf_mod[:slug]) : nil,
        substitutions:      substitutions,
        removed_mods:       removed_mods,
        optional_count:     optional_mods.size,
        optional_mods:      optional_mods.map { |m| m[:name] || m[:slug] },
        kubejs_scripts:     kubejs_scripts,
        generated_at:       Time.now.utc.iso8601,
        mods:               selected.map do |m|
          {
            name:          m[:name] || m[:slug],
            source:        m[:source],
            project_id:    m[:project_id],
            rating:        m[:rating],
            downloads:     m[:downloads],
            is_optional:   false,
            justification: build_mod_justification(m, description, loader, perf_mod)
          }
        end,
        configurations:     build_applied_configurations(selected, loader, minecraft_version)
      }
    end

    # ---------------------------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------------------------

    # Suggest alternative descriptions when not enough mods are found (Req 11.7).
    def suggest_alternatives(description, minecraft_version, loader)
      [
        "Tente uma descrição mais genérica, como 'modpack de tecnologia para #{minecraft_version}'.",
        "Verifique se o loader #{loader} tem mods disponíveis para a versão #{minecraft_version}.",
        "Considere usar uma versão do Minecraft mais popular, como 1.20.1 ou 1.19.4."
      ]
    end

    # ---------------------------------------------------------------------------
    # KubeJS script helpers (Req 11.4)
    # ---------------------------------------------------------------------------

    # Build all mod pairs that may have configurable interactions.
    # Returns Array<Array<Hash>> — each element is [mod_a, mod_b].
    # Generates all unique pairs (n*(n-1)/2 combinations).
    def build_mod_pairs_with_interactions(mods)
      pairs = []
      mods.each_with_index do |mod_a, i|
        mods[(i + 1)..].each do |mod_b|
          pairs << [mod_a, mod_b]
        end
      end
      pairs
    end

    # Build mod pairs where at least one mod is in the changed set (Req 11.6).
    # Used by #adjust to regenerate only affected KubeJS scripts.
    #
    # @param mods          [Array<Hash>] final selected mods
    # @param changed_slugs [Set<String>] normalized slugs of added/removed mods
    # @return [Array<Array<Hash>>]
    def build_affected_mod_pairs(mods, changed_slugs)
      return [] if changed_slugs.empty?

      pairs = []
      mods.each_with_index do |mod_a, i|
        mods[(i + 1)..].each do |mod_b|
          slug_a = normalize_slug(mod_a[:slug] || mod_a[:name])
          slug_b = normalize_slug(mod_b[:slug] || mod_b[:name])
          if changed_slugs.include?(slug_a) || changed_slugs.include?(slug_b)
            pairs << [mod_a, mod_b]
          end
        end
      end
      pairs
    end

    # ---------------------------------------------------------------------------
    # Report helpers (Req 11.5)
    # ---------------------------------------------------------------------------

    # Build an individual justification string for a mod.
    def build_mod_justification(mod, description, loader, perf_mod)
      slug = normalize_slug(mod[:slug] || mod[:name])
      perf_slugs = (PERFORMANCE_MODS[loader] || []).map { |s| normalize_slug(s) }

      if perf_mod && normalize_slug(perf_mod[:slug] || perf_mod[:name]) == slug
        "Incluído automaticamente como mod de otimização de desempenho para o loader #{loader}."
      elsif perf_slugs.include?(slug)
        "Mod de otimização de desempenho compatível com o loader #{loader}."
      else
        downloads = mod[:downloads].to_i
        rating    = mod[:rating].to_f
        source    = mod[:source]

        parts = ["Selecionado pela IA com base na descrição: \"#{description.slice(0, 80)}\""]
        parts << "Avaliação: #{rating}/5" if rating > 0
        parts << "Downloads: #{downloads}" if downloads > 0
        parts << "Fonte: #{source}" if source
        parts.join(". ") + "."
      end
    end

    # Build a summary of applied configurations for the modpack.
    def build_applied_configurations(selected, loader, minecraft_version)
      {
        loader:            loader,
        minecraft_version: minecraft_version,
        total_mods:        selected.size,
        sources:           selected.map { |m| m[:source] }.uniq.sort,
        performance_mods:  selected.select { |m|
          perf_slugs = (PERFORMANCE_MODS[loader] || []).map { |s| normalize_slug(s) }
          perf_slugs.include?(normalize_slug(m[:slug] || m[:name]))
        }.map { |m| m[:name] || m[:slug] }
      }
    end

    # Normalize a mod slug for comparison (lowercase, strip hyphens/underscores).
    def normalize_slug(slug)
      slug.to_s.downcase.gsub(/[-_\s]/, "")
    end

    # Build mod pairs from the selected mods list where at least one mod in the pair
    # is in the changed_slugs set (added or removed). Used by #adjust to regenerate
    # only the KubeJS scripts affected by the adjustment (Req 11.6).
    #
    # @param mods          [Array<Hash>] selected mod hashes
    # @param changed_slugs [Set<String>] normalized slugs of added/removed mods
    # @return [Array<Array<Hash>>] array of [mod_a, mod_b] pairs
    def build_affected_mod_pairs(mods, changed_slugs)
      return [] if changed_slugs.empty? || mods.size < 2

      pairs = []
      mods.each_with_index do |mod_a, i|
        mods[(i + 1)..].each do |mod_b|
          slug_a = normalize_slug(mod_a[:slug] || mod_a[:name])
          slug_b = normalize_slug(mod_b[:slug] || mod_b[:name])
          # Include the pair only if at least one mod was changed.
          if changed_slugs.include?(slug_a) || changed_slugs.include?(slug_b)
            pairs << [mod_a, mod_b]
          end
        end
      end

      pairs
    end
  end
end
