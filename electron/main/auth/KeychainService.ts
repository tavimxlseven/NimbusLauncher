/**
 * KeychainService — OS-native credential storage
 *
 * Stores and retrieves Microsoft authentication tokens using the operating
 * system's native secure credential store:
 *   - macOS:   Keychain
 *   - Windows: Credential Manager
 *   - Linux:   libsecret (via Secret Service API)
 *
 * Uses the `keytar` npm package for cross-platform keychain access.
 * Falls back gracefully when keytar is unavailable (e.g. in test environments
 * where native bindings are not compiled): loadTokens returns null, storeTokens
 * and deleteTokens are no-ops.
 *
 * Requirements: 8.2
 */

import type { AuthTokens } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The service name used as the keychain namespace. */
const SERVICE_NAME = 'NimbusLauncher';

/** The account key under which the serialised tokens are stored. */
const ACCOUNT_NAME = 'microsoft-auth';

// ---------------------------------------------------------------------------
// Keytar lazy-loader
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the subset of keytar we use.
 * Defined here so we can type the dynamically-imported module without
 * depending on @types/keytar at compile time.
 */
interface KeytarModule {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

/**
 * Attempts to load keytar at runtime.
 * Returns null if the native module is unavailable (missing binary, test env, etc.).
 */
async function loadKeytar(): Promise<KeytarModule | null> {
  try {
    // Dynamic import so that a missing native binary does not crash the process
    // at startup — it only fails when the service is first used.
    const mod = await import('keytar') as KeytarModule;
    return mod;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// KeychainService
// ---------------------------------------------------------------------------

export class KeychainService {
  /**
   * Stores authentication tokens in the OS keychain.
   *
   * Tokens are serialised as a JSON string and stored under the fixed
   * service/account pair so they can be retrieved across process restarts.
   *
   * If keytar is unavailable, this method is a no-op (tokens are not stored).
   *
   * Requirements: 8.2
   *
   * @param tokens - The AuthTokens object to persist.
   */
  async storeTokens(tokens: AuthTokens): Promise<void> {
    const keytar = await loadKeytar();
    if (!keytar) {
      // Graceful degradation: keytar not available, skip storage.
      return;
    }

    try {
      const serialised = JSON.stringify(tokens);
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, serialised);
    } catch {
      // Graceful degradation: keychain operation failed (e.g. locked keychain).
    }
  }

  /**
   * Retrieves authentication tokens from the OS keychain.
   *
   * Returns null if:
   *   - keytar is unavailable
   *   - no tokens have been stored yet
   *   - the stored value cannot be deserialised into a valid AuthTokens object
   *
   * Requirements: 8.2
   */
  async loadTokens(): Promise<AuthTokens | null> {
    const keytar = await loadKeytar();
    if (!keytar) {
      return null;
    }

    let raw: string | null;
    try {
      raw = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    } catch {
      return null;
    }

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidAuthTokens(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Deletes authentication tokens from the OS keychain.
   *
   * If keytar is unavailable or no tokens are stored, this method is a no-op.
   *
   * Requirements: 8.2
   */
  async deleteTokens(): Promise<void> {
    const keytar = await loadKeytar();
    if (!keytar) {
      return;
    }

    try {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    } catch {
      // Ignore errors on delete (e.g. entry not found).
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Type guard that validates the shape of a deserialised AuthTokens object.
 */
function isValidAuthTokens(value: unknown): value is AuthTokens {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['accessToken'] === 'string' &&
    typeof obj['refreshToken'] === 'string' &&
    typeof obj['expiresAt'] === 'number' &&
    typeof obj['userId'] === 'string'
  );
}
