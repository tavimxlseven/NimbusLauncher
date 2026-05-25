/**
 * Electron main process entry point — Nimbus Launcher
 *
 * Creates the BrowserWindow, loads the renderer, and registers all IPC handlers.
 * In development: loads from Vite dev server (http://localhost:5174)
 * In production: loads from dist/renderer/index.html
 *
 * Deep link: registers nimbus:// protocol so the website can open the launcher
 * and pass the auth token via nimbus://auth?token=XXX
 */

import { app, BrowserWindow, shell, nativeTheme, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as https from 'https'
import * as http from 'http'
import { registerIpcHandlers } from './ipc/handlers.js'
import { GameLauncher } from './game/GameLauncher.js'
import { validateBackendUrlWithDevMode, createSecureRequest } from './security/SecurityValidator.js'

const isDev = process.env['NODE_ENV'] === 'development' || !app.isPackaged
const PROTOCOL = 'nimbus'

// ── Backend URL ───────────────────────────────────────────────────────────────
const BACKEND_URL = isDev
  ? (process.env['BACKEND_API_URL'] ?? 'http://localhost:3000')
  : 'https://nimbusgg.me'

// ── Persistent storage (session token + launcher settings) ────────────────────
// Stored unencrypted in the user's home dir for now; a follow-up can move the
// session token into KeychainService.
const NIMBUS_DIR     = path.join(os.homedir(), '.nimbus-launcher')
const SESSION_FILE   = path.join(NIMBUS_DIR, 'session.json')
const SETTINGS_FILE  = path.join(NIMBUS_DIR, 'settings.json')


function ensureDir() {
  try { fs.mkdirSync(NIMBUS_DIR, { recursive: true }) } catch { /* ignore */ }
}

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as T } catch { return null }
}

function writeJson(file: string, data: unknown) {
  ensureDir()
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

function getSessionToken(): string | null {
  // Make sure the dir exists before reading — on a clean install this dir
  // doesn't exist yet and the readJson would silently fail otherwise.
  ensureDir()
  const data = readJson<{ token?: string }>(SESSION_FILE)
  return data?.token ?? null
}

function setSessionToken(token: string | null) {
  if (token) writeJson(SESSION_FILE, { token })
  else { try { fs.unlinkSync(SESSION_FILE) } catch { /* ignore */ } }
}

function backendFetch(
  reqPath: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    let parsed: URL
    try { parsed = new URL(BACKEND_URL + reqPath) }
    catch (err) { reject(err); return }

    // Validate backend URL uses HTTPS (or HTTP for localhost in dev mode)
    // Requirements: 15.1
    const validation = validateBackendUrlWithDevMode(parsed.toString(), isDev)
    if (!validation.valid) {
      reject(new Error(validation.error))
      return
    }

    const transport = parsed.protocol === 'https:' ? https : http
    const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined

    const headers: Record<string, string | number> = { Accept: 'application/json' }
    if (bodyStr !== undefined) {
      headers['Content-Type']   = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(bodyStr)
    }
    const tok = getSessionToken()
    if (tok) headers['Authorization'] = `Bearer ${tok}`

    // Use secure request with certificate validation for HTTPS
    // Requirements: 15.2
    const requestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method ?? 'GET',
      headers,
    }

    const req = parsed.protocol === 'https:'
      ? createSecureRequest(requestOptions, (res) => {
          let chunks = ''
          res.on('data', c => { chunks += c.toString() })
          res.on('end', () => {
            const status = res.statusCode ?? 0
            let body: unknown = null
            try { body = chunks ? JSON.parse(chunks) : null } catch { body = chunks }
            resolve({ status, body, headers: res.headers as Record<string, string> })
          })
        })
      : transport.request(requestOptions, (res) => {
          let chunks = ''
          res.on('data', c => { chunks += c.toString() })
          res.on('end', () => {
            const status = res.statusCode ?? 0
            let body: unknown = null
            try { body = chunks ? JSON.parse(chunks) : null } catch { body = chunks }
            resolve({ status, body, headers: res.headers as Record<string, string> })
          })
        })

    req.on('error', reject)
    req.setTimeout(15_000, () => req.destroy(new Error('Backend timeout')))
    if (bodyStr !== undefined) req.write(bodyStr)
    req.end()
  })
}

// Register nimbus:// as a custom protocol (deep link)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

// Single instance lock — prevent multiple launcher windows
const gotLock = app.requestSingleInstanceLock()
let mainWin: BrowserWindow | null = null

if (!gotLock) {
  app.quit()
}

function handleDeepLink(url: string) {
  if (!mainWin) return
  // Parse nimbus://auth?token=XXX
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'auth') {
      const token = parsed.searchParams.get('token')
      if (token) {
        mainWin.webContents.send('deep-link:auth-token', token)
        mainWin.show()
        mainWin.focus()
      }
    }
  } catch {
    // ignore malformed URLs
  }
}

function createWindow(): BrowserWindow {
  // Resolve the icon path. In dev we look at electron/build/icon.ico relative
  // to the source dir; in packaged builds electron-builder copies it next to
  // resources/ as `resources/build/icon.ico` (we set this via "build.icon"
  // in package.json so the .exe itself also gets the icon).
  const iconCandidates = [
    path.join(__dirname, '../build/icon.ico'),                  // dev (electron/build)
    path.join(process.resourcesPath ?? '', 'build/icon.ico'),   // packaged
    path.join(__dirname, '../../build/icon.ico'),               // alt layout
  ]
  const iconPath = iconCandidates.find((p) => p && fs.existsSync(p))

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#080c12',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  mainWin = win

  // Register all IPC handlers
  registerIpcHandlers(
    ipcMain as unknown as import('./ipc/handlers.js').IpcMainBridge,
    win.webContents as unknown as import('./ipc/handlers.js').WebContentsBridge,
  )

  // Open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (isDev) {
    win.loadURL('http://localhost:5174')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const rendererPath = path.join(process.resourcesPath, 'renderer', 'dist', 'index.html')
    win.loadFile(rendererPath)
  }

  win.once('ready-to-show', () => win.show())

  return win
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  const win = createWindow()

  // Window control IPC handlers
  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize())
  ipcMain.on('window:close', () => win.close())

  // IPC: open URL in system browser
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url)
  })

  // IPC: launcher session token (persisted to ~/.nimbus-launcher/session.json)
  ipcMain.handle('session:get',   () => getSessionToken())
  ipcMain.handle('session:set',   (_e, token: string) => { setSessionToken(token); return true })
  ipcMain.handle('session:clear', () => { setSessionToken(null); return true })

  // IPC: backend HTTP — automatically attaches Bearer launcher session
  ipcMain.handle('backend:fetch', async (_e, reqPath: string, opts: { method?: string; body?: unknown } = {}) => {
    try {
      const res = await backendFetch(reqPath, opts)
      return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.body }
    } catch (err) {
      return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // IPC: launcher local settings (java path, max memory MB, ...)
  ipcMain.handle('settings:get',   () => readJson(SETTINGS_FILE) ?? {})
  ipcMain.handle('settings:save',  (_e, partial: Record<string, unknown>) => {
    const current = (readJson<Record<string, unknown>>(SETTINGS_FILE) ?? {})
    const merged = { ...current, ...partial }
    writeJson(SETTINGS_FILE, merged)
    return merged
  })

  // IPC: open the OS file explorer in a specific path or in a modpack instance.
  ipcMain.handle('shell:openFolder', async (_e, p: string) => {
    try {
      ensureDir()
      // Make sure the path exists; create it if not (so user can drop files in).
      try { fs.mkdirSync(p, { recursive: true }) } catch { /* ignore */ }
      const result = await shell.openPath(p)
      return { ok: result === '', error: result || undefined }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // IPC: get the on-disk path for a given modpack id (so the renderer can
  // show it / pass it to openFolder).
  ipcMain.handle('instance:path', (_e, modpackId: string) => {
    return path.join(NIMBUS_DIR, 'instances', String(modpackId).replace(/[^a-zA-Z0-9_-]/g, '_'), '.minecraft')
  })

  // IPC: list files in a subfolder of a modpack instance (mods, shaderpacks, resourcepacks, datapacks)
  ipcMain.handle('instance:listFolder', (_e, modpackId: string, folder: string) => {
    try {
      const safeFolder = ['mods', 'shaderpacks', 'resourcepacks', 'datapacks', 'saves'].includes(folder) ? folder : 'mods'
      const dir = path.join(NIMBUS_DIR, 'instances', String(modpackId).replace(/[^a-zA-Z0-9_-]/g, '_'), '.minecraft', safeFolder)
      fs.mkdirSync(dir, { recursive: true })
      const files = fs.readdirSync(dir)
        .filter(f => ['.jar', '.zip'].some(ext => f.toLowerCase().endsWith(ext)))
        .map(f => {
          const stat = fs.statSync(path.join(dir, f))
          return { name: f, size: stat.size, enabled: !f.endsWith('.disabled') }
        })
      return { ok: true, files }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), files: [] }
    }
  })

  // IPC: toggle a file in a modpack instance folder (rename .jar ↔ .jar.disabled)
  ipcMain.handle('instance:toggleFile', (_e, modpackId: string, folder: string, filename: string) => {
    try {
      const safeFolder = ['mods', 'shaderpacks', 'resourcepacks', 'datapacks'].includes(folder) ? folder : 'mods'
      const dir = path.join(NIMBUS_DIR, 'instances', String(modpackId).replace(/[^a-zA-Z0-9_-]/g, '_'), '.minecraft', safeFolder)
      const fullPath = path.join(dir, filename)
      if (filename.endsWith('.disabled')) {
        const newPath = fullPath.slice(0, -'.disabled'.length)
        fs.renameSync(fullPath, newPath)
        return { ok: true, newName: path.basename(newPath) }
      } else {
        const newPath = fullPath + '.disabled'
        fs.renameSync(fullPath, newPath)
        return { ok: true, newName: path.basename(newPath) }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // IPC: delete a file from a modpack instance folder
  ipcMain.handle('instance:deleteFile', (_e, modpackId: string, folder: string, filename: string) => {
    try {
      const safeFolder = ['mods', 'shaderpacks', 'resourcepacks', 'datapacks'].includes(folder) ? folder : 'mods'
      const dir = path.join(NIMBUS_DIR, 'instances', String(modpackId).replace(/[^a-zA-Z0-9_-]/g, '_'), '.minecraft', safeFolder)
      fs.unlinkSync(path.join(dir, filename))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // IPC: game launch + progress
  const gameLauncher = new GameLauncher()
  let currentLogPath: string | null = null
  let currentLogStream: fs.WriteStream | null = null

  function openLogStream(modpackId: string): string {
    try { currentLogStream?.end() } catch { /* ignore */ }
    const logsDir = path.join(NIMBUS_DIR, 'logs')
    fs.mkdirSync(logsDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    currentLogPath = path.join(logsDir, `${modpackId}_${stamp}.log`)
    currentLogStream = fs.createWriteStream(currentLogPath, { flags: 'a' })
    return currentLogPath
  }

  gameLauncher.on('progress', (p) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('game:progress', p)
    }
    try {
      currentLogStream?.write(`[progress] ${p.phase}: ${p.message}\n`)
    } catch { /* ignore */ }
  })
  gameLauncher.on('stdout', (chunk: string) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('game:log', { stream: 'stdout', data: chunk })
    }
    try { currentLogStream?.write(chunk) } catch { /* ignore */ }
  })
  gameLauncher.on('stderr', (chunk: string) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('game:log', { stream: 'stderr', data: chunk })
    }
    try { currentLogStream?.write(chunk) } catch { /* ignore */ }
  })

  ipcMain.handle('game:launch', async (_e, request: unknown) => {
    try {
      // Inject default backendUrl/sessionToken/javaPath/maxMemoryMb if absent.
      const r = request as Record<string, unknown>
      const settings = (readJson<Record<string, unknown>>(SETTINGS_FILE) ?? {})
      const merged = {
        backendUrl:       BACKEND_URL,
        sessionToken:     getSessionToken(),
        javaPath:         (r['javaPath'] as string | undefined) ?? (settings['javaPath'] as string | undefined) ?? '',
        autoJava:         (r['autoJava'] as boolean | undefined)
                          ?? (settings['autoJava'] as boolean | undefined)
                          ?? true,
        // 8 GB default — heavy modpacks (300+ mods after Fabric expansion)
        // routinely need this much. The launcher caps it at 75% of system RAM
        // before passing it to the JVM, so 8 GB is safe down to 12 GB systems.
        // Users can still lower it in Settings.
        maxMemoryMb:      (r['maxMemoryMb'] as number | undefined) ?? (settings['maxMemoryMb'] as number | undefined) ?? 8192,
        offlineUsername:  (r['offlineUsername'] as string | undefined) ?? 'Player',
        ...r,
      } as Parameters<GameLauncher['launchInstance']>[0]
      // Open a fresh log file for this run (kept in ~/.nimbus-launcher/logs/)
      openLogStream(String(merged.modpackId ?? 'unknown'))
      const result = await gameLauncher.launchInstance(merged)
      try { currentLogStream?.end() } catch { /* ignore */ }
      return { ok: true, exitCode: result.exitCode, logPath: currentLogPath }
    } catch (err) {
      try { currentLogStream?.end() } catch { /* ignore */ }
      return { ok: false, error: err instanceof Error ? err.message : String(err), logPath: currentLogPath }
    }
  })

  // IPC: open the log file of the current/last launch
  ipcMain.handle('game:openLogFile', async () => {
    if (!currentLogPath) return { ok: false, error: 'Nenhum log disponível ainda.' }
    try {
      const result = await shell.openPath(currentLogPath)
      return { ok: result === '', error: result || undefined, path: currentLogPath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Handle deep link on Windows/Linux (second instance)
  app.on('second-instance', (_event, commandLine) => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore()
      mainWin.focus()
    }
    // The deep link URL is the last argument on Windows
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL}://`))
    if (url) handleDeepLink(url)
  })

  // Handle deep link on macOS (open-url event)
  app.on('open-url', (_event, url) => {
    handleDeepLink(url)
  })

  // Handle deep link from launch args (Windows: launched via protocol)
  const launchUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`))
  if (launchUrl) {
    win.once('ready-to-show', () => handleDeepLink(launchUrl))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
