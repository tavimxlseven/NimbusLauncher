# frozen_string_literal: true

class LauncherToken < ApplicationRecord
  belongs_to :user

  before_create :generate_token

  scope :valid, -> { where(used: false).where("expires_at > ?", Time.current) }

  def expired?
    expires_at < Time.current
  end

  private

  def generate_token
    self.token = SecureRandom.urlsafe_base64(32)
    self.expires_at = 5.minutes.from_now
  end
end
