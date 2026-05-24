# frozen_string_literal: true

# Requirements: 2.2, 6.3
class CreateUsers < ActiveRecord::Migration[8.0]
  def change
    create_table :users do |t|
      t.string :discord_uid, null: false
      t.string :username, null: false
      t.string :avatar_url
      t.string :theme_preference
      t.string :theme_color
      t.datetime :session_expires_at

      t.timestamps
    end

    add_index :users, :discord_uid, unique: true
  end
end
