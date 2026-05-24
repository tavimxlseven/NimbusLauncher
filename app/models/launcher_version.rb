# frozen_string_literal: true

# LauncherVersion stores version information for the Nimbus Launcher.
# The launcher checks this endpoint on startup to determine if an update is required.
#
# Attributes:
#   current       [String]  Latest available version (semver format, e.g., "1.2.3")
#   minimum       [String]  Minimum required version (semver format)
#   download_url  [String]  URL to download page for updates
#   release_notes [String]  Optional markdown release notes
#   active        [Boolean] Whether this version record is active (only one should be active)
#
class LauncherVersion < ApplicationRecord
  # Validations
  validates :current, presence: true, format: { with: /\A\d+\.\d+\.\d+\z/, message: "must be valid semver (e.g., 1.2.3)" }
  validates :minimum, presence: true, format: { with: /\A\d+\.\d+\.\d+\z/, message: "must be valid semver (e.g., 1.2.3)" }
  validates :download_url, presence: true, format: { with: URI::DEFAULT_PARSER.make_regexp(%w[http https]), message: "must be a valid URL" }
  validate :minimum_not_greater_than_current

  # Scopes
  scope :active, -> { where(active: true) }

  # Class methods
  def self.current_version_info
    active.order(created_at: :desc).first
  end

  private

  def minimum_not_greater_than_current
    return unless current.present? && minimum.present?

    if compare_versions(minimum, current) > 0
      errors.add(:minimum, "cannot be greater than current version")
    end
  end

  def compare_versions(v1, v2)
    parts1 = v1.split(".").map(&:to_i)
    parts2 = v2.split(".").map(&:to_i)

    parts1.zip(parts2).each do |p1, p2|
      return p1 <=> p2 if p1 != p2
    end

    0
  end
end
