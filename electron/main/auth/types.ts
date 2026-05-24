/**
 * Types for Microsoft Authentication (Device Code Flow)
 * Requirements: 8.1, 8.2, 8.6, 8.7, 8.8
 */

/**
 * Result from initiating the Device Code Flow.
 * Contains the information needed to display to the user.
 */
export interface DeviceCodeResult {
  /** The device code used for polling the token endpoint */
  deviceCode: string;
  /** The short code the user must enter at the verification URI */
  userCode: string;
  /** The URL the user must visit to authenticate */
  verificationUri: string;
  /** How long (in seconds) until the device code expires */
  expiresIn: number;
  /** Recommended polling interval in seconds */
  interval: number;
}

/**
 * Microsoft OAuth tokens returned after successful authentication.
 */
export interface AuthTokens {
  /** OAuth 2.0 access token for Minecraft/Xbox services */
  accessToken: string;
  /** OAuth 2.0 refresh token for renewing the access token */
  refreshToken: string;
  /** Unix timestamp (ms) when the access token expires */
  expiresAt: number;
  /** Microsoft account UUID (used as Minecraft player UUID) */
  userId: string;
  /** Minecraft access token (separate from Microsoft access token). */
  minecraftAccessToken?: string;
  /** Minecraft profile (UUID + username) once the chain completes. */
  minecraft?: {
    id: string;
    name: string;
  };
}

/**
 * Error codes returned by the Microsoft token endpoint during polling.
 */
export type DeviceCodeErrorCode =
  | 'authorization_pending'   // User hasn't authenticated yet — keep polling
  | 'authorization_declined'  // User explicitly denied the request
  | 'expired_token'           // Device code has expired
  | 'bad_verification_code';  // Invalid device code

/**
 * Structured error for authentication failures.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
