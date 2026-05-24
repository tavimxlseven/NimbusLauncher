# frozen_string_literal: true

module Api
  module V1
    module Users
      # Handles user profile and theme preference endpoints.
      #
      # Endpoints:
      #   GET   /api/v1/users/me                — current user's profile (authenticated)
      #   PATCH /api/v1/users/me/preferences    — update theme preferences (authenticated)
      #
      # Requirements: 7.4, 2.7
      class ProfilesController < BaseController
        before_action :enforce_authentication!

        # GET /api/v1/users/me
        #
        # Returns the authenticated user's profile data.
        # Requirement 2.7 — returns HTTP 401 if not authenticated (handled by enforce_authentication!)
        def show
          render_success(data: serialize_user(current_user))
        end

        # PATCH /api/v1/users/me
        #
        # General profile update (alias for update_preferences for route compatibility).
        # Requirement 7.4
        def update
          update_preferences
        end

        # PATCH /api/v1/users/me/preferences
        #
        # Updates theme_preference and/or theme_color for the current user.
        # Validates values before persisting — Requirement 3.4.
        # Requirement 7.4 — persists theme preference (color + mode) in the database.
        def update_preferences
          user = current_user

          if user.update(preference_params)
            render_success(data: serialize_user(user))
          else
            errors = user.errors.map do |error|
              { field: error.attribute, message: error.message, code: error.type }
            end
            render_error(errors: errors, status: :unprocessable_entity)
          end
        end

        private

        # Strong parameters for preference updates.
        # Permitted: theme_preference (light/dark/system), theme_color (#RRGGBB).
        def preference_params
          params.require(:user).permit(:theme_preference, :theme_color)
        rescue ActionController::ParameterMissing
          # Allow top-level params as well (no :user wrapper required)
          params.permit(:theme_preference, :theme_color)
        end

        # Serialize a User to the response shape defined in the design doc.
        #
        # @param user [User]
        # @return [Hash]
        def serialize_user(user)
          {
            id:               user.id,
            username:         user.username,
            avatar_url:       user.avatar_url,
            theme_preference: user.theme_preference,
            theme_color:      user.theme_color
          }
        end
      end
    end
  end
end
