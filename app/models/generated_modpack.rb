# frozen_string_literal: true

# Requirements: 11.1
class GeneratedModpack < ApplicationRecord
  belongs_to :user
  has_many :generated_mods, dependent: :destroy
  has_many :kube_js_scripts, dependent: :destroy

  validates :description_prompt, presence: true, length: { maximum: 500 }
  validates :minecraft_version, presence: true
  validates :loader, inclusion: { in: %w[forge fabric quilt neoforge] }
  validates :status, inclusion: { in: %w[generating completed failed] }
end
