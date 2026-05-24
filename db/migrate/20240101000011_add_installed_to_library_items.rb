# frozen_string_literal: true

class AddInstalledToLibraryItems < ActiveRecord::Migration[8.1]
  def change
    add_column :library_items, :installed, :boolean, default: false, null: false

    # Backfill: custom modpacks (external_id starts with `custom-`) are
    # considered "installed" by default, since they have no remote source
    # to download from. Existing mods are also marked installed (the gate
    # only applies to external modpacks).
    reversible do |dir|
      dir.up do
        execute <<~SQL.squish
          UPDATE library_items
             SET installed = true
           WHERE item_type = 'mod'
              OR external_id LIKE 'custom-%'
        SQL
      end
    end
  end
end
