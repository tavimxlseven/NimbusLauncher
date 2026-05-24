/**
 * BackendAPIClient — HTTPS + JWT communication with the Backend_API
 *
 * Provides typed methods for the Electron main process to communicate with
 * the Rails Backend_API using Bearer JWT tokens retrieved from KeychainService.
 *
 * Handles:
 *   - 401 Unauthorized → triggers token refresh via MicrosoftAuthManager
 *   - 503 Service Unavailable → throws BackendAPIError with descriptive message
 *
 * All requests are made from the main process (never the renderer), keeping
 * the JWT token out of the renderer context.
 *
 * Requirements: 4.6, 4.7, 5.1, 5.2
 */

import * as https from 'https';
import * as http from 'http';
import { KeychainService } from '../auth/KeychainService.js';
import { MicrosoftAuthManager } from '../auth/MicrosoftAuthManager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single item in the user's library. */
export interface LibraryItem {
  id: string | number;
  source: 'curseforge' | 'modrinth';
  external_id: string;
  item_type: 'mod' | 'modpack';
  name: string;
  version?: string | null;
  added_at?: string | null;
}

/** Payload for adding an item to the library. */
export interface AddLibraryItemPayload {
  source: 'curseforge' | 'modrinth';
  external_id: string;
  item_type: 'mod' | 'modpack';
  name: string;
  version?: string;
}

/** A single mod entry in the installation manifest. */
export interface ManifestMod {
  source: 'curseforge' | 'modrinth';
  project_id: string;
  version_id: string;
  filename: string | null;
  sha256: string | null;
}

/** Installation manifest returned by GET /api/v1/modpacks/:id/manifest */
export interface InstallationManifest {
  format_version: number;
  name: string;
  minecraft_version: string;
  loader: string;
  loader_version: string | null;
  mods: ManifestMod[];
  generated_at: string;
}

/** Standard API response envelope. */
interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
  errors?: Array<{ message: string; code?: string; field?: string }>;
}

/** Error thrown when the Backend_API returns an error response. */
export class BackendAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errors?: Array<{ message: string; code?: string }>,
  ) {
    super(message);
    this.name = 'BackendAPIError';
  }
}

// ---------------------------------------------------------------------------
// BackendAPIClient
// ---------------------------------------------------------------------------

/**
 * HTTP client for the Backend_API.
 *
 * Instantiate with the base URL of the Backend_API (e.g. https://api.example.com).
 * The client automatically attaches the JWT Bearer token from KeychainService
 * to every authenticated request.
 *
 * Requirements: 4.6, 5.1, 5.2
 */
export class BackendAPIClient {
  private readonly baseUrl: string;
  private readonly keychainService: KeychainService;
  private readonly authManager: MicrosoftAuthManager;

  /** Number of times a 401 refresh has been attempted in the current call chain. */
  private _refreshAttempts = 0;

  constructor(
    baseUrl: string,
    deps?: {
      keychainService?: KeychainService;
      authManager?: MicrosoftAuthManager;
    },
  ) {
    // Normalise: strip trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.keychainService = deps?.keychainService ?? new KeychainService();
    this.authManager = deps?.authManager ?? new MicrosoftAuthManager();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the authenticated user's library items.
   *
   * GET /api/v1/library
   * Requires: JWT Bearer token
   *
   * Requirements: 4.4
   */
  async getLibrary(): Promise<LibraryItem[]> {
    const response = await this._request<ApiResponse<LibraryItem[]>>(
      'GET',
      '/api/v1/library',
      { authenticated: true },
    );
    return response.data;
  }

  /**
   * Adds an item to the authenticated user's library.
   *
   * POST /api/v1/library
   * Requires: JWT Bearer token
   *
   * Requirements: 4.1
   */
  async addToLibrary(item: AddLibraryItemPayload): Promise<LibraryItem> {
    const response = await this._request<ApiResponse<LibraryItem>>(
      'POST',
      '/api/v1/library',
      { authenticated: true, body: { library_item: item } },
    );
    return response.data;
  }

  /**
   * Removes an item from the authenticated user's library.
   *
   * DELETE /api/v1/library/:id
   * Requires: JWT Bearer token
   *
   * Requirements: 4.3
   */
  async removeFromLibrary(id: string | number): Promise<void> {
    await this._request<void>(
      'DELETE',
      `/api/v1/library/${id}`,
      { authenticated: true },
    );
  }

  /**
   * Fetches the installation manifest for a modpack.
   *
   * GET /api/v1/modpacks/:id/manifest?source=<source>
   * Requires: JWT Bearer token
   *
   * The manifest includes mod identifiers, exact versions, loader,
   * Minecraft version and SHA-256 hashes for each file.
   *
   * Requirements: 4.6
   */
  async getModpackManifest(
    id: string,
    source: 'curseforge' | 'modrinth',
  ): Promise<InstallationManifest> {
    const response = await this._request<ApiResponse<InstallationManifest>>(
      'GET',
      `/api/v1/modpacks/${encodeURIComponent(id)}/manifest?source=${encodeURIComponent(source)}`,
      { authenticated: true },
    );
    return response.data;
  }

  // -------------------------------------------------------------------------
  // Private HTTP helpers
  // -------------------------------------------------------------------------

  /**
   * Performs an HTTP(S) request to the Backend_API.
   *
   * Automatically attaches the Bearer token when `authenticated: true`.
   * On 401, attempts a single token refresh and retries.
   * On 503, throws BackendAPIError with a descriptive message.
   */
  private async _request<T>(
    method: string,
    path: string,
    options: {
      authenticated?: boolean;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const { authenticated = false, body } = options;

    let accessToken: string | null = null;
    if (authenticated) {
      const tokens = await this.keychainService.loadTokens();
      accessToken = tokens?.accessToken ?? null;
    }

    const result = await this._doRequest<T>(method, path, {
      accessToken,
      body,
    });

    return result;
  }

  /**
   * Executes the raw HTTP request and handles 401 refresh + 503 errors.
   */
  private async _doRequest<T>(
    method: string,
    path: string,
    options: {
      accessToken: string | null;
      body?: unknown;
    },
  ): Promise<T> {
    const { accessToken, body } = options;

    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(this.baseUrl + path);
    } catch {
      throw new BackendAPIError(`URL inválida: ${this.baseUrl + path}`, 0);
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const headers: Record<string, string | number> = {
      Accept: 'application/json',
    };

    if (bodyStr !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers,
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
        reject(new BackendAPIError(`Erro de rede: ${err.message}`, 0));
      });

      req.setTimeout(10_000, () => {
        req.destroy(new Error('Timeout ao conectar com Backend_API'));
      });

      if (bodyStr !== undefined) {
        req.write(bodyStr);
      }
      req.end();
    });

    // ── 204 No Content ──────────────────────────────────────────────────────
    if (statusCode === 204) {
      return undefined as unknown as T;
    }

    // ── 401 Unauthorized — attempt token refresh once ───────────────────────
    if (statusCode === 401) {
      if (this._refreshAttempts < 1) {
        this._refreshAttempts++;
        const refreshedToken = await this._refreshAccessToken();
        if (refreshedToken) {
          return this._doRequest<T>(method, path, {
            accessToken: refreshedToken,
            body,
          });
        }
      }
      throw new BackendAPIError(
        'Não autorizado. Por favor, faça login novamente.',
        401,
      );
    }

    // Reset refresh counter on non-401 responses
    this._refreshAttempts = 0;

    // ── 503 Service Unavailable ─────────────────────────────────────────────
    if (statusCode === 503) {
      let serviceName = 'Backend_API';
      try {
        const parsed = JSON.parse(responseBody) as {
          errors?: Array<{ service?: string; message?: string }>;
        };
        serviceName = parsed.errors?.[0]?.service ?? serviceName;
      } catch {
        // Ignore parse errors — use default service name
      }
      throw new BackendAPIError(
        `Serviço indisponível: ${serviceName}`,
        503,
      );
    }

    // ── Parse JSON response ─────────────────────────────────────────────────
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseBody);
    } catch {
      throw new BackendAPIError(
        `Resposta inválida do servidor (status ${statusCode})`,
        statusCode,
      );
    }

    // ── Error responses (4xx / 5xx) ─────────────────────────────────────────
    if (statusCode >= 400) {
      const errorResponse = parsed as {
        errors?: Array<{ message: string; code?: string }>;
      };
      const errors = errorResponse.errors ?? [];
      const message =
        errors[0]?.message ?? `Erro HTTP ${statusCode}`;
      throw new BackendAPIError(message, statusCode, errors);
    }

    return parsed as T;
  }

  /**
   * Attempts to refresh the access token using the stored refresh token.
   * Returns the new access token, or null if refresh fails.
   */
  private async _refreshAccessToken(): Promise<string | null> {
    try {
      const tokens = await this.keychainService.loadTokens();
      if (!tokens?.refreshToken) return null;

      const newTokens = await this.authManager.refreshToken(tokens.refreshToken);
      await this.keychainService.storeTokens(newTokens);
      return newTokens.accessToken;
    } catch {
      return null;
    }
  }
}
