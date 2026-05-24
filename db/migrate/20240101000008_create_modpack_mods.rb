# frozen_string_literal: true

class CreateModpackMods < ActiveRecord::Migration[8.1]
  def change
    create_table "modpack_mods" do |t|
      t.integer  "library_item_id", null: false   # the modpack
      t.string   "external_id",     null: false   # mod's external id (e.g. modrinth project id)
      t.string   "source",          null: false   # modrinth | curseforge
      t.string   "name"
      t.string   "version"                        # selected version id
      t.string   "version_name"                   # human-readable version name
      t.string   "image_url"
      t.boolean  "enabled",         default: true, null: false
      t.datetime "added_at"
      t.timestamps
    end

    add_index "modpack_mods", ["library_item_id"], name: "index_modpack_mods_on_library_item_id"
    add_index "modpack_mods", ["library_item_id", "source", "external_id"],
              name: "index_modpack_mods_unique", unique: true
    add_foreign_key "modpack_mods", "library_items"
  end
end
