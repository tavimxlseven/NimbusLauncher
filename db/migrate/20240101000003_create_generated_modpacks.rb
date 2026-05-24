# frozen_string_literal: true

# Requirements: 6.3
class CreateGeneratedModpacks < ActiveRecord::Migration[8.0]
  def change
    create_table :generated_modpacks do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name
      t.string :description_prompt, null: false
      t.string :minecraft_version, null: false
      t.string :loader, null: false
      t.string :loader_version
      t.integer :mod_count, default: 0
      t.string :status, null: false, default: "generating"
      t.text :manifest_json
      t.text :report_json

      t.timestamps
    end

    add_index :generated_modpacks, :status
  end
end
