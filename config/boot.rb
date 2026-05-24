# frozen_string_literal: true

ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

require "bundler/setup" # Set up gems listed in the Gemfile.

# Load .env file manually (no dotenv gem needed)
env_file = File.expand_path("../.env", __dir__)
if File.exist?(env_file)
  File.foreach(env_file) do |line|
    line = line.strip
    next if line.empty? || line.start_with?("#")
    key, value = line.split("=", 2)
    next unless key && value
    value = value.strip
    # Skip empty values — don't override with blank strings
    next if value.empty?
    # Always set — ENV[key] ||= value would skip if key exists as nil
    ENV[key.strip] = value unless ENV.key?(key.strip) && !ENV[key.strip].to_s.empty?
  end
end

# Disable bootsnap YAML cache to avoid psych default gem conflicts on Ruby 4.0
ENV["BOOTSNAP_COMPILE_CACHE"] ||= "0"
require "bootsnap/setup" # Speed up boot time by caching expensive operations.
