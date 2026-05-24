# frozen_string_literal: true

class CreateLauncherTokens < ActiveRecord::Migration[8.1]
  def change
    create_table "launcher_tokens" do |t|
      t.integer  "user_id",    null: false
      t.string   "token",      null: false
      t.datetime "expires_at", null: false
      t.boolean  "used",       default: false, null: false
      t.timestamps
    end
    add_index "launcher_tokens", ["token"], unique: true
    add_index "launcher_tokens", ["user_id"], name: "index_launcher_tokens_on_user_id"
    add_foreign_key "launcher_tokens", "users"
  end
end
