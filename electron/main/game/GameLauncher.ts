/**
 * GameLauncher — orchestrates downloading + launching Minecraft.
 *
 * Pipeline:
 *   1. Resolve mods           — backend → URL + sha
 *   2. Install vanilla MC     — @xmcl/installer (jar + libraries + assets)
 *   3. Install loader         — @xmcl/installer (Fabric / Forge / NeoForge / Quilt)
 *   4. Download mod jars      — parallel, dedup by sha
 *   5. Symlink/copy mods into <instance>/.minecraft/mods/
 *   6. Launch                 — @xmcl/core spawn java with auth profile
 *
 * Progress is emitted as `game:progress` events to the renderer.
 *
 * Auth: prefers a stored Microsoft / Minecraft profile, falls back to offline
 * mode using the user's Discord username.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as https from 'https'
import * as http from 'http'
import * as crypto from 'crypto'
import { EventEmitter } from 'events'
import { spawn, type ChildProcess } from 'child_process'
import { MinecraftFolder, launch, Version, type LaunchOption } from '@xmcl/core'
import {
  installTask,
  installFabric,
  installForge,
  installNeoForged,
  installDependencies,
  type MinecraftVersion,
  getVersionList,
  getForgeVersionList,
} from '@xmcl/installer'
import { InstanceManager, type InstanceMeta } from './InstanceManager.js'
import { JavaRuntimeManager } from './JavaRuntimeManager.js'
import { resolveMod } from './ModResolver.js'
import { OfflineAuthManager } from '../auth/OfflineAuthManager.js'
import { MicrosoftAuthManager } from '../auth/MicrosoftAuthManager.js'
import { validateDownloadUrl } from '../security/SecurityValidator.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModSpec {
  /** Library item / modpack_mod identifier (for logs only). */
  id?:          string | number
  source:       'modrinth' | 'curseforge'
  externalId:   string
  /** Modrinth version_id OR CurseForge fileId. */
  versionId:    string
  /** Optional human-readable name (used as fallback when filename missing). */
  name?:        string
}

export interface LaunchRequest {
  modpackId:   string
  modpackName: string
  mcVersion:   string
  loader:      'fabric' | 'forge' | 'neoforge' | 'quilt' | 'vanilla'
  /** Optional explicit loader version. If omitted, latest stable is used. */
  loaderVersion?: string
  mods:        ModSpec[]

  /** Username to use for offline-mode launch. */
  offlineUsername: string

  /** Java executable path (from settings). Empty/falsy means "auto-pick". */
  javaPath: string
  /**
   * When true (default), the launcher downloads + uses the Mojang-provided
   * Java runtime if `javaPath` is empty or its major version doesn't match
   * what the Minecraft version requires.
   */
  autoJava?: boolean
  /** Max RAM in MB. */
  maxMemoryMb: number

  /** Backend URL for resolving mod download URLs. */
  backendUrl: string
  sessionToken?: string | null

  /** Optional URL to the original modpack archive (CurseForge .zip /
   *  Modrinth .mrpack). When provided, the launcher downloads it once and
   *  extracts `overrides/` into the instance's `.minecraft/` folder so
   *  modpack configs/scripts/kubejs packs are present at launch. */
  modpackArchiveUrl?:  string | null
  modpackArchiveSha1?: string | null

  /** When true, forces a full reinstallation by clearing local instance
   *  directories (mods, config, kubejs, resourcepacks, shaderpacks) before
   *  downloading. Used for repair operations. */
  forceReinstall?: boolean
}

export interface CacheStatistics {
  total: number
  cached: number
  downloaded: number
  failed: number
}

export interface ProgressDetail {
  downloaded?: number
  failed?: number
  cacheStats?: CacheStatistics
  failedMods?: Array<{ name: string; source: string; error: string }>
  placedCount?: Record<string, number>
}

export interface ProgressEvent {
  phase:  'preparing' | 'minecraft' | 'loader' | 'mods' | 'java' | 'launching' | 'running' | 'done' | 'error'
  message: string
  /** 0-100 (rough). */
  percent?: number
  /** Free-form details for UI. */
  detail?: ProgressDetail
}

// ---------------------------------------------------------------------------
// Helpers — HTTP download with sha verification, retry, and JAR validation
// ---------------------------------------------------------------------------

/** Minimum size we'll accept for a "real" mod jar. Anything smaller is almost
 *  certainly an HTML error page (CDN 4xx/5xx body, captcha, "request blocked"). */
const MIN_VALID_JAR_BYTES = 1024

/** Hard timeout for a single HTTP attempt. */
const DOWNLOAD_TIMEOUT_MS = 60_000
/** Idle timeout — if no bytes arrive in this window, we abort the connection. */
const DOWNLOAD_IDLE_MS    = 20_000

// yauzl/yazl are the same libs we already bundle for the Java extractor. They
// give us programmatic access to ZIP internals which lets us catch + repair
// malformed jars before NeoForge's strict ZIP loader chokes on them.
//
// Lazy-imported via require so unit tests that don't touch this module path
// aren't forced to install them.
import * as yauzl from 'yauzl'
import * as yazl from 'yazl'

interface ZipScanResult {
  ok:        boolean
  /** Reason it's bad, if !ok. */
  reason?:   string
  /** True if it's repairable by re-zipping (e.g. STORED entries with descriptors). */
  repairable?: boolean
  /** Total entries seen during scan (0 if open failed). */
  entries:   number
  /** True if META-INF/MANIFEST.MF was found. */
  hasManifest?: boolean
}

/**
 * Deep-scan a ZIP/JAR with yauzl, mirroring the JVM's strictness.
 *
 * What we check (in addition to magic bytes / min size):
 *   - File opens as a ZIP at all
 *   - Has at least one entry
 *   - No STORED (method 0) entries that also carry a data descriptor flag
 *     (general purpose bit 3). This combination is illegal per the ZIP spec,
 *     and OpenJDK rejects with the exact error we hit on NeoForge:
 *     "only DEFLATED entries can have EXT descriptor".
 *   - Contains META-INF/MANIFEST.MF (required for valid JAR files)
 *
 * STORED+descriptor jars come from buggy build tools (some old Gradle plugins,
 * a few resourcepack-as-mod tools). They open fine in 7-Zip / WinRAR / yauzl
 * but the JVM refuses them. The fix is to re-pack with everything DEFLATED.
 */
async function scanZipStructure(file: string): Promise<ZipScanResult> {
  return new Promise<ZipScanResult>((resolve) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zf) => {
      if (err || !zf) {
        return resolve({ ok: false, reason: err?.message ?? 'falha ao abrir', entries: 0, hasManifest: false })
      }
      let entries = 0
      let hasManifest = false
      let badReason: string | null = null
      let repairable = false
      zf.on('entry', (entry: yauzl.Entry) => {
        entries++
        // Check for manifest file
        if (entry.fileName === 'META-INF/MANIFEST.MF') {
          hasManifest = true
        }
        const hasDescriptor = (entry.generalPurposeBitFlag & 0x08) !== 0
        const isStored      = entry.compressionMethod === 0
        if (hasDescriptor && isStored) {
          badReason = `entry "${entry.fileName}" é STORED com data descriptor (JVM rejeita)`
          repairable = true
        }
        zf.readEntry()
      })
      zf.on('end', () => {
        if (badReason) return resolve({ ok: false, reason: badReason, repairable, entries, hasManifest })
        if (entries === 0) return resolve({ ok: false, reason: 'ZIP sem entradas', entries, hasManifest })
        if (!hasManifest) return resolve({ ok: false, reason: 'JAR sem META-INF/MANIFEST.MF', entries, hasManifest: false })
        resolve({ ok: true, entries, hasManifest: true })
      })
      zf.on('error', (e) => resolve({ ok: false, reason: e.message, entries, hasManifest }))
      zf.readEntry()
    })
  })
}

/**
 * Validate that a freshly-downloaded file is actually a JAR (= ZIP archive).
 *
 * CDN errors frequently return small HTML bodies with a 200 status code (or 440,
 * which is what CurseForge edge nodes throw when they want you to retry). Saving
 * those to disk leaves us with files like `sodium.jar` whose contents start with
 * `<!DOCTYPE html>` — Fabric/Forge then logs `Skipping jar. File mods\xxx.jar
 * is not a valid mod file` and silently drops the mod, which is exactly the
 * silent-failure mode we hit in the NeoForge 1.21.1 test pack.
 *
 * We check magic bytes + size first (cheap), then deep-scan with yauzl to
 * catch ZIPs that are technically openable but the JVM refuses (STORED +
 * data descriptor combo), and verify the presence of META-INF/MANIFEST.MF.
 */
async function validateJarFile(
  file: string,
): Promise<{ ok: true } | { ok: false; reason: string; repairable?: boolean }> {
  let stat: fs.Stats
  try { stat = fs.statSync(file) } catch (err) {
    return { ok: false, reason: `arquivo não encontrado: ${err instanceof Error ? err.message : err}` }
  }
  if (stat.size < MIN_VALID_JAR_BYTES) {
    return { ok: false, reason: `arquivo muito pequeno (${stat.size} bytes), provavelmente página de erro` }
  }
  // Magic bytes check (cheap, catches HTML/text payloads).
  let fd: number | null = null
  try {
    fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(4)
    const read = fs.readSync(fd, buf, 0, 4, 0)
    if (read < 4) return { ok: false, reason: 'não foi possível ler magic bytes' }
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b &&
                  ((buf[2] === 0x03 && buf[3] === 0x04) ||
                   (buf[2] === 0x05 && buf[3] === 0x06))
    if (!isZip) {
      return { ok: false, reason: `magic bytes inválidos (${buf.toString('hex')}), não é um JAR` }
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  } finally {
    if (fd != null) { try { fs.closeSync(fd) } catch { /* ignore */ } }
  }

  // Deep scan — catches the JVM-killing STORED+descriptor combination.
  const scan = await scanZipStructure(file)
  if (!scan.ok) {
    return { ok: false, reason: scan.reason ?? 'estrutura inválida', repairable: scan.repairable }
  }
  return { ok: true }
}

/**
 * Re-pack a malformed (but openable) JAR using DEFLATED compression for every
 * entry. Used to recover from the "only DEFLATED entries can have EXT
 * descriptor" failure mode without forcing the user to find and remove the
 * offending mod by hand.
 *
 * Writes to `dest` atomically via a temp file. Returns true on success.
 */
async function repairJarFile(src: string, dest: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    yauzl.open(src, { lazyEntries: true, autoClose: true }, (err, zf) => {
      if (err || !zf) return resolve(false)
      const tmp = `${dest}.repair-${process.pid}-${Date.now()}`
      const out = new yazl.ZipFile()
      let pending = 0
      let aborted = false

      const fail = (reason: string) => {
        if (aborted) return
        aborted = true
        try { fs.unlinkSync(tmp) } catch { /* ignore */ }
        // Don't log inside hot loops — let caller decide.
        void reason
        resolve(false)
      }

      zf.on('entry', (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName)) {
          out.addEmptyDirectory(entry.fileName)
          zf.readEntry()
          return
        }
        pending++
        zf.openReadStream(entry, (e, stream) => {
          if (e || !stream) {
            // Skip unreadable entries — better a lighter jar than a broken pack.
            pending--
            zf.readEntry()
            return
          }
          const chunks: Buffer[] = []
          stream.on('data', (c: Buffer) => chunks.push(c))
          stream.on('end', () => {
            out.addBuffer(Buffer.concat(chunks), entry.fileName, { compress: true })
            pending--
            zf.readEntry()
          })
          stream.on('error', () => { pending--; zf.readEntry() })
        })
      })

      zf.on('end', () => {
        const finalize = () => {
          out.end()
          out.outputStream
            .pipe(fs.createWriteStream(tmp))
            .on('close', () => {
              if (aborted) return
              try {
                if (fs.existsSync(dest)) fs.unlinkSync(dest)
                fs.renameSync(tmp, dest)
                resolve(true)
              } catch (e) { fail((e as Error).message) }
            })
            .on('error', (e) => fail(e.message))
        }
        if (pending === 0) finalize()
        else {
          const wait = setInterval(() => {
            if (pending === 0) { clearInterval(wait); finalize() }
          }, 50)
        }
      })
      zf.on('error', (e) => fail(e.message))
      zf.readEntry()
    })
  })
}

/**
 * Single-attempt download. Throws on any HTTP error, timeout, or sha mismatch.
 * The caller (`downloadToFileWithRetry`) wraps this in a retry loop.
 * 
 * Requirements: 15.1, 15.3 - Validates download URL uses HTTPS and trusted domain
 */
function downloadToFile(url: string, dest: string, expectedSha1?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Validate download URL before attempting download
    // Requirements: 15.1, 15.3
    const validation = validateDownloadUrl(url)
    if (!validation.valid) {
      reject(new Error(validation.error))
      return
    }

    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const out = fs.createWriteStream(tmp)
    const sha = crypto.createHash('sha1')
    let settled = false
    let request: http.ClientRequest | null = null
    let idleTimer: NodeJS.Timeout | null = null
    let hardTimer: NodeJS.Timeout | null = null

    const cleanup = () => {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
      if (hardTimer) { clearTimeout(hardTimer); hardTimer = null }
    }

    const finish = (err: Error | null) => {
      if (settled) return
      settled = true
      cleanup()
      try { request?.destroy() } catch { /* ignore */ }
      if (err) {
        try { out.destroy() } catch { /* ignore */ }
        try { fs.unlinkSync(tmp) } catch { /* ignore */ }
        reject(err)
      } else {
        resolve()
      }
    }

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => finish(new Error(`Timeout: sem dados por ${DOWNLOAD_IDLE_MS}ms`)), DOWNLOAD_IDLE_MS)
    }

    hardTimer = setTimeout(() => finish(new Error(`Timeout: download excedeu ${DOWNLOAD_TIMEOUT_MS}ms`)), DOWNLOAD_TIMEOUT_MS)

    const fetch = (u: string, redirects = 0) => {
      // Validate redirect URLs as well
      // Requirements: 15.1, 15.3
      if (redirects > 0) {
        const redirectValidation = validateDownloadUrl(u)
        if (!redirectValidation.valid) {
          finish(new Error(`Invalid redirect URL: ${redirectValidation.error}`))
          return
        }
      }

      const transport = u.startsWith('https:') ? https : http
      try {
        request = transport.get(u, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
            res.resume()
            fetch(res.headers.location, redirects + 1)
            return
          }
          if (!res.statusCode || res.statusCode >= 400) {
            res.resume()
            finish(new Error(`HTTP ${res.statusCode} ao baixar ${u}`))
            return
          }
          resetIdle()
          res.on('data', (chunk: Buffer) => {
            sha.update(chunk)
            resetIdle()
          })
          res.on('error', (err) => finish(err))
          res.pipe(out)
          out.on('finish', () => {
            out.close((closeErr) => {
              if (closeErr) return finish(closeErr)
              if (expectedSha1) {
                const got = sha.digest('hex').toLowerCase()
                if (got !== expectedSha1.toLowerCase()) {
                  return finish(new Error(`SHA1 inválido: esperado ${expectedSha1}, recebido ${got}`))
                }
              }
              try {
                if (fs.existsSync(dest)) fs.unlinkSync(dest)
                fs.renameSync(tmp, dest)
                finish(null)
              } catch (err) { finish(err as Error) }
            })
          })
          out.on('error', (err) => finish(err))
        })
        request.on('error', (err) => finish(err))
        request.on('timeout', () => finish(new Error('Timeout de socket')))
        request.setTimeout(DOWNLOAD_TIMEOUT_MS)
      } catch (err) {
        finish(err as Error)
      }
    }

    fetch(url)
  })
}

/**
 * Download with up to 3 attempts and exponential backoff (1s, 2s, 4s).
 * If `dest` ends in `.jar`, the result is also validated as a real ZIP archive.
 *
 * `onAttempt` is called before each attempt with the attempt number (1..N) and
 * any error from the previous attempt. Used by the mod loop to surface
 * "Tentativa 2/3 — Iris Shaders" messages instead of opaque silence.
 */
async function downloadToFileWithRetry(
  url: string,
  dest: string,
  expectedSha1?: string,
  onAttempt?: (attempt: number, prevError: Error | null) => void,
): Promise<void> {
  const maxAttempts = 3
  const baseDelayMs = 1000
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onAttempt?.(attempt, lastError)
    try {
      await downloadToFile(url, dest, expectedSha1)
      // Optional JAR sanity check — catches HTML 200 responses that pass
      // checksum verification trivially when the upstream returns no sha,
      // and also catches structurally-invalid ZIPs the JVM would reject.
      if (dest.toLowerCase().endsWith('.jar')) {
        const v = await validateJarFile(dest)
        if (!v.ok) {
          // If the file is structurally repairable (STORED+descriptor zip),
          // try to salvage it instead of forcing the user to find another
          // host. Only kicks in once per attempt to avoid infinite loops.
          if (v.repairable) {
            const repaired = await repairJarFile(dest, dest)
            if (repaired) {
              const v2 = await validateJarFile(dest)
              if (v2.ok) return
            }
          }
          try { fs.unlinkSync(dest) } catch { /* ignore */ }
          throw new Error(`JAR inválido: ${v.reason}`)
        }
      }
      return
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1) // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  throw new Error(`Falhou após ${maxAttempts} tentativas: ${lastError?.message ?? 'erro desconhecido'}`)
}

/**
 * In-memory cache for SHA1 computation results to avoid re-hashing files.
 * Key: file path, Value: { sha1: string, mtime: number, size: number }
 * 
 * We cache based on file path + mtime + size to detect when files change.
 * This cache persists for the lifetime of the GameLauncher instance.
 * 
 * Requirements: 14.1, 14.2, 14.5
 */
const sha1Cache = new Map<string, { sha1: string; mtime: number; size: number }>()

/**
 * Compute SHA1 hash of a file using streaming for memory efficiency.
 * 
 * For large files (>10MB), uses streaming with optimized buffer size.
 * Results are cached based on file path + mtime + size to avoid re-hashing.
 * 
 * Requirements: 14.1, 14.2, 14.5
 * 
 * @param file - Path to file to hash
 * @returns Promise resolving to lowercase hex SHA1 hash
 */
async function fileSha1(file: string): Promise<string> {
  // Check cache first (Requirement 14.5: Cache SHA1 computation results)
  try {
    const stats = await fs.promises.stat(file)
    const cached = sha1Cache.get(file)
    
    if (cached && cached.mtime === stats.mtimeMs && cached.size === stats.size) {
      // Cache hit - return cached SHA1
      return cached.sha1
    }
    
    // Cache miss or file changed - compute SHA1
    const sha1 = await new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash('sha1')
      
      // Use larger buffer for large files (>10MB) for better streaming performance
      // (Requirement 14.1: streaming SHA1 computation for large files)
      const highWaterMark = stats.size > 10 * 1024 * 1024 ? 64 * 1024 : 16 * 1024
      
      const stream = fs.createReadStream(file, { highWaterMark })
      stream.on('data', (c) => hash.update(c))
      stream.on('end', () => resolve(hash.digest('hex').toLowerCase()))
      stream.on('error', reject)
    })
    
    // Update cache with new result
    sha1Cache.set(file, { sha1, mtime: stats.mtimeMs, size: stats.size })
    
    return sha1
  } catch (err) {
    // If stat fails, fall back to non-cached computation
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1')
      const stream = fs.createReadStream(file)
      stream.on('data', (c) => hash.update(c))
      stream.on('end', () => resolve(hash.digest('hex').toLowerCase()))
      stream.on('error', reject)
    })
  }
}

/** Type of asset inside a CurseForge/Modrinth "mod" entry. Many modpacks ship
 *  resourcepacks and shaderpacks via the regular mod list — they're not mods
 *  and must NOT live in `mods/` (NeoForge logs them as "not a valid mod file"
 *  and refuses to load them, which is exactly the warning the user was
 *  seeing on the ATM 10 main menu). */
type JarKind = 'mod' | 'resourcepack' | 'shaderpack' | 'datapack' | 'unknown'

/**
 * Inspect a downloaded jar/zip to determine where it should be placed inside
 * the instance: `mods/`, `resourcepacks/`, or `shaderpacks/`.
 *
 * We look at well-known marker files:
 *   - mod metadata     → mods/        (META-INF/mods.toml, fabric.mod.json, …)
 *   - shaders/         → shaderpacks/ (Iris/OptiFine layout)
 *   - pack.mcmeta only → resourcepacks/ (vanilla resource pack)
 *
 * Returns 'unknown' when the heuristic doesn't match — caller should default
 * to `mods/` so we don't lose anything (the JVM will skip it gracefully and
 * just log a "not a valid mod" warning).
 */
async function detectJarKind(file: string): Promise<JarKind> {
  return new Promise<JarKind>((resolve) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zf) => {
      if (err || !zf) return resolve('unknown')
      const seen = new Set<string>()
      let hasShaders = false
      let hasPackMeta = false
      let hasModMeta = false
      let hasDataPack = false
      zf.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName.toLowerCase()
        seen.add(name)
        if (name === 'meta-inf/mods.toml' ||
            name === 'meta-inf/neoforge.mods.toml' ||
            name === 'fabric.mod.json' ||
            name === 'quilt.mod.json' ||
            name === 'mcmod.info') {
          hasModMeta = true
        }
        if (name === 'pack.mcmeta') hasPackMeta = true
        if (name.startsWith('shaders/')) hasShaders = true
        if (name.startsWith('data/') && /\/(recipes|loot_tables|advancements|tags)\//.test(name)) {
          hasDataPack = true
        }
        zf.readEntry()
      })
      zf.on('end', () => {
        if (hasModMeta)   return resolve('mod')
        if (hasShaders)   return resolve('shaderpack')
        if (hasPackMeta && hasDataPack) return resolve('datapack')
        if (hasPackMeta)  return resolve('resourcepack')
        resolve('unknown')
      })
      zf.on('error', () => resolve('unknown'))
      zf.readEntry()
    })
  })
}

/**
 * Extract the `overrides/` directory from a CurseForge/Modrinth modpack
 * archive into the instance's `.minecraft/` folder. This is where modpacks
 * ship configs, scripts, kubejs packs, default resourcepacks, etc. — without
 * extracting these the modpack runs with vanilla defaults and most features
 * silently fail to initialize.
 *
 * Modrinth `.mrpack` uses `overrides/` (and optionally `client-overrides/`).
 * CurseForge `.zip` uses `overrides/` only. We handle both.
 */
async function extractOverrides(
  archivePath: string,
  destRoot: string,
  onProgress?: (current: number, total: number, name: string) => void,
): Promise<{ extracted: number }> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (err, zf) => {
      if (err || !zf) return reject(err ?? new Error('falha ao abrir archive'))
      const total = zf.entryCount
      let processed = 0
      let extracted = 0
      let pending = 0
      let ended = false
      let aborted = false

      const overridePrefixes = ['overrides/', 'client-overrides/']

      const fail = (e: Error) => {
        if (aborted) return
        aborted = true
        reject(e)
      }

      const maybeFinish = () => {
        if (ended && pending === 0 && !aborted) resolve({ extracted })
      }

      zf.on('entry', (entry: yauzl.Entry) => {
        processed++
        onProgress?.(processed, total, entry.fileName)
        const matched = overridePrefixes.find(p => entry.fileName.startsWith(p))
        if (!matched) { zf.readEntry(); return }
        const rel = entry.fileName.slice(matched.length)
        if (!rel) { zf.readEntry(); return }
        const target = path.join(destRoot, rel)
        if (entry.fileName.endsWith('/')) {
          fs.mkdirSync(target, { recursive: true })
          zf.readEntry()
          return
        }
        // Refuse path traversal — overrides/../etc/passwd-style entries.
        const normTarget = path.normalize(target)
        if (!normTarget.startsWith(path.normalize(destRoot))) {
          zf.readEntry()
          return
        }
        pending++
        fs.mkdirSync(path.dirname(target), { recursive: true })
        zf.openReadStream(entry, (e, stream) => {
          if (e || !stream) { pending--; zf.readEntry(); return }
          const out = fs.createWriteStream(target)
          stream.pipe(out)
          out.on('close', () => {
            extracted++
            pending--
            zf.readEntry()
            maybeFinish()
          })
          out.on('error', () => { pending--; zf.readEntry() })
        })
      })
      zf.on('end', () => { ended = true; maybeFinish() })
      zf.on('error', fail)
      zf.readEntry()
    })
  })
}

// ---------------------------------------------------------------------------
// GameLauncher
// ---------------------------------------------------------------------------

export class GameLauncher extends EventEmitter {
  readonly instances: InstanceManager
  readonly javaRuntimes: JavaRuntimeManager

  constructor(rootDir?: string) {
    super()
    this.instances    = new InstanceManager(rootDir)
    this.javaRuntimes = new JavaRuntimeManager(rootDir)
  }

  /** Emit a progress event to listeners. */
  private progress(p: ProgressEvent): void {
    this.emit('progress', p)
  }

  /**
   * Clean up local instance directories for repair operations.
   * 
   * Deletes the following directories from the instance:
   * - mods/
   * - config/
   * - kubejs/
   * - resourcepacks/
   * - shaderpacks/
   * 
   * Uses parallel deletion for performance and ensures atomic operation
   * (all directories are deleted or none are).
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8, 12.3
   * 
   * @param modpackId - The modpack instance ID to clean
   * @returns Promise that resolves on success or rejects with error
   * @throws Error if any directory deletion fails
   */
  async cleanupLocalInstance(modpackId: string): Promise<void> {
    const gameDir = this.instances.gameDir(modpackId)
    
    // Directories to delete for repair operation
    const dirsToDelete = [
      path.join(gameDir, 'mods'),
      path.join(gameDir, 'config'),
      path.join(gameDir, 'kubejs'),
      path.join(gameDir, 'resourcepacks'),
      path.join(gameDir, 'shaderpacks'),
    ]

    // Track which directories exist before deletion
    const existingDirs: string[] = []
    for (const dir of dirsToDelete) {
      if (fs.existsSync(dir)) {
        existingDirs.push(dir)
      }
    }

    // If no directories exist, nothing to clean
    if (existingDirs.length === 0) {
      this.emit('stderr', `[cleanup] No directories to clean for instance ${modpackId}\n`)
      return
    }

    this.emit('stderr', `[cleanup] Cleaning ${existingDirs.length} directories for instance ${modpackId}\n`)

    // Delete directories in parallel for performance
    const deletePromises = existingDirs.map(async (dir) => {
      try {
        await fs.promises.rm(dir, { recursive: true, force: true })
        this.emit('stderr', `[cleanup] Deleted ${path.basename(dir)}\n`)
        return { success: true, dir }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.emit('stderr', `[cleanup] Failed to delete ${path.basename(dir)}: ${msg}\n`)
        return { success: false, dir, error: msg }
      }
    })

    // Wait for all deletions to complete
    const results = await Promise.all(deletePromises)

    // Check if any deletions failed
    const failures = results.filter(r => !r.success)
    if (failures.length > 0) {
      const failedDirs = failures.map(f => path.basename(f.dir)).join(', ')
      throw new Error(`Failed to clean instance directories: ${failedDirs}`)
    }

    this.emit('stderr', `[cleanup] Successfully cleaned instance ${modpackId}\n`)
  }

  /**
   * Full launch pipeline. Resolves when the JVM child process exits (or rejects
   * if any prep step fails). Use the `progress` event to drive UI feedback.
   */
  async launchInstance(req: LaunchRequest): Promise<{ exitCode: number | null }> {
    try {
      return await this._doLaunch(req)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.emit('stderr', `[launch] ${msg}\n${err instanceof Error ? err.stack : ''}\n`)
      this.progress({ phase: 'error', message: msg, percent: 100 })
      throw err
    }
  }

  private async _doLaunch(req: LaunchRequest): Promise<{ exitCode: number | null }> {
    this.instances.ensureDirs()
    this.instances.ensureInstance(req.modpackId)

    const folder = MinecraftFolder.from(this.instances.minecraftDir)

    this.progress({ phase: 'preparing', message: 'Preparando instalação…', percent: 1 })

    // ── Repair operation: Clear local instance if force reinstall is requested ──
    if (req.forceReinstall) {
      this.progress({ phase: 'preparing', message: 'Limpando instalação local…', percent: 2 })
      try {
        await this.cleanupLocalInstance(req.modpackId)
        this.progress({ phase: 'preparing', message: 'Instalação local limpa', percent: 3 })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.emit('stderr', `[repair] Failed to clear instance: ${msg}\n`)
        throw new Error(`Falha ao limpar instalação local: ${msg}`)
      }
      // Re-ensure instance directories after cleanup
      this.instances.ensureInstance(req.modpackId)
    }

    // ── Sanity-check the user's memory request against the host system. ─────
    // os.totalmem() is in bytes. We refuse to allocate more than 75% of system
    // RAM to the JVM (otherwise Windows kills the JVM unceremoniously, exit 1
    // with no stack trace — exactly the symptom we're trying to fix).
    const totalRamMb = Math.floor(os.totalmem() / (1024 * 1024))
    const maxAllowedMb = Math.floor(totalRamMb * 0.75)
    if (req.maxMemoryMb > maxAllowedMb) {
      this.emit('stderr',
        `[memory] ${req.maxMemoryMb} MB requested but system has ${totalRamMb} MB; ` +
        `capping at ${maxAllowedMb} MB to prevent OOM kills.\n`)
      req = { ...req, maxMemoryMb: maxAllowedMb }
    }

    // ── 0. Resolve Java executable for this MC version ──────────────────────
    // We auto-download Mojang's official JRE when the user-configured Java
    // doesn't match (or wasn't set), so that each modpack runs on the JVM it
    // actually expects (MC 1.19 → 17, 1.20.5+ → 21, etc.).
    const javaExecutable = await this._resolveJavaForMc(req)

    // ── 1. Install vanilla Minecraft ─────────────────────────────────────────
    this.progress({ phase: 'minecraft', message: `Verificando Minecraft ${req.mcVersion}…`, percent: 3 })

    const localVersionJson = path.join(folder.versions, req.mcVersion, `${req.mcVersion}.json`)
    const localVersionJar  = path.join(folder.versions, req.mcVersion, `${req.mcVersion}.jar`)
    const isAlreadyInstalled = fs.existsSync(localVersionJson) && fs.existsSync(localVersionJar)

    if (!isAlreadyInstalled) {
      this.progress({ phase: 'minecraft', message: `Buscando lista de versões…`, percent: 4 })

      const versionList = await getVersionList()
      const mcMeta: MinecraftVersion | undefined =
        versionList.versions.find(v => v.id === req.mcVersion)
      if (!mcMeta) throw new Error(`Versão Minecraft não encontrada: ${req.mcVersion}`)

      this.progress({ phase: 'minecraft', message: `Baixando Minecraft ${req.mcVersion}…`, percent: 5 })

    // Use installTask so we can stream progress to the UI.
    // Lower concurrency to avoid AggregateError on slow/throttled networks.
    const task = installTask(mcMeta, folder, {
      assetsDownloadConcurrency: 4,
      librariesDownloadConcurrency: 4,
    })
    let lastEmit = 0
    const onUpdate = (t: { name: string; total: number; progress: number }) => {
      const now = Date.now()
      if (now - lastEmit < 250) return
      lastEmit = now
      const total    = t.total    || 0
      const progress = t.progress || 0
      const pctIn    = total > 0 ? (progress / total) : 0
      const overall  = 5 + Math.round(pctIn * 30)
      const childName = (t.name || 'minecraft').split('.').pop() ?? t.name
      const detail   = total > 0
        ? `${childName}  ${formatBytes(progress)} / ${formatBytes(total)}`
        : `${childName}…`
      this.progress({
        phase:   'minecraft',
        message: `Baixando Minecraft ${req.mcVersion} — ${detail}`,
        percent: overall,
      })
    }
    const onFailed = (_t: unknown, err: unknown) => {
      this.emit('stderr', `[install] ${err instanceof Error ? err.message : String(err)}\n`)
    }

    // Retry the whole install up to 3 times — xmcl is idempotent (already-OK
    // files are skipped on retry, only failed ones are redownloaded).
    let attempt = 0
    let lastErr: unknown = null
    while (attempt < 3) {
      try {
        await task.startAndWait({
          onUpdate: (t) => onUpdate(t as never),
          onFailed,
        })
        lastErr = null
        break
      } catch (err) {
        attempt++
        lastErr = err
        const summary = aggregateMessage(err)
        this.emit('stderr', `[install] tentativa ${attempt}/3 falhou: ${summary}\n`)
        if (attempt < 3) {
          this.progress({
            phase: 'minecraft',
            message: `Reintentando download (${attempt}/3)…`,
            percent: 10,
          })
          await new Promise(r => setTimeout(r, 1500))
          continue
        }
      }
    }
    if (lastErr) throw new Error(`Falha ao baixar Minecraft após 3 tentativas: ${aggregateMessage(lastErr)}`)

    } // end if (!isAlreadyInstalled)

    this.progress({ phase: 'minecraft', message: `Minecraft ${req.mcVersion} pronto`, percent: 35 })

    // ── 2. Install loader ────────────────────────────────────────────────────
    let launchVersionId = req.mcVersion

    /** Returns true when a launch version with this id already has its json+files on disk. */
    const isLoaderInstalled = (id: string): boolean => {
      const verJson = path.join(folder.versions, id, `${id}.json`)
      return fs.existsSync(verJson)
    }

    if (req.loader === 'fabric') {
      this.progress({ phase: 'loader', message: 'Verificando Fabric…', percent: 40 })
      const loaderVer = req.loaderVersion ?? await getLatestStableFabricLoader()
      const candidateId = `fabric-loader-${loaderVer}-${req.mcVersion}`

      if (isLoaderInstalled(candidateId)) {
        launchVersionId = candidateId
        this.progress({ phase: 'loader', message: `Fabric ${loaderVer} já instalado`, percent: 55 })
      } else {
        this.progress({ phase: 'loader', message: 'Instalando Fabric…', percent: 42 })
        launchVersionId = await installFabric({
          minecraftVersion: req.mcVersion,
          version:          loaderVer,
          minecraft:        folder,
        })
        this.progress({ phase: 'loader', message: `Fabric ${loaderVer} instalado`, percent: 55 })
      }

    } else if (req.loader === 'forge') {
      this.progress({ phase: 'loader', message: 'Verificando Forge…', percent: 40 })
      const forgeVer = req.loaderVersion ?? await getLatestForge(req.mcVersion)
      if (!forgeVer) throw new Error(`Nenhuma versão Forge encontrada para Minecraft ${req.mcVersion}`)
      // Forge version folder is typically `<mc>-forge-<ver>` or similar — try both.
      const possibleIds = [
        `${req.mcVersion}-forge-${forgeVer}`,
        `forge-${req.mcVersion}-${forgeVer}`,
      ]
      const existing = possibleIds.find(isLoaderInstalled)
      if (existing) {
        launchVersionId = existing
        this.progress({ phase: 'loader', message: `Forge ${forgeVer} já instalado`, percent: 55 })
      } else {
        this.progress({ phase: 'loader', message: 'Instalando Forge…', percent: 42 })
        launchVersionId = await installForge(
          { mcversion: req.mcVersion, version: forgeVer },
          folder,
          { java: javaExecutable },
        )
        this.progress({ phase: 'loader', message: `Forge ${forgeVer} instalado`, percent: 55 })
      }

    } else if (req.loader === 'neoforge') {
      this.progress({ phase: 'loader', message: 'Verificando NeoForge…', percent: 40 })
      const neoVer = req.loaderVersion ?? await getLatestNeoForge(req.mcVersion)
      if (!neoVer) throw new Error(`Nenhuma versão NeoForge encontrada para Minecraft ${req.mcVersion}`)
      const candidateId = `neoforge-${neoVer}`
      if (isLoaderInstalled(candidateId)) {
        launchVersionId = candidateId
        this.progress({ phase: 'loader', message: `NeoForge ${neoVer} já instalado`, percent: 55 })
      } else {
        this.progress({ phase: 'loader', message: 'Instalando NeoForge…', percent: 42 })
        launchVersionId = await installNeoForged('neoforge', neoVer, folder, { java: javaExecutable })
        this.progress({ phase: 'loader', message: `NeoForge ${neoVer} instalado`, percent: 55 })
      }

    } else if (req.loader === 'quilt') {
      // Quilt uses a Fabric-compatible install path; we treat it as Fabric for now.
      this.progress({
        phase: 'loader',
        message: 'Quilt ainda não suportado — usando Fabric.',
        percent: 55,
      })
      const loaderVer = await getLatestStableFabricLoader()
      const candidateId = `fabric-loader-${loaderVer}-${req.mcVersion}`
      if (isLoaderInstalled(candidateId)) {
        launchVersionId = candidateId
      } else {
        launchVersionId = await installFabric({
          minecraftVersion: req.mcVersion,
          version:          loaderVer,
          minecraft:        folder,
        })
      }
    }

    // ── 3. Resolve + download mods ──────────────────────────────────────────
    // Mods that *must* be disabled for heavy modpacks to even reach the title
    // screen. These match patterns Prism/MultiMC users have hit on big Fabric
    // 1.19.2 packs — `fullstackwatchdog` literally calls Runtime.halt() after
    // a 30s timeout, killing the JVM during init of a 449-mod pack with no
    // stack trace and no heap dump (exactly our bug).
    const PROBLEMATIC_MOD_PATTERNS = [
      /fullstackwatchdog/i,
      /full[-_ ]?stack[-_ ]?watch[-_ ]?dog/i,
      /modpack[-_ ]?update[-_ ]?checker/i,
    ]
    const isProblematicMod = (m: ModSpec): boolean => {
      const haystack = `${m.name ?? ''} ${m.externalId ?? ''}`.toLowerCase()
      return PROBLEMATIC_MOD_PATTERNS.some(re => re.test(haystack))
    }

    if (req.mods.length > 0) {
      this.progress({ phase: 'mods', message: `Baixando ${req.mods.length} mods…`, percent: 60 })

      // Filter out problematic mods before initializing statistics
      const modsToProcess = req.mods.filter(m => !isProblematicMod(m))

      // Initialize cache statistics counters
      const cacheStats: CacheStatistics = {
        total: modsToProcess.length,
        cached: 0,
        downloaded: 0,
        failed: 0,
      }

      // Performance monitoring (Requirements 14.1, 14.3)
      const perfMetrics = {
        totalValidationTimeMs: 0,
        perModValidationTimes: [] as number[],
        slowMods: [] as Array<{ name: string; timeMs: number }>,
      }
      const perfStartTime = Date.now()

      const downloaded: Array<{ cachePath: string; mod: ModSpec }> = []
      /** Mods that failed all retries — we report them at the end so the user
       *  knows exactly which ones are missing instead of seeing a silent
       *  "Skipping jar" cascade later in the Minecraft log. */
      const failedMods: Array<{ name: string; source: string; error: string }> = []
      let done = 0
      const total = req.mods.length

      // Pretty label for progress messages: "Iris Shaders (Modrinth)"
      const labelOf = (m: ModSpec) => {
        const name   = m.name?.trim() || m.externalId || 'mod'
        const source = m.source === 'modrinth' ? 'Modrinth' : 'CurseForge'
        return `${name} (${source})`
      }
      for (const mod of req.mods) {
        const label = labelOf(mod)

        // Skip downloading mods we'll disable anyway; saves bandwidth on
        // every launch.
        if (isProblematicMod(mod)) {
          this.progress({
            phase: 'mods',
            message: `Mods: ${done + 1}/${total} (${cacheStats.cached} cached) — Pulando ${label} (mod problemático)`,
            percent: 60 + (done / total) * 30,
            detail: { cacheStats: cacheStats }
          })
          done++
          continue
        }

        // Show what we're about to download BEFORE the network call so the
        // user sees the current mod even when a download stalls.
        this.progress({
          phase: 'mods',
          message: `Mods: ${done + 1}/${total} (${cacheStats.cached} cached) — ${label}`,
          percent: 60 + (done / total) * 30,
          detail: { cacheStats: cacheStats }
        })

        try {
          const resolved = await resolveMod({
            backendUrl:   req.backendUrl,
            sessionToken: req.sessionToken ?? null,
            source:       mod.source,
            externalId:   mod.externalId,
            versionId:    mod.versionId,
          })
          if (!resolved.downloadUrl) {
            failedMods.push({ name: mod.name ?? mod.externalId, source: mod.source, error: 'sem URL de download' })
            // Increment failed counter when no download URL is available
            cacheStats.failed++
            this.progress({
              phase: 'mods',
              message: `Mods: ${done + 1}/${total} (${cacheStats.cached} cached) — Pulando ${label} (sem URL)`,
              percent: 60 + (done / total) * 30,
              detail: { cacheStats: cacheStats }
            })
            done++
            continue
          }

          // Use sha-based cache so duplicate mods across instances don't re-download.
          const cachePath = resolved.sha1 != null
            ? this.instances.cachedModPath(resolved.sha1)
            : path.join(this.instances.modsCacheDir, '_nohash', resolved.filename)

          // Performance monitoring: Start timing cache validation
          const validationStartTime = Date.now()

          // If we have a cached file but it's corrupted or sha-mismatched,
          // wipe it before re-downloading.
          let needsDownload = !fs.existsSync(cachePath)
          if (!needsDownload) {
            // Validate file size first (cheap check - Requirement 15.8: SHA1 + file size validation)
            if (resolved.fileSize != null) {
              try {
                const stats = fs.statSync(cachePath)
                if (stats.size !== resolved.fileSize) {
                  this.emit('stderr', `[cache] File size mismatch for ${cachePath}: expected ${resolved.fileSize}, got ${stats.size}\n`)
                  needsDownload = true
                }
              } catch (err) {
                // File stat failed - mark as cache miss and re-download
                this.emit('stderr', `[cache] File stat failed for ${cachePath}: ${err instanceof Error ? err.message : String(err)}\n`)
                needsDownload = true
              }
            }
            
            // Validate SHA1 hash (Requirement 11.1: handle SHA1 calculation failures)
            // Only if file size check passed (Requirement 15.8: reduce collision risk)
            if (!needsDownload && resolved.sha1) {
              try {
                const actualSha1 = await fileSha1(cachePath)
                if (actualSha1 !== resolved.sha1.toLowerCase()) {
                  needsDownload = true
                }
              } catch (err) {
                // SHA1 calculation failed - mark as cache miss and re-download (Requirement 11.1)
                this.emit('stderr', `[cache] SHA1 calculation failed for ${cachePath}: ${err instanceof Error ? err.message : String(err)}\n`)
                needsDownload = true
              }
            }
            
            // Validate JAR structure (Requirement 11.2: handle JAR validation failures)
            if (!needsDownload && cachePath.toLowerCase().endsWith('.jar')) {
              const v = await validateJarFile(cachePath)
              if (!v.ok) {
                // JAR validation failed - delete corrupted file and re-download (Requirement 11.2)
                this.emit('stderr', `[cache] JAR validation failed for ${cachePath}: ${v.reason}\n`)
                // Try to salvage repairable cache hits (STORED+descriptor)
                // before forcing a network round-trip.
                if (v.repairable && await repairJarFile(cachePath, cachePath)) {
                  const v2 = await validateJarFile(cachePath)
                  if (!v2.ok) {
                    try { fs.unlinkSync(cachePath) } catch { /* ignore */ }
                    needsDownload = true
                  }
                } else {
                  try { fs.unlinkSync(cachePath) } catch { /* ignore */ }
                  needsDownload = true
                }
              }
            }
          }

          // Performance monitoring: Record validation time
          const validationTimeMs = Date.now() - validationStartTime
          perfMetrics.perModValidationTimes.push(validationTimeMs)
          perfMetrics.totalValidationTimeMs += validationTimeMs

          // Track slow mods (>50ms validation time - Requirement 14.1)
          if (validationTimeMs > 50) {
            perfMetrics.slowMods.push({ name: label, timeMs: validationTimeMs })
            this.emit('stderr', `[perf] Slow cache validation for ${label}: ${validationTimeMs}ms\n`)
          }

          if (needsDownload) {
            // Cache miss - need to download
            await downloadToFileWithRetry(
              resolved.downloadUrl,
              cachePath,
              resolved.sha1,
              (attempt, prevErr) => {
                if (attempt > 1) {
                  const reason = prevErr?.message ?? 'erro desconhecido'
                  this.progress({
                    phase: 'mods',
                    message: `Mods: ${done + 1}/${total} (${cacheStats.cached} cached) — ${label} (tentativa ${attempt}/3: ${reason})`,
                    percent: 60 + (done / total) * 30,
                    detail: { cacheStats: cacheStats }
                  })
                }
              },
            )
            // Increment downloaded counter on successful download
            cacheStats.downloaded++
          } else {
            // Cache hit - all validations passed
            cacheStats.cached++
          }

          downloaded.push({ cachePath, mod })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          failedMods.push({ name: mod.name ?? mod.externalId, source: mod.source, error: msg })
          // Increment failed counter on download failure
          cacheStats.failed++
          this.emit('stderr', `[mods] falhou ${label}: ${msg}\n`)
          this.progress({
            phase: 'mods',
            message: `Mods: ${done + 1}/${total} (${cacheStats.cached} cached) — Falhou ${label}: ${msg}`,
            percent: 60 + (done / total) * 30,
            detail: { cacheStats: cacheStats }
          })
        }
        done++
        this.progress({
          phase: 'mods',
          message: `Mods: ${done}/${total} (${cacheStats.cached} cached)`,
          percent: 60 + (done / total) * 30,
          detail: { 
            downloaded: downloaded.length, 
            failed: failedMods.length,
            cacheStats: cacheStats
          },
        })
      }

      // Log performance metrics (Requirement 14.3)
      const totalTimeMs = Date.now() - perfStartTime
      const avgValidationTimeMs = perfMetrics.perModValidationTimes.length > 0
        ? perfMetrics.totalValidationTimeMs / perfMetrics.perModValidationTimes.length
        : 0
      
      this.emit('stderr', `[perf] Cache validation complete: ${totalTimeMs}ms total, ${avgValidationTimeMs.toFixed(1)}ms avg per mod\n`)
      
      if (perfMetrics.slowMods.length > 0) {
        this.emit('stderr', `[perf] ${perfMetrics.slowMods.length} slow mods (>50ms):\n`)
        for (const slow of perfMetrics.slowMods.slice(0, 10)) {
          this.emit('stderr', `[perf]   - ${slow.name}: ${slow.timeMs}ms\n`)
        }
      }

      // Verify performance requirements (Requirement 14.1, 14.3)
      if (total >= 500 && totalTimeMs > 25000) {
        this.emit('stderr', `[perf] WARNING: Validation took ${totalTimeMs}ms for ${total} mods (target: <25s for 500+ mods)\n`)
      }
      if (avgValidationTimeMs > 50) {
        this.emit('stderr', `[perf] WARNING: Average validation time ${avgValidationTimeMs.toFixed(1)}ms exceeds target of 50ms per mod\n`)
      }

      // Summary: surface failures so the user doesn't have to scroll through
      // hundreds of lines of "Skipping jar" warnings in the Minecraft log to
      // figure out what's missing.
      if (failedMods.length > 0) {
        const preview = failedMods.slice(0, 5).map(f => `${f.name} (${f.error})`).join('; ')
        const more = failedMods.length > 5 ? ` e +${failedMods.length - 5}` : ''
        let summary = `${failedMods.length} mod(s) falharam: ${preview}${more}`
        
        // Suggest network check if >10% of mods failed (Requirement 11.5)
        const failureRate = cacheStats.total > 0 ? (failedMods.length / cacheStats.total) : 0
        if (failureRate > 0.10) {
          summary += '. Verifique sua conexão de rede'
          this.emit('stderr', `[mods] Alta taxa de falhas (${(failureRate * 100).toFixed(1)}%) — verifique sua conexão de rede\n`)
        }
        
        this.emit('stderr', `[mods] ${summary}\n`)
        for (const f of failedMods) {
          this.emit('stderr', `[mods]   - ${f.name} [${f.source}]: ${f.error}\n`)
        }
        this.progress({
          phase: 'mods',
          message: `Mods: ${total}/${total} (${cacheStats.cached} cached) — Aviso: ${summary}`,
          percent: 90,
          detail: { failedMods, cacheStats: cacheStats },
        })
      } else {
        this.progress({
          phase: 'mods',
          message: `Mods: ${total}/${total} (${cacheStats.cached} cached) — todos baixados`,
          percent: 90,
          detail: { cacheStats: cacheStats }
        })
      }

      // Performance monitoring: Log final metrics (Requirements 14.1, 14.3)
      const totalElapsedMs = Date.now() - perfStartTime
      const avgValidationMs = perfMetrics.perModValidationTimes.length > 0
        ? perfMetrics.totalValidationTimeMs / perfMetrics.perModValidationTimes.length
        : 0

      this.emit('stderr', `[perf] Cache validation performance:\n`)
      this.emit('stderr', `[perf]   Total mods processed: ${perfMetrics.perModValidationTimes.length}\n`)
      this.emit('stderr', `[perf]   Total validation time: ${perfMetrics.totalValidationTimeMs}ms\n`)
      this.emit('stderr', `[perf]   Average validation time per mod: ${avgValidationMs.toFixed(2)}ms\n`)
      this.emit('stderr', `[perf]   Total elapsed time (including downloads): ${totalElapsedMs}ms\n`)
      
      if (perfMetrics.slowMods.length > 0) {
        this.emit('stderr', `[perf]   Slow mods (>50ms): ${perfMetrics.slowMods.length}\n`)
        for (const slow of perfMetrics.slowMods.slice(0, 10)) {
          this.emit('stderr', `[perf]     - ${slow.name}: ${slow.timeMs}ms\n`)
        }
        if (perfMetrics.slowMods.length > 10) {
          this.emit('stderr', `[perf]     ... and ${perfMetrics.slowMods.length - 10} more\n`)
        }
      }

      // Warn if performance targets are not met (Requirements 14.1, 14.3)
      if (avgValidationMs > 50) {
        this.emit('stderr', `[perf] WARNING: Average validation time (${avgValidationMs.toFixed(2)}ms) exceeds target of 50ms per mod\n`)
      }
      
      if (perfMetrics.perModValidationTimes.length >= 500 && perfMetrics.totalValidationTimeMs > 25000) {
        this.emit('stderr', `[perf] WARNING: Total validation time for ${perfMetrics.perModValidationTimes.length} mods (${perfMetrics.totalValidationTimeMs}ms) exceeds target of 25 seconds\n`)
      }

      // Place each downloaded jar in the right folder based on what's
      // actually inside it. Modpacks often ship resourcepacks/shaderpacks
      // through the regular "mod" list (CurseForge classifies them
      // separately, but the launcher only sees a download URL). Putting
      // them in mods/ makes NeoForge log "not a valid mod file" warnings
      // and most of them silently fail to apply.
      const modsTarget          = this.instances.modsDir(req.modpackId)
      const resourcepacksTarget = this.instances.resourcepacksDir(req.modpackId)
      const shaderpacksTarget   = this.instances.shaderpacksDir(req.modpackId)

      // Clear stale files in each target dir before placing new ones. Mods
      // are .jar, packs may be .jar or .zip depending on what was placed
      // there in earlier launches — sweep both extensions.
      const wipeArchives = (dir: string, exts: string[]) => {
        try {
          for (const f of fs.readdirSync(dir)) {
            if (exts.some(e => f.endsWith(e))) {
              try { fs.unlinkSync(path.join(dir, f)) } catch { /* ignore */ }
            }
          }
        } catch { /* ignore */ }
      }
      wipeArchives(modsTarget,          ['.jar', '.jar.disabled'])
      wipeArchives(resourcepacksTarget, ['.jar', '.zip', '.jar.disabled'])
      wipeArchives(shaderpacksTarget,   ['.jar', '.zip', '.jar.disabled'])

      const placedCount: Record<JarKind, number> = {
        mod: 0, resourcepack: 0, shaderpack: 0, datapack: 0, unknown: 0,
      }

      for (const { cachePath, mod } of downloaded) {
        const kind = await detectJarKind(cachePath)
        let target: string
        // Resourcepacks/shaderpacks/datapacks are ZIP archives by convention
        // (Iris and the vanilla resource loader both prefer .zip — some
        // shader mods even refuse .jar in shaderpacks/). Mods stay as .jar.
        let extension: string
        switch (kind) {
          case 'resourcepack':
            target = resourcepacksTarget; extension = '.zip'; break
          case 'shaderpack':
            target = shaderpacksTarget;   extension = '.zip'; break
          case 'datapack':
            target = resourcepacksTarget; extension = '.zip'; break
          default:
            target = modsTarget;          extension = '.jar'
        }
        // Use the mod's display name when possible (more legible than the
        // SHA blob the cache uses as filename).
        const baseName = mod.name
          ? mod.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
          : path.basename(cachePath, '.jar')
        const filename = `${baseName}-${path.basename(cachePath, '.jar')}${extension}`
        const dest = path.join(target, filename)
        try {
          fs.copyFileSync(cachePath, dest)
          placedCount[kind]++
        } catch (err) {
          this.progress({
            phase: 'mods',
            message: `Erro ao copiar ${path.basename(cachePath)}: ${err instanceof Error ? err.message : err}`,
          })
        }
      }

      // Tell the user how things were classified — useful when investigating
      // "why is this mod missing".
      this.progress({
        phase: 'mods',
        message: `Mods: ${placedCount.mod} mods, ${placedCount.resourcepack} resourcepacks, ${placedCount.shaderpack} shaderpacks` +
                 (placedCount.unknown > 0 ? ` (${placedCount.unknown} desconhecidos em mods/)` : ''),
        percent: 90,
        detail: { placedCount },
      })
    }

    // ── 3.5 Extract modpack overrides (configs, scripts, kubejs, …) ─────────
    // ATM-class packs ship critical configuration in `overrides/` inside the
    // modpack archive. Without these the modpack runs with vanilla defaults
    // and most features silently break (KubeJS scripts missing, Mekanism
    // configs default, etc.).
    //
    // We do this after mods so failures here can't lose downloaded jars,
    // but before launch so configs are in place when the JVM starts.
    if (req.modpackArchiveUrl && req.modpackArchiveUrl.length > 0) {
      try {
        this.progress({ phase: 'mods', message: 'Baixando arquivo do modpack…', percent: 90 })
        const archiveCachePath = path.join(
          this.instances.modsCacheDir,
          '_archives',
          `${sanitizeFilename(req.modpackId)}.archive.zip`,
        )
        // Cache by sha if provided so we don't re-download every launch.
        let needsArchive = !fs.existsSync(archiveCachePath)
        if (!needsArchive && req.modpackArchiveSha1) {
          const got = await fileSha1(archiveCachePath)
          if (got !== req.modpackArchiveSha1.toLowerCase()) needsArchive = true
        }
        if (needsArchive) {
          await downloadToFileWithRetry(
            req.modpackArchiveUrl,
            archiveCachePath,
            req.modpackArchiveSha1 || undefined,
            (attempt, prevErr) => {
              if (attempt > 1) {
                this.progress({
                  phase: 'mods',
                  message: `Modpack archive (tentativa ${attempt}/3: ${prevErr?.message ?? 'erro'})`,
                  percent: 90,
                })
              }
            },
          )
        }

        this.progress({ phase: 'mods', message: 'Extraindo configs do modpack…', percent: 92 })
        const gameDir = this.instances.gameDir(req.modpackId)
        const result = await extractOverrides(archiveCachePath, gameDir, (cur, tot, name) => {
          if (cur % 50 === 0 || cur === tot) {
            this.progress({
              phase: 'mods',
              message: `Configs: ${cur}/${tot} (${path.basename(name)})`,
              percent: 92,
            })
          }
        })
        this.progress({
          phase: 'mods',
          message: `Configs extraídas: ${result.extracted} arquivos`,
          percent: 93,
        })
      } catch (err) {
        // Non-fatal: log + warn but proceed to launch. A pack without its
        // overrides will run, just with default configs.
        this.emit('stderr', `[overrides] falha: ${err instanceof Error ? err.message : err}\n`)
        this.progress({
          phase: 'mods',
          message: `Aviso: configs não foram extraídas (${err instanceof Error ? err.message : err})`,
          percent: 93,
        })
      }
    }

    // ── 4. Persist instance metadata ─────────────────────────────────────────
    const meta: InstanceMeta = {
      id:        req.modpackId,
      name:      req.modpackName,
      mcVersion: req.mcVersion,
      loader:    req.loader,
      loaderVer: req.loaderVersion,
      createdAt: this.instances.loadMeta(req.modpackId)?.createdAt ?? new Date().toISOString(),
      lastPlayed: new Date().toISOString(),
    }
    this.instances.saveMeta(meta)

    // ── 5. Launch ───────────────────────────────────────────────────────────
    this.progress({ phase: 'launching', message: 'Verificando libraries…', percent: 92 })

    // After the loader install, the chained version may reference libraries
    // that weren't downloaded. Re-resolve and ensure all libraries/assets
    // are present before handing off to the JVM precheck.
    try {
      const resolved = await Version.parse(folder, launchVersionId)
      await installDependencies(resolved, {
        librariesDownloadConcurrency: 4,
        assetsDownloadConcurrency: 4,
      })
    } catch (err) {
      // If resolution itself fails, surface the message — but don't bail yet,
      // launch precheck below will give a more accurate diagnostic.
      this.emit('stderr', `[deps] ${err instanceof Error ? err.message : String(err)}\n`)
    }

    this.progress({ phase: 'launching', message: 'Iniciando Minecraft…', percent: 95 })

    if (!fs.existsSync(javaExecutable)) {
      throw new Error(`Java não encontrado em: ${javaExecutable}.`)
    }

    // Pick auth: prefer a stored Microsoft Minecraft profile; fall back to offline.
    // We refresh proactively here so a stale token doesn't make the user hit
    // "Failed to log in: Invalid session" mid-session and have to restart the
    // whole launcher. The Minecraft access token lives ~24h and the live.com
    // refresh token lives much longer, so as long as we refresh before launch
    // the experience stays "log in once and forget".
    let gameProfile: { name: string; id: string } = { name: req.offlineUsername || 'Player', id: '' }
    let accessToken = '0'
    let userType: 'mojang' | 'legacy' = 'legacy'

    const useOffline = () => {
      const offline = new OfflineAuthManager()
      const profile = offline.createProfile(req.offlineUsername || 'Player')
      gameProfile = { name: profile.username, id: profile.uuid }
    }
    // Always start from an offline profile so the variable is always defined.
    useOffline()

    try {
      const auth = new MicrosoftAuthManager()
      let tokens = await auth.loadTokens()

      if (tokens?.refreshToken) {
        // Refresh ~5 min before expiry, or immediately if already expired.
        // The Minecraft `expiresAt` is set at chain time; if it's in the past
        // the access_token won't authenticate against join servers.
        const REFRESH_SKEW_MS = 5 * 60 * 1000
        const needsRefresh = !tokens.expiresAt || (tokens.expiresAt - REFRESH_SKEW_MS) < Date.now()
        if (needsRefresh) {
          this.progress({ phase: 'launching', message: 'Renovando login Microsoft…', percent: 94 })
          try {
            const fresh = await auth.refreshToken(tokens.refreshToken)
            await auth.storeTokens(fresh)
            tokens = fresh
          } catch (err) {
            // Refresh failed — fall back to offline mode and warn the user
            // so they know to re-add the account.
            this.emit('stderr', `[auth] refresh falhou: ${err instanceof Error ? err.message : err}\n`)
            tokens = null
          }
        }
      }

      if (tokens?.minecraftAccessToken && tokens.minecraft?.name && tokens.minecraft?.id) {
        gameProfile = { name: tokens.minecraft.name, id: tokens.minecraft.id }
        accessToken = tokens.minecraftAccessToken
        userType = 'mojang'
      } else {
        useOffline()
      }
    } catch {
      useOffline()
    }

    const opts: LaunchOption = {
      version:      launchVersionId,
      gamePath:     this.instances.gameDir(req.modpackId),
      resourcePath: this.instances.minecraftDir,
      javaPath:     javaExecutable,
      maxMemory:    req.maxMemoryMb,
      // Set Xms to half of Xmx instead of a fixed 1 GB. Heavy modpacks (449
      // mods!) bootstrap with massive parallel class loading; if the heap has
      // to grow many times during startup the JVM fragments and can be killed
      // by the OS without a clear stack trace.
      minMemory:    Math.max(2048, Math.floor(req.maxMemoryMb / 2)),
      gameProfile,
      accessToken,
      userType,
      launcherName: 'NimbusLauncher',
      launcherBrand:'Nimbus',
      // JVM args tuned for modded MC (G1GC pause-driven). These mirror what
      // Prism/ATLauncher use for heavy modpacks — without them, Fabric/Forge
      // packs with 200+ mods often OOM silently or stutter heavily.
      extraJVMArgs: [
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+UseG1GC',
        '-XX:G1NewSizePercent=20',
        '-XX:G1ReservePercent=20',
        '-XX:MaxGCPauseMillis=50',
        '-XX:G1HeapRegionSize=32M',
        '-XX:+ParallelRefProcEnabled',
        '-XX:+AlwaysPreTouch',         // commit heap up front, avoid OS lazy-allocate races
        '-XX:+DisableExplicitGC',
        // If we ever do OOM, dump heap so we can diagnose which mod is leaking
        '-XX:+HeapDumpOnOutOfMemoryError',
        `-XX:HeapDumpPath=${path.join(this.instances.gameDir(req.modpackId), 'oom.hprof')}`,
        // Force stderr to flush every line so we don't lose the last error
        '-Dfile.encoding=UTF-8',
        '-Dfml.ignoreInvalidMinecraftCertificates=true',
        '-Dfml.ignorePatchDiscrepancies=true',
      ],
      // Use our own spawn so the child detaches from the parent.
      spawn: (cmd, args, options) =>
        spawn(cmd, [...(args ?? [])], options ?? {}),
    }

    const child: ChildProcess = await launch(opts)

    this.progress({ phase: 'running', message: 'Minecraft em execução', percent: 100 })

    // Forward stdout/stderr to the renderer for diagnostics.
    child.stdout?.on('data', (d: Buffer) => this.emit('stdout', d.toString()))
    child.stderr?.on('data', (d: Buffer) => this.emit('stderr', d.toString()))

    return new Promise((resolve) => {
      child.on('exit', (code) => {
        this.progress({
          phase: code === 0 ? 'done' : 'error',
          message: code === 0 ? 'Minecraft fechado normalmente.' : `Minecraft saiu com código ${code}`,
          percent: 100,
        })
        resolve({ exitCode: code })
      })
    })
  }

  /**
   * Resolve which Java executable to launch with.
   *
   * Strategy:
   *   1. If `autoJava` is true (default) we always prefer a Mojang-managed JRE
   *      matching the MC version. This avoids surprises like "Java 21 crashes
   *      MC 1.19.2 with LWJGL JNI errors".
   *   2. If `autoJava` is false and `javaPath` was provided, we use it as long
   *      as its major version matches what the MC version expects. Otherwise
   *      we still fall back to the managed JRE (and warn).
   *   3. If everything fails, throw with a helpful message.
   */
  private async _resolveJavaForMc(req: LaunchRequest): Promise<string> {
    const requiredMajor = requiredJavaForMc(req.mcVersion)
    const wantsAuto = req.autoJava !== false  // default true

    // First, see if the user-configured Java is acceptable.
    if (!wantsAuto && req.javaPath && fs.existsSync(req.javaPath)) {
      const actualMajor = await detectJavaMajorVersion(req.javaPath)
      if (actualMajor != null && requiredMajor != null && actualMajor === requiredMajor) {
        this.progress({
          phase: 'java',
          message: `Usando Java ${actualMajor} configurado`,
          percent: 2,
        })
        return req.javaPath
      }
      // Mismatch: warn and fall through to auto-download.
      this.emit('stderr',
        `[java] Java configurado tem versão ${actualMajor}, ` +
        `Minecraft ${req.mcVersion} precisa de ${requiredMajor}. ` +
        `Baixando Java ${requiredMajor} automaticamente.\n`)
    }

    // Auto-download path.
    this.progress({
      phase: 'java',
      message: `Verificando Java ${requiredMajor ?? '(auto)'}…`,
      percent: 2,
    })
    try {
      const { executable, major } = await this.javaRuntimes.ensureForMinecraft(
        req.mcVersion,
        (p) => {
          this.progress({
            phase: 'java',
            message: p.message,
            percent: Math.round(p.fraction * 2 + 1),
          })
        },
      )
      this.progress({
        phase: 'java',
        message: `Java ${major} pronto`,
        percent: 3,
      })
      return executable
    } catch (err) {
      // Last resort: use whatever the user configured, even if version mismatches.
      if (req.javaPath && fs.existsSync(req.javaPath)) {
        this.emit('stderr',
          `[java] Auto-download falhou (${err instanceof Error ? err.message : err}), ` +
          `usando Java configurado como fallback.\n`)
        return req.javaPath
      }
      throw new Error(
        `Não foi possível obter um Java compatível para Minecraft ${req.mcVersion}: ` +
        (err instanceof Error ? err.message : String(err)),
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Strip everything but [a-zA-Z0-9_-] from a string so it's safe to use as
 *  part of a filename on every platform. */
function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'modpack'
}

/**
 * Returns the Java major version required for a given Minecraft version,
 * or null when unknown (we don't enforce in that case).
 *
 *   1.16.x        → 8
 *   1.17.x        → 16
 *   1.18.x..1.20.4→ 17
 *   1.20.5+       → 21
 */
function requiredJavaForMc(mcVersion: string): number | null {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(mcVersion.trim())
  if (!m) return null
  const minor = Number(m[1])
  const patch = Number(m[2] ?? 0)
  if (minor <= 16) return 8
  if (minor === 17) return 16
  if (minor < 20) return 17
  if (minor === 20 && patch <= 4) return 17
  return 21
}

/**
 * Runs `java -version` and parses the major version (e.g. 17, 21).
 * Returns null if detection fails — we'd rather skip the check than block.
 */
async function detectJavaMajorVersion(javaPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const child = spawn(javaPath, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let buf = ''
      child.stdout?.on('data', (d: Buffer) => { buf += d.toString() })
      child.stderr?.on('data', (d: Buffer) => { buf += d.toString() })
      child.on('error', () => resolve(null))
      child.on('exit', () => {
        // Output looks like:
        //   openjdk version "17.0.9" 2023-10-17
        //   openjdk version "1.8.0_292"
        const m = /version\s+"(\d+)(?:\.(\d+))?/.exec(buf)
        if (!m) return resolve(null)
        const a = Number(m[1])
        const b = Number(m[2] ?? 0)
        // Java 1.x style → use minor; Java 9+ style → use major.
        resolve(a === 1 ? b : a)
      })
      // Safety timeout — java -version should be instantaneous.
      setTimeout(() => { try { child.kill() } catch { /* ignore */ } resolve(null) }, 5_000)
    } catch {
      resolve(null)
    }
  })
}

/** Pull the most useful message out of an Error or AggregateError. */
function aggregateMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'errors' in err) {
    const errs = (err as { errors: unknown[] }).errors
    if (Array.isArray(errs) && errs.length > 0) {
      const first = errs[0]
      const msg = first instanceof Error ? first.message : String(first)
      return `${msg}${errs.length > 1 ? ` (+${errs.length - 1} similares)` : ''}`
    }
  }
  if (err instanceof Error) return err.message
  return String(err)
}

async function getLatestStableFabricLoader(): Promise<string> {
  const data = await new Promise<string>((resolve, reject) => {
    https.get('https://meta.fabricmc.net/v2/versions/loader', (res) => {
      let chunks = ''
      res.on('data', (c: Buffer) => { chunks += c.toString() })
      res.on('end', () => resolve(chunks))
    }).on('error', reject)
  })
  const list = JSON.parse(data) as Array<{ version: string; stable: boolean }>
  const stable = list.find(v => v.stable)
  if (!stable) throw new Error('Nenhuma versão estável do Fabric encontrada')
  return stable.version
}

/**
 * Returns the latest "recommended" (or "common"/"latest") Forge build for the given Minecraft version.
 */
async function getLatestForge(mcVersion: string): Promise<string | null> {
  try {
    const list = await getForgeVersionList({ minecraft: mcVersion })
    const versions = list.versions ?? []
    if (versions.length === 0) return null
    const recommended = versions.find(v => v.type === 'recommended')
    return (recommended ?? versions[0]).version
  } catch {
    return null
  }
}

/**
 * Fetches the latest stable NeoForge build for the given Minecraft version.
 * NeoForge publishes a Maven metadata XML at:
 *   https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml
 * NeoForge versions follow the pattern <mc-major>.<mc-minor>.<build>
 */
async function getLatestNeoForge(mcVersion: string): Promise<string | null> {
  try {
    const xml = await new Promise<string>((resolve, reject) => {
      https.get('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', (res) => {
        let chunks = ''
        res.on('data', (c: Buffer) => { chunks += c.toString() })
        res.on('end', () => resolve(chunks))
      }).on('error', reject)
    })
    // Extract <version>...</version> entries.
    const versions: string[] = []
    const re = /<version>([^<]+)<\/version>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(xml)) !== null) versions.push(m[1]!)

    // Map MC 1.21.4 → prefix 21.4 ; MC 1.20.6 → 20.6
    const mcParts = mcVersion.replace(/^1\./, '').split('.')
    const prefix = mcParts.length >= 2 ? `${mcParts[0]}.${mcParts[1]}.` : `${mcParts[0]}.0.`
    const matches = versions.filter(v => v.startsWith(prefix) && !v.includes('beta'))
    if (matches.length === 0) return null
    return matches[matches.length - 1]!
  } catch {
    return null
  }
}
