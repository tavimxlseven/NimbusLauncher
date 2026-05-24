# frozen_string_literal: true

require "rails_helper"

# Requirements: 2.2, 7.4
RSpec.describe User, type: :model do
  describe "associations" do
    it { is_expected.to have_many(:library_items).dependent(:destroy) }
    it { is_expected.to have_many(:generated_modpacks).dependent(:destroy) }
  end

  describe "validations" do
    subject { build(:user) }

    # discord_uid
    it { is_expected.to validate_presence_of(:discord_uid) }
    it { is_expected.to validate_uniqueness_of(:discord_uid) }

    # username
    it { is_expected.to validate_presence_of(:username) }
    it { is_expected.to validate_length_of(:username).is_at_most(32) }

    # theme_preference
    it { is_expected.to allow_value(nil).for(:theme_preference) }
    it { is_expected.to allow_value("light").for(:theme_preference) }
    it { is_expected.to allow_value("dark").for(:theme_preference) }
    it { is_expected.to allow_value("system").for(:theme_preference) }
    it { is_expected.not_to allow_value("blue").for(:theme_preference) }
    it { is_expected.not_to allow_value("auto").for(:theme_preference) }
    it { is_expected.not_to allow_value("").for(:theme_preference) }

    # theme_color
    it { is_expected.to allow_value(nil).for(:theme_color) }
    it { is_expected.to allow_value("#1a2b3c").for(:theme_color) }
    it { is_expected.to allow_value("#AABBCC").for(:theme_color) }
    it { is_expected.to allow_value("#000000").for(:theme_color) }
    it { is_expected.to allow_value("#ffffff").for(:theme_color) }
    it { is_expected.not_to allow_value("1a2b3c").for(:theme_color) }
    it { is_expected.not_to allow_value("#1a2b3").for(:theme_color) }
    it { is_expected.not_to allow_value("#1a2b3cdd").for(:theme_color) }
    it { is_expected.not_to allow_value("red").for(:theme_color) }
    it { is_expected.not_to allow_value("").for(:theme_color) }
  end

  describe "discord_uid uniqueness" do
    it "rejects a duplicate discord_uid" do
      create(:user, discord_uid: "unique_uid_123")
      duplicate = build(:user, discord_uid: "unique_uid_123")
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:discord_uid]).to include("has already been taken")
    end

    it "allows different discord_uids" do
      create(:user, discord_uid: "uid_aaa")
      second = build(:user, discord_uid: "uid_bbb")
      expect(second).to be_valid
    end
  end

  describe "username length boundary" do
    it "accepts a username of exactly 32 characters" do
      user = build(:user, username: "a" * 32)
      expect(user).to be_valid
    end

    it "rejects a username of 33 characters" do
      user = build(:user, username: "a" * 33)
      expect(user).not_to be_valid
      expect(user.errors[:username]).to be_present
    end

    it "accepts a username of 1 character" do
      user = build(:user, username: "x")
      expect(user).to be_valid
    end
  end

  describe "valid factory" do
    it "produces a valid user by default" do
      expect(build(:user)).to be_valid
    end
  end
end
