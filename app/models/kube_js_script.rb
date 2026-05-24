# frozen_string_literal: true

# Requirements: 11.4
class KubeJsScript < ApplicationRecord
  belongs_to :generated_modpack

  validates :mod_pair, presence: true
  validates :script_content, presence: true
  validates :script_type, presence: true, inclusion: { in: %w[recipe integration config] }
end
