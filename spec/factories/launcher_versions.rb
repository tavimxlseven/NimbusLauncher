# frozen_string_literal: true

FactoryBot.define do
  factory :launcher_version do
    current { "1.0.0" }
    minimum { "1.0.0" }
    download_url { "https://nimbusgg.me/download" }
    release_notes { nil }
    active { true }

    trait :with_release_notes do
      release_notes { "## What's New\n- Feature A\n- Bug fix B" }
    end

    trait :outdated do
      current { "0.9.0" }
      minimum { "0.8.0" }
    end

    trait :inactive do
      active { false }
    end
  end
end
