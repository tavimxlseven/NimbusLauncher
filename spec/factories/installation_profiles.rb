# frozen_string_literal: true

FactoryBot.define do
  factory :installation_profile do
    sequence(:name)   { |n| "Profile #{n}" }
    minecraft_version { "1.20.1" }
    loader            { "fabric" }
    loader_version    { "0.15.11" }
    install_path      { "/home/user/.minecraft/profiles/profile_1" }
    java_path         { nil }
  end
end
