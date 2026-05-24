# frozen_string_literal: true

# CORS middleware for development — allows the Vite dev server (localhost:5173)
# to make credentialed requests to the Rails API (localhost:3000).

if Rails.env.development?
  # Simple inline middleware class
  cors_middleware = Class.new do
    def initialize(app)
      @app = app
    end

    def call(env)
      origin = env["HTTP_ORIGIN"].to_s

      # Handle preflight OPTIONS before passing to app
      if env["REQUEST_METHOD"] == "OPTIONS" && origin.start_with?("http://localhost:5173")
        headers = {
          "Access-Control-Allow-Origin"      => origin,
          "Access-Control-Allow-Credentials" => "true",
          "Access-Control-Allow-Methods"     => "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers"     => "Content-Type, X-CSRF-Token, Authorization",
          "Access-Control-Max-Age"           => "86400",
          "Content-Type"                     => "text/plain",
        }
        return [204, headers, []]
      end

      status, headers, body = @app.call(env)

      if origin.start_with?("http://localhost:5173")
        headers["Access-Control-Allow-Origin"]      = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Methods"]     = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        headers["Access-Control-Allow-Headers"]     = "Content-Type, X-CSRF-Token, Authorization"
      end

      [status, headers, body]
    end
  end

  Rails.application.config.middleware.insert_before 0, cors_middleware
end
