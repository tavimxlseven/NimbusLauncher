# frozen_string_literal: true

# Custom Rake task: db:migrate:with_exit
# Requirements 6.4
#
# Wraps db:migrate so that any migration failure is caught, logged with the
# migration name + full error + stack trace, and the process exits with code 1.
#
# Use this task instead of plain `db:migrate` in production startup scripts
# (e.g. Dockerfile CMD, Procfile, Heroku release phase):
#
#   bundle exec rake db:migrate:with_exit
#
# This satisfies Requirement 6.4:
#   "IF a migration fails during startup, THEN THE Site SHALL register the
#    migration name, the full error with stack trace and terminate the process
#    with exit code 1."

namespace :db do
  namespace :migrate do
    desc "Run db:migrate and exit(1) on any migration failure — Requirement 6.4"
    task with_exit: :environment do
      begin
        Rake::Task["db:migrate"].invoke
      rescue ActiveRecord::MigrationError, StandardError => e
        # Extract migration name from the error message when available
        # (ActiveRecord includes the migration class name in the message)
        migration_name = e.message[/\b\d{14}_\w+\b/] || e.message.lines.first&.strip || "unknown migration"

        error_message = <<~MSG
          [MigrationRunner] FATAL: Migration failed — #{migration_name}
          #{e.class}: #{e.message}
          #{e.backtrace&.join("\n")}
        MSG

        # Log to Rails logger (goes to log/production.log etc.)
        Rails.logger.fatal(error_message)

        # Also write to stderr so it's visible in container/process logs
        $stderr.puts(error_message)

        exit(1)
      end
    end
  end
end
