# frozen_string_literal: true

# Long-lived bearer token issued to the Electron launcher.
# Created when a `LauncherToken` is consumed via /api/v1/launcher/poll.
# The launcher stores this token in OS keychain and sends it as
# `Authorization: Bearer <token>` on every authenticated API call.
#
# Lifetime: 90 days, refreshed via `last_used_at` on each successful call.
class LauncherSession < ApplicationRecord
  belongs_to :user

  before_create :generate_token

  scope :active, -> { where("expires_at > ?", Time.current) }

  def expired?
    expires_at < Time.current
  end

  def touch_usage!
    update_column(:last_used_at, Time.current)
  end

  private

  def generate_token
    self.token       = "nlsk_#{SecureRandom.urlsafe_base64(40)}"
    self.expires_at  = 90.days.from_now
  end
end
