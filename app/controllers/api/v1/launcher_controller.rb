# frozen_string_literal: true

module Api
  module V1
    # LauncherController provides version information for the Nimbus Launcher.
    # This endpoint is public (no authentication required) and is called on launcher startup
    # to check if an update is required.
    class LauncherController < BaseController
      # GET /api/v1/launcher/version
      #
      # Returns the current launcher version information.
      #
      # Response:
      #   {
      #     "data": {
      #       "current": "1.2.0",
      #       "minimum": "1.1.0",
      #       "downloadUrl": "https://nimbusgg.me/download",
      #       "releaseNotes": "Optional markdown release notes"
      #     }
      #   }
      #
      # Requirements: 7.2, 7.3
      def version
        version_info = LauncherVersion.current_version_info

        if version_info.nil?
          # Return a safe default if no version is configured
          render_success(
            data: {
              current: "0.0.0",
              minimum: "0.0.0",
              downloadUrl: "https://nimbusgg.me/download"
            }
          )
        else
          render_success(
            data: {
              current: version_info.current,
              minimum: version_info.minimum,
              downloadUrl: version_info.download_url,
              releaseNotes: version_info.release_notes
            }.compact
          )
        end
      end
    end
  end
end
