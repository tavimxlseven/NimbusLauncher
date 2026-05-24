# frozen_string_literal: true

FactoryBot.define do
  factory :generated_mod do
    association :generated_modpack
    source        { "modrinth" }
    sequence(:external_id) { |n| "mod_ext_#{n}" }
    name          { "Sample Mod" }
    version       { "1.0.0" }
    justification { "Adds great features" }
    is_optional   { false }
  end
end
