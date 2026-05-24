# frozen_string_literal: true

Rails.application.routes.draw do
  # API v1 namespace
  namespace :api do
    namespace :v1 do
      # Mods & Modpacks
      resources :mods, only: %i[index show] do
        member do
          get :versions
        end
      end
      resources :modpacks, only: %i[index show] do
        member do
          get :manifest
          get :mods
          get :versions
        end
      end

      # Launcher auth — token-based login for the Electron app
      get  'launcher/poll',     to: 'launcher_auth#poll'
      post 'launcher/generate', to: 'launcher_auth#generate'
      
      # Launcher version — public endpoint for update checks
      get  'launcher/version',  to: 'launcher#version'

      # Mod file resolver (launcher uses this to get download URL + SHA)
      post 'mod_files/resolve', to: 'mod_files#resolve'

      # Library (authenticated)
      resources :library, only: %i[index show create update destroy] do
        member do
          post :install
          get :archive
        end
        resources :mods, only: %i[index create update destroy], controller: 'modpack_mods'
      end

      # AI generation
      namespace :ai do
        post :generate, to: "modpacks#generate"
        resources :modpacks, only: [] do
          member do
            patch :adjust
          end
        end
      end

      # User profile
      namespace :users do
        get  :me,          to: "profiles#show"
        patch :me,         to: "profiles#update"
        patch "me/preferences", to: "profiles#update_preferences"
      end
    end
  end

  # OAuth Discord — Requirements 2.1, 2.3, 2.4, 2.5, 2.6
  # GET /auth/discord is handled by OmniAuth middleware (allowed_request_methods: post,get).
  # It generates the state, stores it in session, and redirects to Discord.
  get    "/auth/discord/callback", to: "auth#discord_callback", as: :auth_discord_callback
  get    "/auth/failure",          to: "auth#failure",          as: :auth_failure
  delete "/auth/logout",           to: "auth#destroy",          as: :auth_logout

  # GET /auth/launcher — single entry point for the Electron launcher.
  # When called unauthenticated, redirects to /auth/discord and resumes after callback.
  # When authenticated, renders an HTML handoff page that opens nimbus://auth?token=XXX
  get "/auth/launcher", to: "auth#launcher_login", as: :auth_launcher

  # Health check
  get "/up" => "rails/health#show", as: :rails_health_check
end
