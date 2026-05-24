# frozen_string_literal: true

# Requirements: 2.2, 7.4
class User < ApplicationRecord
  has_many :library_items, dependent: :destroy
  has_many :generated_modpacks, dependent: :destroy

  validates :discord_uid, presence: true, uniqueness: true
  validates :username, presence: true, length: { maximum: 32 }
  validates :theme_preference, inclusion: { in: %w[light dark system] }, allow_nil: true
  validates :theme_color, format: { with: /\A#[0-9a-fA-F]{6}\z/ }, allow_nil: true
end
