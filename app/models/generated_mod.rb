# frozen_string_literal: true

# Requirements: 11.4, 11.5
class GeneratedMod < ApplicationRecord
  belongs_to :generated_modpack

  validates :source, presence: true, inclusion: { in: %w[curseforge modrinth] }
  validates :external_id, presence: true
end
