# frozen_string_literal: true

# Requirements: 6.3
class CreateGeneratedMods < ActiveRecord::Migration[8.0]
  def change
    create_table :generated_mods do |t|
      t.references :generated_modpack, null: false, foreign_key: true
      t.string :source, null: false
      t.string :external_id, null: false
      t.string :name
      t.string :version
      t.string :justification
      t.boolean :is_optional, default: false, null: false

      t.datetime :created_at, null: false
    end

    add_index :generated_mods, %i[generated_modpack_id source external_id],
              name: "index_generated_mods_on_modpack_source_external_id"
  end
end
