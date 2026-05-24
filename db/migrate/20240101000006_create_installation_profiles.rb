# frozen_string_literal: true

# Requirements: 6.3
# InstallationProfile is standalone — no user association per ER diagram.
# It represents local Launcher profiles stored independently.
class CreateInstallationProfiles < ActiveRecord::Migration[8.0]
  def change
    create_table :installation_profiles do |t|
      t.string :name, null: false
      t.string :minecraft_version, null: false
      t.string :loader, null: false
      t.string :loader_version
      t.string :install_path
      t.string :java_path

      t.timestamps
    end
  end
end
