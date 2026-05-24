# frozen_string_literal: true

require "rails_helper"

# Requirements: 7.2, 7.3
RSpec.describe LauncherVersion, type: :model do
  describe "validations" do
    subject { build(:launcher_version) }

    # current version
    it { is_expected.to validate_presence_of(:current) }
    
    it "validates current version format" do
      expect(build(:launcher_version, current: "1.2.3")).to be_valid
      expect(build(:launcher_version, current: "0.0.1")).to be_valid
      expect(build(:launcher_version, current: "999.999.999")).to be_valid
      
      expect(build(:launcher_version, current: "1.2")).not_to be_valid
      expect(build(:launcher_version, current: "v1.2.3")).not_to be_valid
      expect(build(:launcher_version, current: "1.2.3-beta")).not_to be_valid
      expect(build(:launcher_version, current: "latest")).not_to be_valid
    end

    # minimum version
    it { is_expected.to validate_presence_of(:minimum) }
    
    it "validates minimum version format" do
      expect(build(:launcher_version, minimum: "1.2.3")).to be_valid
      expect(build(:launcher_version, minimum: "0.0.1")).to be_valid
      
      expect(build(:launcher_version, minimum: "1.2")).not_to be_valid
      expect(build(:launcher_version, minimum: "v1.2.3")).not_to be_valid
    end

    # download_url
    it { is_expected.to validate_presence_of(:download_url) }
    
    it "validates download_url format" do
      expect(build(:launcher_version, download_url: "https://nimbusgg.me/download")).to be_valid
      expect(build(:launcher_version, download_url: "http://example.com/launcher")).to be_valid
      
      expect(build(:launcher_version, download_url: "not-a-url")).not_to be_valid
      expect(build(:launcher_version, download_url: "ftp://example.com")).not_to be_valid
    end

    # minimum not greater than current
    it "validates that minimum is not greater than current" do
      expect(build(:launcher_version, current: "1.2.0", minimum: "1.1.0")).to be_valid
      expect(build(:launcher_version, current: "1.2.0", minimum: "1.2.0")).to be_valid
      
      version = build(:launcher_version, current: "1.1.0", minimum: "1.2.0")
      expect(version).not_to be_valid
      expect(version.errors[:minimum]).to include("cannot be greater than current version")
    end
  end

  describe "scopes" do
    describe ".active" do
      let!(:active_version) { create(:launcher_version, active: true) }
      let!(:inactive_version) { create(:launcher_version, :inactive) }

      it "returns only active versions" do
        expect(LauncherVersion.active).to include(active_version)
        expect(LauncherVersion.active).not_to include(inactive_version)
      end
    end
  end

  describe ".current_version_info" do
    context "when multiple active versions exist" do
      let!(:old_version) do
        create(:launcher_version, 
               current: "1.0.0", 
               active: true, 
               created_at: 2.days.ago)
      end
      
      let!(:new_version) do
        create(:launcher_version, 
               current: "1.2.0", 
               active: true, 
               created_at: 1.day.ago)
      end

      it "returns the most recent active version" do
        expect(LauncherVersion.current_version_info).to eq(new_version)
      end
    end

    context "when no active versions exist" do
      before do
        LauncherVersion.destroy_all
      end

      it "returns nil" do
        expect(LauncherVersion.current_version_info).to be_nil
      end
    end

    context "when only inactive versions exist" do
      let!(:inactive_version) { create(:launcher_version, :inactive) }

      it "returns nil" do
        expect(LauncherVersion.current_version_info).to be_nil
      end
    end
  end

  describe "version comparison" do
    let(:version) { build(:launcher_version) }

    it "correctly compares equal versions" do
      expect(version.send(:compare_versions, "1.2.3", "1.2.3")).to eq(0)
    end

    it "correctly compares different major versions" do
      expect(version.send(:compare_versions, "1.2.3", "2.2.3")).to be < 0
      expect(version.send(:compare_versions, "2.2.3", "1.2.3")).to be > 0
    end

    it "correctly compares different minor versions" do
      expect(version.send(:compare_versions, "1.1.3", "1.2.3")).to be < 0
      expect(version.send(:compare_versions, "1.2.3", "1.1.3")).to be > 0
    end

    it "correctly compares different patch versions" do
      expect(version.send(:compare_versions, "1.2.2", "1.2.3")).to be < 0
      expect(version.send(:compare_versions, "1.2.3", "1.2.2")).to be > 0
    end
  end

  describe "valid factory" do
    it "produces a valid launcher_version by default" do
      expect(build(:launcher_version)).to be_valid
    end

    it "produces a valid launcher_version with release notes" do
      expect(build(:launcher_version, :with_release_notes)).to be_valid
    end
  end
end
