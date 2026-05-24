# frozen_string_literal: true

# Requirements: 4.1, 4.2
class LibraryItem < ApplicationRecord
  belongs_to :user
  has_many :modpack_mods, dependent: :destroy

  validates :source, inclusion: { in: %w[curseforge modrinth] }
  validates :item_type, inclusion: { in: %w[mod modpack] }
  validates :external_id, presence: true
  validates :user_id, uniqueness: {
    scope: %i[source external_id],
    message: "Item já está na sua biblioteca"
  }
end
