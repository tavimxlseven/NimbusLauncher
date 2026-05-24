# frozen_string_literal: true

FactoryBot.define do
  factory :generated_modpack do
    association :user
    sequence(:name)        { |n| "Modpack #{n}" }
    description_prompt     { "A tech and magic modpack" }
    minecraft_version      { "1.20.1" }
    loader                 { "fabric" }
    loader_version         { "0.15.11" }
    mod_count              { 0 }
    status                 { "generating" }
    manifest_json          { nil }
    report_json            { nil }
  end
end
