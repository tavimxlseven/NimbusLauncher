# frozen_string_literal: true

# Requirements: 9.5
# Standalone model — no user association per ER diagram.
# Represents a local Launcher installation profile.
class InstallationProfile < ApplicationRecord
  validates :name, presence: true
  validates :minecraft_version, presence: true
  validates :loader, presence: true, inclusion: { in: %w[forge fabric quilt neoforge] }
end
