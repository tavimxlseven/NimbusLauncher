# frozen_string_literal: true

require "rails_helper"

# Requirements: 11.1
RSpec.describe GeneratedModpack, type: :model do
  describe "associations" do
    it { is_expected.to belong_to(:user) }
    it { is_expected.to have_many(:generated_mods).dependent(:destroy) }
    it { is_expected.to have_many(:kube_js_scripts).dependent(:destroy) }
  end

  describe "validations" do
    subject { build(:generated_modpack) }

    # description_prompt
    it { is_expected.to validate_presence_of(:description_prompt) }
    it { is_expected.to validate_length_of(:description_prompt).is_at_most(500) }

    # minecraft_version
    it { is_expected.to validate_presence_of(:minecraft_version) }

    # loader
    it { is_expected.to allow_value("forge").for(:loader) }
    it { is_expected.to allow_value("fabric").for(:loader) }
    it { is_expected.to allow_value("quilt").for(:loader) }
    it { is_expected.to allow_value("neoforge").for(:loader) }
    it { is_expected.not_to allow_value("optifine").for(:loader) }
    it { is_expected.not_to allow_value("").for(:loader) }
    it { is_expected.not_to allow_value(nil).for(:loader) }

    # status
    it { is_expected.to allow_value("generating").for(:status) }
    it { is_expected.to allow_value("completed").for(:status) }
    it { is_expected.to allow_value("failed").for(:status) }
    it { is_expected.not_to allow_value("pending").for(:status) }
    it { is_expected.not_to allow_value("").for(:status) }
    it { is_expected.not_to allow_value(nil).for(:status) }
  end

  describe "description_prompt length boundary" do
    it "accepts a description_prompt of exactly 500 characters" do
      modpack = build(:generated_modpack, description_prompt: "a" * 500)
      expect(modpack).to be_valid
    end

    it "rejects a description_prompt of 501 characters" do
      modpack = build(:generated_modpack, description_prompt: "a" * 501)
      expect(modpack).not_to be_valid
      expect(modpack.errors[:description_prompt]).to be_present
    end

    it "rejects a blank description_prompt" do
      modpack = build(:generated_modpack, description_prompt: "")
      expect(modpack).not_to be_valid
      expect(modpack.errors[:description_prompt]).to be_present
    end
  end

  describe "valid factory" do
    it "produces a valid generated_modpack by default" do
      expect(build(:generated_modpack)).to be_valid
    end
  end
end
