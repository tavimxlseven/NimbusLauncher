# frozen_string_literal: true

class ModpackMod < ApplicationRecord
  belongs_to :library_item

  validates :source, inclusion: { in: %w[curseforge modrinth] }
  validates :external_id, presence: true
  validates :library_item_id, uniqueness: {
    scope: %i[source external_id],
    message: "Mod já está neste modpack"
  }
end
