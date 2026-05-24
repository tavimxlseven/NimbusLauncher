# frozen_string_literal: true

require "rails_helper"

# Requirements: 4.2
RSpec.describe LibraryItem, type: :model do
  describe "associations" do
    it { is_expected.to belong_to(:user) }
  end

  describe "validations" do
    subject { build(:library_item) }

    # source
    it { is_expected.to allow_value("curseforge").for(:source) }
    it { is_expected.to allow_value("modrinth").for(:source) }
    it { is_expected.not_to allow_value("steam").for(:source) }
    it { is_expected.not_to allow_value("").for(:source) }
    it { is_expected.not_to allow_value(nil).for(:source) }

    # item_type
    it { is_expected.to allow_value("mod").for(:item_type) }
    it { is_expected.to allow_value("modpack").for(:item_type) }
    it { is_expected.not_to allow_value("shader").for(:item_type) }
    it { is_expected.not_to allow_value("").for(:item_type) }
    it { is_expected.not_to allow_value(nil).for(:item_type) }

    # external_id
    it { is_expected.to validate_presence_of(:external_id) }
  end

  describe "uniqueness of user + source + external_id" do
    let(:user) { create(:user) }

    it "allows the same external_id for different users" do
      create(:library_item, user: user, source: "modrinth", external_id: "mod-abc")
      other_user = create(:user)
      duplicate_for_other = build(:library_item, user: other_user, source: "modrinth", external_id: "mod-abc")
      expect(duplicate_for_other).to be_valid
    end

    it "allows the same external_id for the same user on different sources" do
      create(:library_item, user: user, source: "modrinth", external_id: "mod-abc")
      different_source = build(:library_item, user: user, source: "curseforge", external_id: "mod-abc")
      expect(different_source).to be_valid
    end

    it "allows the same user and source with different external_ids" do
      create(:library_item, user: user, source: "modrinth", external_id: "mod-abc")
      different_id = build(:library_item, user: user, source: "modrinth", external_id: "mod-xyz")
      expect(different_id).to be_valid
    end

    it "rejects a duplicate user + source + external_id combination" do
      create(:library_item, user: user, source: "modrinth", external_id: "mod-abc")
      duplicate = build(:library_item, user: user, source: "modrinth", external_id: "mod-abc")
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:user_id]).to include("Item já está na sua biblioteca")
    end
  end

  describe "valid factory" do
    it "produces a valid library_item by default" do
      expect(build(:library_item)).to be_valid
    end
  end
end
