/**
 * OfflineAuthManager — Offline (non-Microsoft) authentication
 *
 * Provides username validation and deterministic UUID generation for players
 * who launch Minecraft without a Microsoft account ("pirate" / offline mode).
 *
 * Username rules (Requirement 8.3):
 *   - 3 to 16 characters
 *   - Only alphanumeric characters (a-z, A-Z, 0-9) and underscores (_)
 *   - Regex: /^[a-zA-Z0-9_]{3,16}$/
 *
 * UUID generation (Requirement 8.4):
 *   - UUID v3 (name-based, MD5) using the DNS namespace
 *   - Deterministic: the same username always produces the same UUID
 *   - Matches the behaviour of many third-party launchers
 *
 * Requirements: 8.3, 8.4
 */

import { v3 as uuidV3 } from 'uuid';

// UUID DNS namespace — used for deterministic UUID v3 generation.
// This is the well-known DNS namespace UUID as defined in RFC 4122.
const UUID_DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Offline player profile used when launching Minecraft without a Microsoft
 * account. Passed as launch arguments to the Minecraft process.
 *
 * Requirements: 8.4
 */
export interface OfflineProfile {
  /** The player's chosen username (validated, 3–16 alphanumeric/underscore). */
  username: string;
  /** UUID v3 derived deterministically from the username (DNS namespace). */
  uuid: string;
  /** Discriminator that identifies this as an offline (non-Microsoft) profile. */
  type: 'offline';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Regex that defines a valid offline username.
 * Exactly 3–16 characters, each being a letter, digit, or underscore.
 *
 * Requirements: 8.3
 */
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,16}$/;

// ---------------------------------------------------------------------------
// OfflineAuthManager
// ---------------------------------------------------------------------------

export class OfflineAuthManager {
  /**
   * Validates an offline username.
   *
   * Returns true if the username matches /^[a-zA-Z0-9_]{3,16}$/, false
   * otherwise. This covers all rejection cases: empty string, too short,
   * too long, spaces, special characters, unicode, etc.
   *
   * Requirements: 8.3
   *
   * @param username - The username string to validate.
   */
  validateUsername(username: string): boolean {
    return USERNAME_REGEX.test(username);
  }

  /**
   * Generates a deterministic UUID v3 from a username.
   *
   * Uses the DNS namespace as specified in the design document. The same
   * username will always produce the same UUID, which is important for
   * consistent player identity across sessions.
   *
   * Requirements: 8.4
   *
   * @param username - The username to derive the UUID from.
   *                   Does NOT need to be valid — callers should validate first.
   */
  generateUUID(username: string): string {
    return uuidV3(username, UUID_DNS_NAMESPACE);
  }

  /**
   * Creates a complete offline player profile for use as Minecraft launch
   * arguments.
   *
   * Throws a TypeError if the username is invalid, so callers must validate
   * before calling this method (or catch the error).
   *
   * Requirements: 8.3, 8.4
   *
   * @param username - A validated offline username.
   */
  createProfile(username: string): OfflineProfile {
    if (!this.validateUsername(username)) {
      throw new TypeError(
        `Invalid offline username "${username}". ` +
        'Must be 3–16 alphanumeric characters or underscores.',
      );
    }

    return {
      username,
      uuid: this.generateUUID(username),
      type: 'offline',
    };
  }
}
