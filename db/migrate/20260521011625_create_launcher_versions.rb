# frozen_string_literal: true

class CreateLauncherVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :launcher_versions do |t|
      t.string :current, null: false
      t.string :minimum, null: false
      t.string :download_url, null: false
      t.text :release_notes
      t.boolean :active, default: true, null: false

      t.timestamps
    end

    add_index :launcher_versions, :active
  end
end
