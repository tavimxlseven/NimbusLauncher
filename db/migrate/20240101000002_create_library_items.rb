# frozen_string_literal: true

# Requirements: 4.1, 6.3
class CreateLibraryItems < ActiveRecord::Migration[8.0]
  def change
    create_table :library_items do |t|
      t.references :user, null: false, foreign_key: true
      t.string :source, null: false
      t.string :external_id, null: false
      t.string :item_type, null: false
      t.string :name
      t.string :version
      t.datetime :added_at

      t.timestamps
    end

    add_index :library_items, %i[user_id source external_id], unique: true,
              name: "index_library_items_on_user_source_external_id"
  end
end
