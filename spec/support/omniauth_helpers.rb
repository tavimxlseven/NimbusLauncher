# frozen_string_literal: true

# Helpers for mocking OmniAuth in request specs
module OmniauthHelpers
  # Sets up a mock OmniAuth auth hash for Discord
  def mock_discord_auth(uid: "123456789", name: "TestUser", email: "test@example.com", image: "https://cdn.discordapp.com/avatars/123/abc.png")
    OmniAuth.config.test_mode = true
    OmniAuth.config.mock_auth[:discord] = OmniAuth::AuthHash.new(
      provider: "discord",
      uid: uid,
      info: OmniAuth::AuthHash::InfoHash.new(
        name: name,
        email: email,
        image: image
      ),
      credentials: OmniAuth::AuthHash.new(
        token: "MOCK_ACCESS_TOKEN",
        refresh_token: "MOCK_REFRESH_TOKEN",
        expires_at: 1.hour.from_now.to_i
      )
    )
  end

  def reset_omniauth_mocks
    OmniAuth.config.test_mode = false
    OmniAuth.config.mock_auth.delete(:discord)
  end
end

RSpec.configure do |config|
  config.include OmniauthHelpers, type: :request
end
