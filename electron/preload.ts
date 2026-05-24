/**
 * Electron preload script — exposes safe IPC bridge to the renderer.
 *
 * Uses contextBridge to expose a typed API without enabling nodeIntegration.
 * The renderer accesses this via window.nimbus.*
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './main/ipc/handlers.js'

// Re-export channel names so the renderer can import them
export { IPC_CHANNELS }

// Typed API exposed to the renderer
const nimbusAPI = {
  // Window controls (custom titlebar)
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },

  // Open URL in system browser
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Open a local folder in the OS file explorer
  openFolder: (p: string) => ipcRenderer.invoke('shell:openFolder', p),

  // Get the on-disk path of a modpack instance (.minecraft dir)
  instancePath: (modpackId: string) => ipcRenderer.invoke('instance:path', modpackId),

  // Listen for deep link auth token (nimbus://auth?token=XXX)
  onAuthToken: (cb: (token: string) => void) => {
    ipcRenderer.on('deep-link:auth-token', (_e, token: string) => cb(token))
    return () => ipcRenderer.removeAllListeners('deep-link:auth-token')
  },

  // Launcher session — long-lived bearer token issued by /api/v1/launcher/poll.
  // Stored in OS keychain via the main process.
  session: {
    get:    () => ipcRenderer.invoke('session:get'),
    set:    (token: string) => ipcRenderer.invoke('session:set', token),
    clear:  () => ipcRenderer.invoke('session:clear'),
  },

  // Backend HTTP — main-process fetch that automatically attaches the
  // Bearer launcher session token. Returns { status, body, headers }.
  backend: {
    fetch: (path: string, opts?: { method?: string; body?: unknown }) =>
      ipcRenderer.invoke('backend:fetch', path, opts ?? {}),
  },

  // Local launcher settings (java path, memory MB, etc.)
  settings: {
    get:  () => ipcRenderer.invoke('settings:get'),
    save: (partial: Record<string, unknown>) => ipcRenderer.invoke('settings:save', partial),
  },

  // Game lifecycle (download MC + loader + mods, then launch).
  game: {
    launch: (req: unknown) => ipcRenderer.invoke('game:launch', req),
    onProgress: (cb: (p: unknown) => void) => {
      const handler = (_e: unknown, p: unknown) => cb(p)
      ipcRenderer.on('game:progress', handler)
      return () => ipcRenderer.removeListener('game:progress', handler)
    },
    onLog: (cb: (entry: unknown) => void) => {
      const handler = (_e: unknown, entry: unknown) => cb(entry)
      ipcRenderer.on('game:log', handler)
      return () => ipcRenderer.removeListener('game:log', handler)
    },
    openLogFile: () => ipcRenderer.invoke('game:openLogFile'),
  },

  // Discord OAuth — opens in an Electron window (shares session cookie)
  openDiscordLogin: (backendUrl: string) =>
    ipcRenderer.invoke('auth:openDiscordLogin', backendUrl),

  // Auth
  auth: {
    startDeviceCodeFlow: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_START_DEVICE_CODE),
    pollForToken: (deviceCode: string, interval?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_POLL_FOR_TOKEN, deviceCode, interval),
    refreshToken: (refreshToken: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_REFRESH_TOKEN, refreshToken),
    storeTokens: (tokens: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_STORE_TOKENS, tokens),
    loadTokens: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOAD_TOKENS),
    deleteTokens: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_DELETE_TOKENS),
    validateUsername: (username: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_VALIDATE_USERNAME, username),
    createOfflineProfile: (username: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_CREATE_OFFLINE_PROFILE, username),
  },

  // Downloads
  download: {
    enqueue: (items: unknown[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_ENQUEUE, items),
    start: () =>
      ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_START),
    onProgress: (cb: (progress: unknown) => void) => {
      ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, (_e, p) => cb(p))
      return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.DOWNLOAD_PROGRESS)
    },
  },

  // Profiles
  profile: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_GET, id),
    create: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_CREATE, input),
    update: (id: string, input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_UPDATE, id, input),
    previewRemoval: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_PREVIEW_REMOVAL, id),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROFILE_REMOVE, id),
  },

  // Java
  java: {
    detectAll: () => ipcRenderer.invoke(IPC_CHANNELS.JAVA_DETECT_ALL),
    checkCompatibility: (mcVersion: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.JAVA_CHECK_COMPATIBILITY, mcVersion),
  },

  // Library (via backend API)
  library: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_GET),
    add: (item: unknown) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_ADD, item),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_REMOVE, id),
  },

  // Modpack
  modpack: {
    getManifest: (id: string, source: 'curseforge' | 'modrinth') =>
      ipcRenderer.invoke(IPC_CHANNELS.MODPACK_GET_MANIFEST, id, source),
  },

  // Theme
  theme: {
    sync: (payload: unknown, backendUrl: string, accessToken: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.THEME_SYNC, payload, backendUrl, accessToken),
    getPending: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET_PENDING),
  },

  // Update check
  update: {
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    getCurrentVersion: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_VERSION),
  },
}

contextBridge.exposeInMainWorld('nimbus', nimbusAPI)

export type NimbusAPI = typeof nimbusAPI