# frozen_string_literal: true

class AddProfileFieldsToLibraryItems < ActiveRecord::Migration[8.1]
  def change
    add_column :library_items, :loader,      :string
    add_column :library_items, :mc_version,  :string
    add_column :library_items, :image_url,   :string
    add_column :library_items, :description, :text
  end
end
