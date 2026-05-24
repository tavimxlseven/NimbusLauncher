# frozen_string_literal: true

# Create initial launcher version record
# This can be updated via Rails console or admin interface

LauncherVersion.find_or_create_by!(active: true) do |version|
  version.current = "1.0.0"
  version.minimum = "1.0.0"
  version.download_url = "https://nimbusgg.me/download"
  version.release_notes = "Initial release"
end

puts "✓ Launcher version seeded"
