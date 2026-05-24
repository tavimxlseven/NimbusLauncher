/**
 * SecurityValidator — enforces HTTPS and validates trusted domains for downloads.
 *
 * Requirements: 15.1, 15.2, 15.3
 *
 * This module provides security validation for all network operations:
 * - Enforces HTTPS for all backend API calls
 * - Validates SSL certificates (Node.js default behavior)
 * - Validates download URLs point to trusted domains only
 */

import * as https from 'https'
import * as url from 'url'

/**
 * Whitelist of trusted domains for downloads.
 * 
 * Requirements: 15.3
 */
const TRUSTED_DOMAINS = [
  'nimbusgg.me',
  'github.com',
  'cdn.modrinth.com',
  'edge.forgecdn.net',
  'mediafilez.forgecdn.net',
  'api.adoptium.net',
  'github.githubassets.com',
] as const

/**
 * Validates that a URL uses HTTPS protocol.
 * 
 * Requirements: 15.1
 * 
 * @param urlString - The URL to validate
 * @returns true if URL uses HTTPS, false otherwise
 */
export function isHttps(urlString: string): boolean {
  try {
    const parsed = new url.URL(urlString)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validates that a URL points to a trusted domain.
 * 
 * Requirements: 15.3
 * 
 * @param urlString - The URL to validate
 * @returns true if URL points to a trusted domain, false otherwise
 */
export function isTrustedDomain(urlString: string): boolean {
  try {
    const parsed = new url.URL(urlString)
    const hostname = parsed.hostname.toLowerCase()
    
    // Check exact match or subdomain match
    return TRUSTED_DOMAINS.some(domain => {
      return hostname === domain || hostname.endsWith(`.${domain}`)
    })
  } catch {
    return false
  }
}

/**
 * Validates that a URL is both HTTPS and points to a trusted domain.
 * 
 * Requirements: 15.1, 15.3
 * 
 * @param urlString - The URL to validate
 * @returns Object with validation result and error message if invalid
 */
export function validateDownloadUrl(urlString: string): { valid: boolean; error?: string } {
  if (!isHttps(urlString)) {
    return {
      valid: false,
      error: `Download URL must use HTTPS: ${urlString}`,
    }
  }

  if (!isTrustedDomain(urlString)) {
    try {
      const parsed = new url.URL(urlString)
      return {
        valid: false,
        error: `Download URL domain not trusted: ${parsed.hostname}. Allowed domains: ${TRUSTED_DOMAINS.join(', ')}`,
      }
    } catch {
      return {
        valid: false,
        error: `Invalid download URL: ${urlString}`,
      }
    }
  }

  return { valid: true }
}

/**
 * Validates that a backend API URL uses HTTPS.
 * 
 * Requirements: 15.1
 * 
 * @param urlString - The backend API URL to validate
 * @returns Object with validation result and error message if invalid
 */
export function validateBackendUrl(urlString: string): { valid: boolean; error?: string } {
  if (!isHttps(urlString)) {
    return {
      valid: false,
      error: `Backend API URL must use HTTPS: ${urlString}`,
    }
  }

  return { valid: true }
}

/**
 * Creates an HTTPS request with certificate validation enabled.
 * 
 * Node.js validates SSL certificates by default, but this function
 * makes it explicit and provides a clear point for certificate validation.
 * 
 * Requirements: 15.2
 * 
 * @param options - HTTPS request options
 * @param callback - Response callback
 * @returns HTTPS ClientRequest
 */
export function createSecureRequest(
  options: https.RequestOptions,
  callback?: (res: import('http').IncomingMessage) => void,
): import('http').ClientRequest {
  // Ensure certificate validation is enabled (default behavior)
  // rejectUnauthorized: true is the default, but we set it explicitly
  const secureOptions: https.RequestOptions = {
    ...options,
    rejectUnauthorized: true,
  }

  return https.request(secureOptions, callback)
}

/**
 * Validates a URL for backend API calls in development mode.
 * 
 * In development, we allow HTTP for localhost only.
 * In production, HTTPS is always required.
 * 
 * Requirements: 15.1
 * 
 * @param urlString - The URL to validate
 * @param isDev - Whether running in development mode
 * @returns Object with validation result and error message if invalid
 */
export function validateBackendUrlWithDevMode(
  urlString: string,
  isDev: boolean,
): { valid: boolean; error?: string } {
  try {
    const parsed = new url.URL(urlString)
    
    // In development, allow HTTP for localhost only
    if (isDev && parsed.protocol === 'http:') {
      const hostname = parsed.hostname.toLowerCase()
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return { valid: true }
      }
      return {
        valid: false,
        error: `HTTP is only allowed for localhost in development mode: ${urlString}`,
      }
    }

    // In production or for non-localhost, require HTTPS
    return validateBackendUrl(urlString)
  } catch {
    return {
      valid: false,
      error: `Invalid backend URL: ${urlString}`,
    }
  }
}
