# frozen_string_literal: true

# Database selector initializer
# Requirements 6.1, 6.2, 6.4, 6.5
#
# Validates the database connection at startup when PostgreSQL is configured via
# DATABASE_URL. If the connection fails, logs the error and exits with code 1.
# There is NO silent fallback to SQLite under any circumstances.
#
# Only runs outside the test environment to avoid breaking the test suite.

return if Rails.env.test?

database_url = ENV.fetch("DATABASE_URL", "")
use_postgres  = database_url.start_with?("postgres://", "postgresql://")

if use_postgres
  # Requirement 6.5: If PostgreSQL configured via DATABASE_URL is not accessible
  # during startup → log connection error → exit(1), NO fallback to SQLite.
  begin
    ActiveRecord::Base.connection.execute("SELECT 1")
    Rails.logger.info("[DatabaseSelector] PostgreSQL connection verified successfully.")
  rescue => e
    Rails.logger.fatal(
      "[DatabaseSelector] FATAL: PostgreSQL connection failed. " \
      "DATABASE_URL=#{database_url.sub(%r{//[^@]+@}, '//[FILTERED]@')} " \
      "Error: #{e.class}: #{e.message}"
    )
    $stderr.puts "[DatabaseSelector] FATAL: PostgreSQL connection failed — #{e.class}: #{e.message}"
    exit(1)
  end
else
  # Requirement 6.1: DATABASE_URL absent, empty, or non-postgres prefix → use SQLite.
  # No action needed; Rails handles SQLite via database.yml.
  Rails.logger.debug("[DatabaseSelector] Using SQLite (DATABASE_URL not set or not a postgres:// / postgresql:// URL).")
end
