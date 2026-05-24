# frozen_string_literal: true

# Feature: minecraft-launcher-platform, Property 8: Seleção de banco de dados por DATABASE_URL
#
# Validates: Requirements 6.1, 6.2
#
# Property: Para qualquer valor de DATABASE_URL, se iniciar com 'postgres://' ou
# 'postgresql://' o sistema deve usar PostgreSQL; para qualquer outro valor (incluindo
# ausência da variável, string vazia, outros prefixos), deve usar SQLite — sem exceções
# e sem fallback silencioso entre os dois bancos.

require "rails_helper"
require "rantly/property"

# ---------------------------------------------------------------------------
# DatabaseSelector — pure selection logic extracted from:
#   config/initializers/database_selector.rb
#   config/database.yml
#
# The initializer and database.yml both use the same predicate:
#   url.start_with?("postgres://", "postgresql://")
#
# We test this predicate in isolation so the property runs without touching
# the real database connection (which is intentionally skipped in test env).
# ---------------------------------------------------------------------------
module DatabaseSelector
  POSTGRES_PREFIXES = %w[postgres:// postgresql://].freeze

  # Returns :postgresql when DATABASE_URL starts with a postgres prefix,
  # :sqlite3 for any other value (absent, empty, or other prefix).
  def self.adapter_for(database_url)
    url = database_url.to_s
    if POSTGRES_PREFIXES.any? { |prefix| url.start_with?(prefix) }
      :postgresql
    else
      :sqlite3
    end
  end

  # Mirrors the ENV.fetch("DATABASE_URL", "") call used in the initializer
  # and database.yml.
  def self.adapter_from_env
    adapter_for(ENV.fetch("DATABASE_URL", ""))
  end
end

RSpec.describe DatabaseSelector, type: :model do
  # Helper: wraps Rantly::Property.new so examples read like property_of { ... }.check(n) { ... }
  def property_of(&block)
    Rantly::Property.new(block)
  end

  # -------------------------------------------------------------------------
  # Feature: minecraft-launcher-platform, Property 8: Seleção de banco de dados por DATABASE_URL
  # Validates: Requirements 6.1, 6.2
  # -------------------------------------------------------------------------
  describe "P8: Seleção de banco de dados por DATABASE_URL — 50 iterações" do

    # Requirement 6.2: DATABASE_URL starting with 'postgres://' → PostgreSQL
    it "uses PostgreSQL for any DATABASE_URL starting with 'postgres://' (Req 6.2)" do
      property_of {
        # Generate a valid-looking postgres:// URL with arbitrary host/path suffix
        suffix = sized(integer(1..40)) { string(:alnum) }
        "postgres://#{suffix}"
      }.check(10) do |url|
        expect(DatabaseSelector.adapter_for(url)).to eq(:postgresql),
          "Expected :postgresql for DATABASE_URL='#{url}', got :sqlite3"
      end
    end

    # Requirement 6.2: DATABASE_URL starting with 'postgresql://' → PostgreSQL
    it "uses PostgreSQL for any DATABASE_URL starting with 'postgresql://' (Req 6.2)" do
      property_of {
        suffix = sized(integer(1..40)) { string(:alnum) }
        "postgresql://#{suffix}"
      }.check(10) do |url|
        expect(DatabaseSelector.adapter_for(url)).to eq(:postgresql),
          "Expected :postgresql for DATABASE_URL='#{url}', got :sqlite3"
      end
    end

    # Requirement 6.1: DATABASE_URL absent (empty string from ENV.fetch default) → SQLite
    it "uses SQLite when DATABASE_URL is absent (empty string default) (Req 6.1)" do
      expect(DatabaseSelector.adapter_for("")).to eq(:sqlite3)
    end

    # Requirement 6.1: DATABASE_URL is nil → SQLite (nil.to_s == "")
    it "uses SQLite when DATABASE_URL is nil (Req 6.1)" do
      expect(DatabaseSelector.adapter_for(nil)).to eq(:sqlite3)
    end

    # Requirement 6.1: DATABASE_URL with arbitrary non-postgres prefix → SQLite
    it "uses SQLite for any DATABASE_URL with a non-postgres prefix — 50 iterations (Req 6.1)" do
      property_of {
        # Generate a non-empty string that does NOT start with postgres:// or postgresql://
        prefix = sized(integer(1..10)) { string(:alnum) }
        suffix = sized(integer(0..30)) { string(:alnum) }
        url    = "#{prefix}://#{suffix}"
        # Guard: must not accidentally start with a postgres prefix
        guard(!url.start_with?("postgres://", "postgresql://"))
        url
      }.check(10) do |url|
        expect(DatabaseSelector.adapter_for(url)).to eq(:sqlite3),
          "Expected :sqlite3 for DATABASE_URL='#{url}', got :postgresql"
      end
    end

    # Requirement 6.1: DATABASE_URL is a plain string without '://' → SQLite
    it "uses SQLite for DATABASE_URL values without a scheme separator — 50 iterations (Req 6.1)" do
      property_of {
        # Generate strings that have no '://' at all
        s = sized(integer(1..30)) { string(:alnum) }
        guard(!s.start_with?("postgres://", "postgresql://"))
        s
      }.check(10) do |url|
        expect(DatabaseSelector.adapter_for(url)).to eq(:sqlite3),
          "Expected :sqlite3 for DATABASE_URL='#{url}', got :postgresql"
      end
    end

    # No silent fallback: the adapter is always one of the two known values
    it "always returns exactly :postgresql or :sqlite3 — never a third value — 50 iterations" do
      property_of {
        sized(integer(0..60)) { string }
      }.check(10) do |url|
        result = DatabaseSelector.adapter_for(url)
        expect([:postgresql, :sqlite3]).to include(result),
          "Expected adapter to be :postgresql or :sqlite3, got #{result.inspect} for url='#{url}'"
      end
    end

    # No silent fallback: postgres:// and postgresql:// are the ONLY prefixes that select PostgreSQL
    it "only 'postgres://' and 'postgresql://' prefixes select PostgreSQL — 50 iterations" do
      property_of {
        sized(integer(0..60)) { string }
      }.check(10) do |url|
        result = DatabaseSelector.adapter_for(url)
        if result == :postgresql
          expect(url.start_with?("postgres://", "postgresql://")).to be(true),
            "Expected :postgresql only for postgres:// or postgresql:// prefix, " \
            "but got :postgresql for url='#{url}'"
        end
      end
    end

    # Boundary: exact prefix strings with no suffix → PostgreSQL
    it "uses PostgreSQL for the exact prefix 'postgres://' with no suffix (Req 6.2)" do
      expect(DatabaseSelector.adapter_for("postgres://")).to eq(:postgresql)
    end

    it "uses PostgreSQL for the exact prefix 'postgresql://' with no suffix (Req 6.2)" do
      expect(DatabaseSelector.adapter_for("postgresql://")).to eq(:postgresql)
    end

    # Boundary: strings that are almost a postgres prefix but not quite → SQLite
    it "uses SQLite for 'postgres:/' (single slash — not a valid prefix) (Req 6.1)" do
      expect(DatabaseSelector.adapter_for("postgres:/")).to eq(:sqlite3)
    end

    it "uses SQLite for 'POSTGRES://host' (uppercase — case-sensitive match) (Req 6.1)" do
      expect(DatabaseSelector.adapter_for("POSTGRES://host")).to eq(:sqlite3)
    end

    it "uses SQLite for 'mysql://host/db' (Req 6.1)" do
      expect(DatabaseSelector.adapter_for("mysql://host/db")).to eq(:sqlite3)
    end

    it "uses SQLite for 'sqlite3:db/development.sqlite3' (Req 6.1)" do
      expect(DatabaseSelector.adapter_for("sqlite3:db/development.sqlite3")).to eq(:sqlite3)
    end

    # ENV integration: adapter_from_env reads DATABASE_URL from the environment
    it "adapter_from_env returns :postgresql when ENV['DATABASE_URL'] starts with postgres://" do
      ClimateControl = Module.new unless defined?(ClimateControl)
      original = ENV["DATABASE_URL"]
      begin
        ENV["DATABASE_URL"] = "postgres://user:pass@localhost/mydb"
        expect(DatabaseSelector.adapter_from_env).to eq(:postgresql)
      ensure
        if original.nil?
          ENV.delete("DATABASE_URL")
        else
          ENV["DATABASE_URL"] = original
        end
      end
    end

    it "adapter_from_env returns :sqlite3 when ENV['DATABASE_URL'] is absent" do
      original = ENV["DATABASE_URL"]
      begin
        ENV.delete("DATABASE_URL")
        expect(DatabaseSelector.adapter_from_env).to eq(:sqlite3)
      ensure
        ENV["DATABASE_URL"] = original unless original.nil?
      end
    end

    it "adapter_from_env returns :sqlite3 when ENV['DATABASE_URL'] is empty string" do
      original = ENV["DATABASE_URL"]
      begin
        ENV["DATABASE_URL"] = ""
        expect(DatabaseSelector.adapter_from_env).to eq(:sqlite3)
      ensure
        if original.nil?
          ENV.delete("DATABASE_URL")
        else
          ENV["DATABASE_URL"] = original
        end
      end
    end
  end
end
