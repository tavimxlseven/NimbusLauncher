# frozen_string_literal: true

FactoryBot.define do
  factory :user do
    sequence(:discord_uid) { |n| "discord_uid_#{n}" }
    sequence(:username)    { |n| "user#{n}" }
    avatar_url             { "https://cdn.discordapp.com/avatars/123/abc.png" }
    theme_preference       { nil }
    theme_color            { nil }
    session_expires_at     { 30.days.from_now }
  end
end
