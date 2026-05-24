# frozen_string_literal: true

source "https://rubygems.org"

ruby ">= 3.3"

# Rails 8
gem "rails", "~> 8.0"

# Asset pipeline — disabled for API-only app (frontend served by Vite)
# gem "propshaft"

# Database adapters — selected at runtime via DATABASE_URL
gem "sqlite3", "~> 2.1"
gem "pg", "~> 1.5"

# Puma web server
gem "puma", ">= 5.0"

# JSON serialization
gem "jbuilder"

# Redis for Action Cable, caching and Rack::Attack store
gem "redis", "~> 5.0"

# Authentication
gem "omniauth-discord", "~> 0.1"
gem "omniauth-rails_csrf_protection", "~> 1.0"

# Security / rate limiting
gem "rack-attack", "~> 6.7"

# Modpack archive parsing (CurseForge .zip / Modrinth .mrpack)
gem "rubyzip", "~> 2.3"

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem "tzinfo-data", platforms: %i[windows jruby]

# Pin default gems to avoid native extension build failures on Ruby 4.0
# rdoc and irb are default gems; pinning prevents bundler from trying to build newer versions
gem "rdoc", "= 7.0.3"
gem "irb", "= 1.16.0"
gem "fiddle", "~> 1.1"

# Reduces boot times through caching; required in config/boot.rb
gem "bootsnap", require: false

group :development, :test do
  # Debugging
  gem "debug", platforms: %i[mri windows], require: "debug/prelude"

  # Static analysis
  gem "brakeman", require: false
  gem "rubocop-rails-omakase", require: false

  # Testing
  gem "rspec-rails", "~> 7.0"
  gem "factory_bot_rails"
  gem "faker"

  # Property-based testing
  gem "rantly", "~> 2.0"
end

group :development do
  gem "web-console"
end

group :test do
  gem "shoulda-matchers", "~> 6.0"
  gem "database_cleaner-active_record"
end

