# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_05_21_011625) do
  create_table "generated_modpacks", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "description_prompt", null: false
    t.string "loader", null: false
    t.string "loader_version"
    t.text "manifest_json"
    t.string "minecraft_version", null: false
    t.integer "mod_count", default: 0
    t.string "name"
    t.text "report_json"
    t.string "status", default: "generating", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["status"], name: "index_generated_modpacks_on_status"
    t.index ["user_id"], name: "index_generated_modpacks_on_user_id"
  end

  create_table "generated_mods", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "external_id", null: false
    t.integer "generated_modpack_id", null: false
    t.boolean "is_optional", default: false, null: false
    t.string "justification"
    t.string "name"
    t.string "source", null: false
    t.string "version"
    t.index ["generated_modpack_id", "source", "external_id"], name: "index_generated_mods_on_modpack_source_external_id"
    t.index ["generated_modpack_id"], name: "index_generated_mods_on_generated_modpack_id"
  end

  create_table "installation_profiles", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "install_path"
    t.string "java_path"
    t.string "loader", null: false
    t.string "loader_version"
    t.string "minecraft_version", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "kube_js_scripts", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "generated_modpack_id", null: false
    t.string "mod_pair", null: false
    t.text "script_content", null: false
    t.string "script_type", null: false
    t.index ["generated_modpack_id", "mod_pair"], name: "index_kube_js_scripts_on_modpack_and_mod_pair"
    t.index ["generated_modpack_id"], name: "index_kube_js_scripts_on_generated_modpack_id"
  end

  create_table "modpack_mods", force: :cascade do |t|
    t.integer  "library_item_id", null: false
    t.string   "external_id",     null: false
    t.string   "source",          null: false
    t.string   "name"
    t.string   "version"
    t.string   "version_name"
    t.string   "image_url"
    t.boolean  "enabled",         default: true, null: false
    t.datetime "added_at"
    t.datetime "created_at",      null: false
    t.datetime "updated_at",      null: false
    t.index ["library_item_id"], name: "index_modpack_mods_on_library_item_id"
    t.index ["library_item_id", "source", "external_id"], name: "index_modpack_mods_unique", unique: true
  end

  create_table "library_items", force: :cascade do |t|
    t.datetime "added_at"
    t.datetime "created_at", null: false
    t.string "external_id", null: false
    t.string "item_type", null: false
    t.string "name"
    t.string "source", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.string "version"
    t.string "loader"
    t.string "mc_version"
    t.string "image_url"
    t.text "description"
    t.index ["user_id", "source", "external_id"], name: "index_library_items_on_user_source_external_id", unique: true
    t.index ["user_id"], name: "index_library_items_on_user_id"
  end

  create_table "launcher_versions", force: :cascade do |t|
    t.string "current", null: false
    t.string "minimum", null: false
    t.string "download_url", null: false
    t.text "release_notes"
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active"], name: "index_launcher_versions_on_active"
  end

  create_table "users", force: :cascade do |t|
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.string "discord_uid", null: false
    t.datetime "session_expires_at"
    t.string "theme_color"
    t.string "theme_preference"
    t.datetime "updated_at", null: false
    t.string "username", null: false
    t.index ["discord_uid"], name: "index_users_on_discord_uid", unique: true
  end

  add_foreign_key "generated_modpacks", "users"
  add_foreign_key "generated_mods", "generated_modpacks"
  add_foreign_key "kube_js_scripts", "generated_modpacks"
  add_foreign_key "library_items", "users"
end
