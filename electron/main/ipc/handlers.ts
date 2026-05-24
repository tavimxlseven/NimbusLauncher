/**
 * IPC Handlers — Main ↔ Renderer communication
 *
 * Registers all Electron IPC handlers that expose main-process capabilities
 * to the renderer process. Covers:
 *   - Authentication (Microsoft Device Code Flow + Offline mode)
 *   - Download management (enqueue, progress, verify)
 *   - Profile management (CRUD + removal preview)
 *   - Theme synchronisation with Backend_API (≤ 5s, retry on next launch)
 *
 * All handlers follow the pattern:
 *   ipcMain.handle(channel, async (_event, ...args) => result)
 *
 * Errors are serialised to plain objects before being sent to the renderer
 * (Electron cannot serialise Error instances across the IPC bridge).
 *
 * Requirements: 10.2, 10.3, 10.4
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MicrosoftAuthManager } from '../auth/MicrosoftAuthManager.js';
import { OfflineAuthManager } from '../auth/OfflineAuthManager.js';
import { KeychainService } from '../auth/KeychainService.js';
import { DownloadManager, type DownloadItem, type DownloadProgress } from '../download/DownloadManager.js';
import { ProfileManager } from '../profile/ProfileManager.js';
import { JavaDetector } from '../profile/JavaDetector.js';
import { type CreateProfileInput, type UpdateProfileInput } from '../profile/types.js';
import { BackendAPIClient, type AddLibraryItemPayload } from '../api/BackendAPIClient.js';
import { UpdateService } from '../api/UpdateService.js';

// ---------------------------------------------------------------------------
// IPC channel names (shared with renderer via preload)
// ---------------------------------------------------------------------------

export const IPC_CHANNELS = {
  // Auth — Microsoft
  AUTH_START_DEVICE_CODE: 'auth:startDeviceCodeFlow',
  AUTH_POLL_FOR_TOKEN: 'auth:pollForToken',
  AUTH_REFRESH_TOKEN: 'auth:refreshToken',
  AUTH_STORE_TOKENS: 'auth:storeTokens',
  AUTH_LOAD_TOKENS: 'auth:loadTokens',
  AUTH_DELETE_TOKENS: 'auth:deleteTokens',

  // Auth — Offline
  AUTH_VALIDATE_USERNAME: 'auth:validateUsername',
  AUTH_CREATE_OFFLINE_PROFILE: 'auth:createOfflineProfile',

  // Download
  DOWNLOAD_ENQUEUE: 'download:enqueue',
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_PROGRESS: 'download:progress', // renderer-bound event (not a handler)

  // Profile
  PROFILE_LIST: 'profile:list',
  PROFILE_GET: 'profile:get',
  PROFILE_CREATE: 'profile:create',
  PROFILE_UPDATE: 'profile:update',
  PROFILE_PREVIEW_REMOVAL: 'profile:previewRemoval',
  PROFILE_REMOVE: 'profile:remove',

  // Java
  JAVA_DETECT_ALL: 'java:detectAll',
  JAVA_CHECK_COMPATIBILITY: 'java:checkCompatibility',

  // Theme
  THEME_SYNC: 'theme:sync',
  THEME_GET_PENDING: 'theme:getPending',

  // Library (Backend_API — authenticated)
  LIBRARY_GET: 'library:get',
  LIBRARY_ADD: 'library:add',
  LIBRARY_REMOVE: 'library:remove',

  // Modpack manifest (Backend_API — authenticated)
  MODPACK_GET_MANIFEST: 'modpack:getManifest',

  // Update check
  UPDATE_CHECK: 'update:check',
  UPDATE_GET_VERSION: 'update:getVersion',
} as const;

// ---------------------------------------------------------------------------
// Theme sync persistence
// ---------------------------------------------------------------------------

const PENDING_THEME_FILE = path.join(os.homedir(), '.nimbus-launcher', 'pending-theme-sync.json');

interface PendingThemeSync {
  theme: ThemeSyncPayload;
  timestamp: string;
}

export interface ThemeSyncPayload {
  themePreference: 'light' | 'dark' | 'system';
  themeColor: string;
}

// ---------------------------------------------------------------------------
// IpcBridge — abstraction over ipcMain for testability
// ---------------------------------------------------------------------------

/**
 * Minimal interface that mirrors the subset of Electron's `ipcMain` used here.
 * Using this interface allows unit tests to inject a mock without importing
 * Electron (which is unavailable in the Jest test environment).
 */
export interface IpcMainBridge {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown,
  ): void;
  on(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): void;
}

/**
 * Minimal interface for the BrowserWindow used to push progress events.
 */
export interface WebContentsBridge {
  send(channel: string, ...args: unknown[]): void;
  isDestroyed(): boolean;
}

// ---------------------------------------------------------------------------
// IpcHandlerRegistry
// ---------------------------------------------------------------------------

/**
 * Registers all IPC handlers on the provided `ipcMain`-compatible bridge.
 *
 * Accepts optional service instances for dependency injection (useful in
 * tests). When omitted, real instances are created.
 *
 * Requirements: 10.2, 10.3, 10.4
 */
export class IpcHandlerRegistry {
  private readonly authManager: MicrosoftAuthManager;
  private readonly offlineAuth: OfflineAuthManager;
  private readonly keychainService: KeychainService;
  private readonly downloadManager: DownloadManager;
  private readonly profileManager: ProfileManager;
  private readonly javaDetector: JavaDetector;
  private readonly backendAPIClient: BackendAPIClient;
  private readonly updateService: UpdateService;
  private readonly localVersion: string;

  constructor(deps?: {
    authManager?: MicrosoftAuthManager;
    offlineAuth?: OfflineAuthManager;
    keychainService?: KeychainService;
    downloadManager?: DownloadManager;
    profileManager?: ProfileManager;
    javaDetector?: JavaDetector;
    backendAPIClient?: BackendAPIClient;
    updateService?: UpdateService;
    backendUrl?: string;
    localVersion?: string;
  }) {
    this.authManager = deps?.authManager ?? new MicrosoftAuthManager();
    this.offlineAuth = deps?.offlineAuth ?? new OfflineAuthManager();
    this.keychainService = deps?.keychainService ?? new KeychainService();
    this.downloadManager = deps?.downloadManager ?? new DownloadManager();
    this.profileManager = deps?.profileManager ?? new ProfileManager();
    this.javaDetector = deps?.javaDetector ?? new JavaDetector();
    const backendUrl = deps?.backendUrl ?? process.env['BACKEND_API_URL'] ?? 'http://localhost:3000';
    this.backendAPIClient = deps?.backendAPIClient ?? new BackendAPIClient(backendUrl, {
      keychainService: this.keychainService,
      authManager: this.authManager,
    });
    this.localVersion = deps?.localVersion ?? '0.1.0'; // Default version, should be read from package.json
    this.updateService = deps?.updateService ?? new UpdateService(backendUrl, this.localVersion);
  }

  /**
   * Registers all handlers on the given IPC bridge.
   *
   * @param ipc     - The ipcMain bridge (real or mock).
   * @param webContents - Optional BrowserWindow webContents for push events.
   */
  register(ipc: IpcMainBridge, webContents?: WebContentsBridge): void {
    this._registerAuthHandlers(ipc);
    this._registerDownloadHandlers(ipc, webContents);
    this._registerProfileHandlers(ipc);
    this._registerJavaHandlers(ipc);
    this._registerThemeHandlers(ipc);
    this._registerLibraryHandlers(ipc);
    this._registerModpackHandlers(ipc);
    this._registerUpdateHandlers(ipc);
  }

  // -------------------------------------------------------------------------
  // Auth handlers
  // -------------------------------------------------------------------------

  private _registerAuthHandlers(ipc: IpcMainBridge): void {
    // Microsoft — start Device Code Flow
    ipc.handle(IPC_CHANNELS.AUTH_START_DEVICE_CODE, async () => {
      return this._wrap(() => this.authManager.startDeviceCodeFlow());
    });

    // Microsoft — poll for token
    // We persist tokens server-side here (in addition to whatever the
    // renderer does) so a renderer crash mid-poll doesn't lose the auth.
    ipc.handle(IPC_CHANNELS.AUTH_POLL_FOR_TOKEN, async (_event, deviceCode: unknown, interval: unknown) => {
      return this._wrap(async () => {
        const tokens = await this.authManager.pollForToken(
          String(deviceCode),
          typeof interval === 'number' ? interval : undefined,
        );
        try { await this.authManager.storeTokens(tokens) } catch { /* ignore */ }
        return tokens;
      });
    });

    // Microsoft — refresh token (also persists the refreshed tokens).
    ipc.handle(IPC_CHANNELS.AUTH_REFRESH_TOKEN, async (_event, refreshToken: unknown) => {
      return this._wrap(async () => {
        const tokens = await this.authManager.refreshToken(String(refreshToken));
        try { await this.authManager.storeTokens(tokens) } catch { /* ignore */ }
        return tokens;
      });
    });

    // Store tokens. Uses the auth manager (which writes BOTH keychain and
    // a file fallback) so storage works even when keytar is unavailable on
    // the host (some Windows installs).
    ipc.handle(IPC_CHANNELS.AUTH_STORE_TOKENS, async (_event, tokens: unknown) => {
      return this._wrap(() => this.authManager.storeTokens(tokens as Parameters<MicrosoftAuthManager['storeTokens']>[0]));
    });

    // Load tokens via the auth manager (keychain → file fallback).
    ipc.handle(IPC_CHANNELS.AUTH_LOAD_TOKENS, async () => {
      return this._wrap(() => this.authManager.loadTokens());
    });

    // Delete tokens (clears both keychain entry and file fallback).
    ipc.handle(IPC_CHANNELS.AUTH_DELETE_TOKENS, async () => {
      return this._wrap(async () => {
        try { await this.keychainService.deleteTokens() } catch { /* ignore */ }
        // Also remove the file fallback so a stale file doesn't auto-relogin.
        try {
          const file = path.join(os.homedir(), '.nimbus-launcher', 'auth-tokens.json')
          await fs.promises.unlink(file)
        } catch { /* ignore */ }
        return { success: true } as const
      });
    });

    // Offline — validate username
    ipc.handle(IPC_CHANNELS.AUTH_VALIDATE_USERNAME, (_event, username: unknown) => {
      return { success: true, data: this.offlineAuth.validateUsername(String(username)) };
    });

    // Offline — create profile
    ipc.handle(IPC_CHANNELS.AUTH_CREATE_OFFLINE_PROFILE, (_event, username: unknown) => {
      return this._wrapSync(() => this.offlineAuth.createProfile(String(username)));
    });
  }

  // -------------------------------------------------------------------------
  // Download handlers
  // -------------------------------------------------------------------------

  private _registerDownloadHandlers(ipc: IpcMainBridge, webContents?: WebContentsBridge): void {
    // Register progress callback once — pushes events to renderer.
    if (webContents) {
      this.downloadManager.onProgress((progress: DownloadProgress) => {
        if (!webContents.isDestroyed()) {
          webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, progress);
        }
      });
    }

    // Enqueue items
    ipc.handle(IPC_CHANNELS.DOWNLOAD_ENQUEUE, (_event, items: unknown) => {
      return this._wrapSync(() => {
        this.downloadManager.enqueue(items as DownloadItem[]);
        return null;
      });
    });

    // Start downloads — returns VerificationResult[]
    ipc.handle(IPC_CHANNELS.DOWNLOAD_START, async () => {
      return this._wrap(() => this.downloadManager.start());
    });
  }

  // -------------------------------------------------------------------------
  // Profile handlers
  // -------------------------------------------------------------------------

  private _registerProfileHandlers(ipc: IpcMainBridge): void {
    ipc.handle(IPC_CHANNELS.PROFILE_LIST, async () => {
      return this._wrap(() => this.profileManager.listProfiles());
    });

    ipc.handle(IPC_CHANNELS.PROFILE_GET, async (_event, id: unknown) => {
      return this._wrap(() => this.profileManager.getProfile(String(id)));
    });

    ipc.handle(IPC_CHANNELS.PROFILE_CREATE, async (_event, input: unknown) => {
      return this._wrap(() => this.profileManager.createProfile(input as CreateProfileInput));
    });

    ipc.handle(IPC_CHANNELS.PROFILE_UPDATE, async (_event, id: unknown, input: unknown) => {
      return this._wrap(() =>
        this.profileManager.updateProfile(String(id), input as UpdateProfileInput),
      );
    });

    // Preview removal (dry-run): confirmed=false returns file list without deleting.
    ipc.handle(IPC_CHANNELS.PROFILE_PREVIEW_REMOVAL, async (_event, id: unknown) => {
      return this._wrap(() => this.profileManager.removeProfile(String(id), false));
    });

    // Confirmed removal: deletes files and removes profile.
    ipc.handle(IPC_CHANNELS.PROFILE_REMOVE, async (_event, id: unknown) => {
      return this._wrap(() => this.profileManager.removeProfile(String(id), true));
    });
  }

  // -------------------------------------------------------------------------
  // Java handlers
  // -------------------------------------------------------------------------

  private _registerJavaHandlers(ipc: IpcMainBridge): void {
    ipc.handle(IPC_CHANNELS.JAVA_DETECT_ALL, async () => {
      return this._wrap(() => this.javaDetector.detectInstallations());
    });

    ipc.handle(IPC_CHANNELS.JAVA_CHECK_COMPATIBILITY, async (_event, minecraftVersion: unknown) => {
      return this._wrap(() =>
        this.javaDetector.checkCompatibility(String(minecraftVersion)),
      );
    });
  }

  // -------------------------------------------------------------------------
  // Library handlers (Backend_API — authenticated)
  // -------------------------------------------------------------------------

  /**
   * Registers IPC handlers for library operations via Backend_API.
   *
   * All library operations require a valid JWT token stored in KeychainService.
   * The BackendAPIClient handles token refresh on 401 automatically.
   *
   * Requirements: 4.1, 4.3, 4.4, 5.1, 5.2
   */
  private _registerLibraryHandlers(ipc: IpcMainBridge): void {
    // GET /api/v1/library — returns the user's library items
    ipc.handle(IPC_CHANNELS.LIBRARY_GET, async () => {
      return this._wrap(() => this.backendAPIClient.getLibrary());
    });

    // POST /api/v1/library — adds an item to the library
    ipc.handle(IPC_CHANNELS.LIBRARY_ADD, async (_event, item: unknown) => {
      return this._wrap(() =>
        this.backendAPIClient.addToLibrary(item as AddLibraryItemPayload),
      );
    });

    // DELETE /api/v1/library/:id — removes an item from the library
    ipc.handle(IPC_CHANNELS.LIBRARY_REMOVE, async (_event, id: unknown) => {
      return this._wrap(() =>
        this.backendAPIClient.removeFromLibrary(String(id)),
      );
    });
  }

  // -------------------------------------------------------------------------
  // Modpack manifest handlers (Backend_API — authenticated)
  // -------------------------------------------------------------------------

  /**
   * Registers IPC handlers for modpack manifest retrieval via Backend_API.
   *
   * The manifest endpoint returns a JSON document with mod identifiers,
   * exact versions, loader, Minecraft version and SHA-256 hashes.
   *
   * Requirements: 4.6, 5.1, 5.2
   */
  private _registerModpackHandlers(ipc: IpcMainBridge): void {
    // GET /api/v1/modpacks/:id/manifest?source=<source>
    ipc.handle(
      IPC_CHANNELS.MODPACK_GET_MANIFEST,
      async (_event, id: unknown, source: unknown) => {
        return this._wrap(() =>
          this.backendAPIClient.getModpackManifest(
            String(id),
            source as 'curseforge' | 'modrinth',
          ),
        );
      },
    );
  }

  // -------------------------------------------------------------------------
  // Update check handlers
  // -------------------------------------------------------------------------

  /**
   * Registers IPC handlers for launcher update checking.
   *
   * Exposes UpdateService functionality to the renderer process for checking
   * if a launcher update is required or available.
   *
   * Requirements: 7.1, 8.1
   */
  private _registerUpdateHandlers(ipc: IpcMainBridge): void {
    // Check for updates
    ipc.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
      return this._wrap(() => this.updateService.checkForUpdates());
    });

    // Get current launcher version
    ipc.handle(IPC_CHANNELS.UPDATE_GET_VERSION, async () => {
      return this._wrapSync(() => this.localVersion);
    });
  }

  // -------------------------------------------------------------------------
  // Theme sync handlers
  // -------------------------------------------------------------------------

  /**
   * Synchronises the user's theme preference with the Backend_API.
   *
   * Attempts the sync within 5 seconds. If it fails, persists the payload
   * to a local file so it can be retried on the next application launch.
   *
   * Requirements: 10.3, 10.4
   */
  private _registerThemeHandlers(ipc: IpcMainBridge): void {
    ipc.handle(IPC_CHANNELS.THEME_SYNC, async (_event, payload: unknown, backendUrl: unknown, accessToken: unknown) => {
      const themePayload = payload as ThemeSyncPayload;
      const url = String(backendUrl);
      const token = typeof accessToken === 'string' ? accessToken : null;

      const syncResult = await this._syncThemeWithBackend(themePayload, url, token);

      if (!syncResult.success) {
        // Persist for retry on next launch. Requirements: 10.4
        await this._savePendingThemeSync(themePayload);
      } else {
        // Clear any pending sync since we succeeded.
        await this._clearPendingThemeSync();
      }

      return { success: syncResult.success, error: syncResult.error ?? null };
    });

    // Returns any pending theme sync that failed on a previous launch.
    ipc.handle(IPC_CHANNELS.THEME_GET_PENDING, async () => {
      return this._wrap(() => this._loadPendingThemeSync());
    });
  }

  // -------------------------------------------------------------------------
  // Theme sync implementation
  // -------------------------------------------------------------------------

  /**
   * Sends a PATCH request to `PATCH /api/v1/users/me/preferences` with a
   * 5-second timeout.
   *
   * Requirements: 10.3
   */
  async _syncThemeWithBackend(
    payload: ThemeSyncPayload,
    backendUrl: string,
    accessToken: string | null,
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        theme_preference: payload.themePreference,
        theme_color: payload.themeColor,
      });

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(backendUrl);
      } catch {
        resolve({ success: false, error: `URL inválida: ${backendUrl}` });
        return;
      }

      const transport = parsedUrl.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      };

      const req = transport.request(options, (res) => {
        // Consume response body to free the socket.
        res.resume();
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 200 && statusCode < 300) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `HTTP ${statusCode}` });
        }
      });

      req.on('error', (err: Error) => {
        resolve({ success: false, error: err.message });
      });

      // 5-second timeout. Requirements: 10.3
      req.setTimeout(5_000, () => {
        req.destroy(new Error('Timeout ao sincronizar tema com Backend_API'));
      });

      req.write(body);
      req.end();
    });
  }

  // -------------------------------------------------------------------------
  // Pending theme sync persistence
  // -------------------------------------------------------------------------

  private async _savePendingThemeSync(theme: ThemeSyncPayload): Promise<void> {
    try {
      const dir = path.dirname(PENDING_THEME_FILE);
      await fs.promises.mkdir(dir, { recursive: true });
      const data: PendingThemeSync = { theme, timestamp: new Date().toISOString() };
      await fs.promises.writeFile(PENDING_THEME_FILE, JSON.stringify(data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
    } catch {
      // Ignore persistence errors — best effort.
    }
  }

  private async _loadPendingThemeSync(): Promise<PendingThemeSync | null> {
    try {
      const raw = await fs.promises.readFile(PENDING_THEME_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (this._isValidPendingSync(parsed)) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  private async _clearPendingThemeSync(): Promise<void> {
    try {
      await fs.promises.unlink(PENDING_THEME_FILE);
    } catch {
      // File may not exist — ignore.
    }
  }

  private _isValidPendingSync(value: unknown): value is PendingThemeSync {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    if (typeof obj['timestamp'] !== 'string') return false;
    const theme = obj['theme'];
    if (typeof theme !== 'object' || theme === null) return false;
    const t = theme as Record<string, unknown>;
    return (
      typeof t['themePreference'] === 'string' &&
      typeof t['themeColor'] === 'string'
    );
  }

  // -------------------------------------------------------------------------
  // Error serialisation helpers
  // -------------------------------------------------------------------------

  /**
   * Wraps an async operation, catching errors and returning a serialisable
   * result object: `{ success: true, data }` or `{ success: false, error }`.
   */
  private async _wrap<T>(fn: () => Promise<T>): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const data = await fn();
      return { success: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Synchronous variant of `_wrap`.
   */
  private _wrapSync<T>(fn: () => T): { success: boolean; data?: T; error?: string } {
    try {
      const data = fn();
      return { success: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Creates and registers all IPC handlers.
 *
 * Usage in the Electron main process:
 * ```ts
 * import { ipcMain, BrowserWindow } from 'electron';
 * import { registerIpcHandlers } from './ipc/handlers.js';
 *
 * const win = new BrowserWindow({ ... });
 * registerIpcHandlers(ipcMain, win.webContents);
 * ```
 *
 * Requirements: 10.2, 10.3, 10.4
 */
export function registerIpcHandlers(
  ipc: IpcMainBridge,
  webContents?: WebContentsBridge,
): IpcHandlerRegistry {
  const registry = new IpcHandlerRegistry();
  registry.register(ipc, webContents);
  return registry;
}
