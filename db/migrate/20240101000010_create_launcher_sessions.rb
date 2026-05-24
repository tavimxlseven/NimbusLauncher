# frozen_string_literal: true

class CreateLauncherSessions < ActiveRecord::Migration[8.1]
  def change
    create_table "launcher_sessions" do |t|
      t.integer  "user_id",    null: false
      t.string   "token",      null: false
      t.datetime "expires_at", null: false
      t.datetime "last_used_at"
      t.timestamps
    end
    add_index "launcher_sessions", ["token"], unique: true
    add_index "launcher_sessions", ["user_id"], name: "index_launcher_sessions_on_user_id"
    add_foreign_key "launcher_sessions", "users"
  end
end
