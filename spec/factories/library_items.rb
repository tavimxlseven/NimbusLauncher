# frozen_string_literal: true

FactoryBot.define do
  factory :library_item do
    association :user
    source      { "modrinth" }
    item_type   { "mod" }
    sequence(:external_id) { |n| "ext_#{n}" }
    name        { "Sample Mod" }
    version     { "1.0.0" }
    added_at    { Time.current }
  end
end
