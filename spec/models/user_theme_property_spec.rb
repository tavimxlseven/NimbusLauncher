# frozen_string_literal: true

# Feature: minecraft-launcher-platform, Property 14: Persistência e restauração de preferência de tema
#
# Validates: Requirements 7.4
#
# Property: Para qualquer preferência de tema válida (cor e modo claro/escuro/sistema)
# salva por um usuário autenticado, recuperar a preferência do banco de dados deve
# retornar exatamente os mesmos valores salvos.

require "rails_helper"
require "rantly/property"

RSpec.describe User, type: :model do
  # Helper: wraps Rantly::Property.new so examples read like property_of { ... }.check(n) { ... }
  def property_of(&block)
    Rantly::Property.new(block)
  end

  VALID_MODES = %w[light dark system].freeze
  HEX_CHARS   = "0123456789abcdefABCDEF".chars.freeze

  # Feature: minecraft-launcher-platform, Property 14: Persistência e restauração de preferência de tema
  # Validates: Requirements 7.4
  describe "P14: Theme preference persistence and restoration — 100 iterations" do
    it "persists and retrieves theme_preference exactly as saved" do
      property_of {
        choose(*VALID_MODES)
      }.check(100) do |mode|
        user = create(:user, theme_preference: mode, theme_color: nil)
        reloaded = User.find(user.id)

        expect(reloaded.theme_preference).to eq(mode),
          "Expected theme_preference '#{mode}' to be persisted and retrieved unchanged, " \
          "but got '#{reloaded.theme_preference}'"
      end
    end

    it "persists and retrieves theme_color exactly as saved" do
      property_of {
        "#" + array(6) { choose(*HEX_CHARS) }.join
      }.check(100) do |color|
        user = create(:user, theme_preference: nil, theme_color: color)
        reloaded = User.find(user.id)

        expect(reloaded.theme_color).to eq(color),
          "Expected theme_color '#{color}' to be persisted and retrieved unchanged, " \
          "but got '#{reloaded.theme_color}'"
      end
    end

    it "persists and retrieves both theme_preference and theme_color together exactly as saved" do
      property_of {
        mode  = choose(*VALID_MODES)
        color = "#" + array(6) { choose(*HEX_CHARS) }.join
        [mode, color]
      }.check(100) do |(mode, color)|
        user = create(:user, theme_preference: mode, theme_color: color)
        reloaded = User.find(user.id)

        expect(reloaded.theme_preference).to eq(mode),
          "Expected theme_preference '#{mode}' to round-trip through DB unchanged"
        expect(reloaded.theme_color).to eq(color),
          "Expected theme_color '#{color}' to round-trip through DB unchanged"
      end
    end

    it "rejects invalid theme_preference values (non-nil, non-light/dark/system)" do
      property_of {
        # Generate a non-empty string that is NOT a valid mode
        s = sized(rand(1..20)) { string(:alpha) }
        guard(!VALID_MODES.include?(s) && !s.empty?)
        s
      }.check(100) do |invalid_mode|
        user = build(:user, theme_preference: invalid_mode)
        expect(user).not_to be_valid,
          "Expected user with theme_preference='#{invalid_mode}' to be invalid"
        expect(user.errors[:theme_preference]).not_to be_empty
      end
    end

    it "rejects invalid theme_color values (non-nil, non-#RRGGBB format)" do
      property_of {
        # Generate a non-empty string that does NOT match /\A#[0-9a-fA-F]{6}\z/
        s = sized(rand(1..15)) { string(:alpha) }
        guard(!s.empty? && !/\A#[0-9a-fA-F]{6}\z/.match?(s))
        s
      }.check(100) do |invalid_color|
        user = build(:user, theme_color: invalid_color)
        expect(user).not_to be_valid,
          "Expected user with theme_color='#{invalid_color}' to be invalid"
        expect(user.errors[:theme_color]).not_to be_empty
      end
    end

    it "allows nil theme_preference (preference not yet set)" do
      user = create(:user, theme_preference: nil, theme_color: nil)
      reloaded = User.find(user.id)
      expect(reloaded.theme_preference).to be_nil
    end

    it "allows nil theme_color (no accent color set)" do
      user = create(:user, theme_preference: "dark", theme_color: nil)
      reloaded = User.find(user.id)
      expect(reloaded.theme_color).to be_nil
    end

    it "updating theme_preference persists the new value exactly" do
      property_of {
        [choose(*VALID_MODES), choose(*VALID_MODES)]
      }.check(100) do |(initial_mode, new_mode)|
        user = create(:user, theme_preference: initial_mode)
        user.update!(theme_preference: new_mode)
        reloaded = User.find(user.id)

        expect(reloaded.theme_preference).to eq(new_mode),
          "After updating theme_preference from '#{initial_mode}' to '#{new_mode}', " \
          "expected '#{new_mode}' but got '#{reloaded.theme_preference}'"
      end
    end

    it "updating theme_color persists the new value exactly" do
      property_of {
        color1 = "#" + array(6) { choose(*HEX_CHARS) }.join
        color2 = "#" + array(6) { choose(*HEX_CHARS) }.join
        [color1, color2]
      }.check(100) do |(initial_color, new_color)|
        user = create(:user, theme_color: initial_color)
        user.update!(theme_color: new_color)
        reloaded = User.find(user.id)

        expect(reloaded.theme_color).to eq(new_color),
          "After updating theme_color from '#{initial_color}' to '#{new_color}', " \
          "expected '#{new_color}' but got '#{reloaded.theme_color}'"
      end
    end
  end
end
