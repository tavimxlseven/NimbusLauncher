# frozen_string_literal: true

# Requirements: 6.3
class CreateKubeJsScripts < ActiveRecord::Migration[8.0]
  def change
    create_table :kube_js_scripts do |t|
      t.references :generated_modpack, null: false, foreign_key: true
      t.string :mod_pair, null: false
      t.text :script_content, null: false
      t.string :script_type, null: false

      t.datetime :created_at, null: false
    end

    add_index :kube_js_scripts, %i[generated_modpack_id mod_pair],
              name: "index_kube_js_scripts_on_modpack_and_mod_pair"
  end
end
