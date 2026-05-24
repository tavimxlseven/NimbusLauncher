/**
 * UpdateService — Check for launcher updates on startup
 *
 * Fetches version information from the Backend_API and compares with the local
 * launcher version to determine if an update is required or available.
 *
 * Handles:
 *   - Mandatory updates (local version < minimum required version)
 *   - Optional updates (local version < current version but >= minimum)
 *   - Network errors gracefully with safe defaults
 *
 * Requirements: 7.1, 7.4, 7.5, 7.6, 7.7, 7.8, 13.1, 13.2, 13.3, 13.4
 */

import * as https from 'https';
import * as http from 'http';
import { compareVersions } from '../utils/semver.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Version information returned by the Backend_API.
 */
export interface VersionInfo {
  /** Latest available version (semver format, e.g., "1.2.3") */
  current: string;
  /** Minimum required version (semver format) */
  minimum: string;
  /** URL to download page for the update */
  downloadUrl: string;
  /** Optional markdown release notes */
  releaseNotes?: string;
}

/**
 * Result of checking for updates.
 */
export interface UpdateCheckResult {
  /** True if update is mandatory (local version < minimum) */
  updateRequired: boolean;
  /** True if update is available (local version < current) */
  updateAvailable: boolean;
  /** Version information from the backend */
  versionInfo: VersionInfo;
}

// ---------------------------------------------------------------------------
// UpdateService
// ---------------------------------------------------------------------------

/**
 * Service for checking launcher updates.
 *
 * Instantiate with the base URL of the Backend_API and the local launcher version.
 * Call checkForUpdates() on application startup to determine if an update is needed.
 *
 * Requirements: 7.1, 7.4, 7.5, 7.6, 7.7, 7.8, 13.1, 13.2, 13.3, 13.4
 */
export class UpdateService {
  private readonly baseUrl: string;
  private readonly localVersion: string;
  private readonly timeout: number;

  /**
   * Creates a new UpdateService instance.
   *
   * @param baseUrl - Base URL of the Backend_API (e.g., "https://nimbusgg.me")
   * @param localVersion - Current launcher version (semver format, e.g., "0.1.0")
   * @param timeout - Request timeout in milliseconds (default: 5000ms)
   */
  constructor(
    baseUrl: string,
    localVersion: string,
    timeout: number = 5000,
  ) {
    // Normalize: strip trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.localVersion = localVersion;
    this.timeout = timeout;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Checks for launcher updates by fetching version information from the backend.
   *
   * Returns an UpdateCheckResult indicating whether an update is required or available.
   * If the backend is unreachable or returns invalid data, returns a safe default
   * (no update required) to allow the launcher to continue functioning.
   *
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 13.1, 13.2, 13.3
   *
   * @returns Promise resolving to UpdateCheckResult
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    try {
      // Fetch version info from backend with timeout
      const versionInfo = await this._fetchVersionInfo();

      // Validate version format
      if (!this._isValidSemver(versionInfo.current) || !this._isValidSemver(versionInfo.minimum)) {
        console.warn('[UpdateService] Invalid version format from backend, using safe default');
        return this._safeDefault();
      }

      // Compare local version with minimum and current versions
      const updateRequired = compareVersions(this.localVersion, versionInfo.minimum) < 0;
      const updateAvailable = compareVersions(this.localVersion, versionInfo.current) < 0;

      return {
        updateRequired,
        updateAvailable,
        versionInfo,
      };
    } catch (error) {
      // Log error for debugging but don't block launcher startup
      console.error('[UpdateService] Failed to check for updates:', error);
      return this._safeDefault();
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Fetches version information from the Backend_API.
   *
   * GET /api/v1/launcher/version
   *
   * Requirements: 7.2, 13.3
   *
   * @returns Promise resolving to VersionInfo
   * @throws Error if request fails or times out
   */
  private async _fetchVersionInfo(): Promise<VersionInfo> {
    const path = '/api/v1/launcher/version';
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(this.baseUrl + path);
    } catch {
      throw new Error(`Invalid URL: ${this.baseUrl + path}`);
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    };

    const { statusCode, responseBody } = await new Promise<{
      statusCode: number;
      responseBody: string;
    }>((resolve, reject) => {
      const req = transport.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, responseBody: data });
        });
      });

      req.on('error', (err: Error) => {
        reject(new Error(`Network error: ${err.message}`));
      });

      req.setTimeout(this.timeout, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.end();
    });

    // Check for successful response
    if (statusCode !== 200) {
      throw new Error(`Backend returned status ${statusCode}`);
    }

    // Parse JSON response
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseBody);
    } catch {
      throw new Error(`Invalid JSON response from backend`);
    }

    // Validate response structure
    const response = parsed as {
      data?: {
        current?: string;
        minimum?: string;
        download_url?: string;
        release_notes?: string;
      };
    };

    if (!response.data?.current || !response.data?.minimum || !response.data?.download_url) {
      throw new Error('Missing required fields in version info response');
    }

    return {
      current: response.data.current,
      minimum: response.data.minimum,
      downloadUrl: response.data.download_url,
      releaseNotes: response.data.release_notes,
    };
  }

  /**
   * Returns a safe default UpdateCheckResult when the backend is unreachable.
   *
   * This allows the launcher to continue functioning even if the update check fails.
   *
   * Requirements: 7.8, 13.1
   *
   * @returns Safe default UpdateCheckResult (no update required)
   */
  private _safeDefault(): UpdateCheckResult {
    return {
      updateRequired: false,
      updateAvailable: false,
      versionInfo: {
        current: this.localVersion,
        minimum: this.localVersion,
        downloadUrl: '',
      },
    };
  }

  /**
   * Validates that a version string follows semver format (MAJOR.MINOR.PATCH).
   *
   * Requirements: 13.2
   *
   * @param version - Version string to validate
   * @returns True if valid semver format, false otherwise
   */
  private _isValidSemver(version: string): boolean {
    const semverPattern = /^\d+\.\d+\.\d+$/;
    return semverPattern.test(version);
  }
}
