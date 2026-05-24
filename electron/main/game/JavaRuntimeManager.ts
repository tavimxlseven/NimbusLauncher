/**
 * JavaRuntimeManager — auto-download a per-modpack Java runtime.
 *
 * Pipeline overhaul (2026-05): @xmcl/installer's `installJavaRuntimeTask`
 * passes `{ throwOnError: true }` to undici, but undici v7 removed that
 * option, so the call rejects with "invalid throwOnError" before it even
 * starts a download. Until xmcl pins undici, we use Eclipse Adoptium's
 * public API which:
 *   • returns a single archive URL per (feature_version, os, arch, image_type),
 *   • is stable, well-maintained, and Mojang-equivalent for launching MC
 *     (Fabric, Forge, NeoForge all run fine on Temurin).
 *
 *  GET /v3/binary/latest/{feature_version}/ga/{os}/{arch}/{image}/hotspot/normal/eclipse
 *      → 302 redirect to the actual .zip / .tar.gz
 *
 * Versions:
 *   MC ≤ 1.16        → Java 8
 *   MC 1.17          → Java 16
 *   MC 1.18 – 1.20.4 → Java 17
 *   MC 1.20.5+       → Java 21
 *
 * Layout on disk:
 *   <root>/java-runtime/<major>/<extracted-content>/bin/java(.exe)
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as https from 'https'
import * as http from 'http'
import { promisify } from 'util'
import { Writable } from 'stream'
import { validateDownloadUrl } from '../security/SecurityValidator.js'

// yauzl is shipped with our app (transitive dep). We avoid extract-zip
// because it isn't bundled inside the asar in production builds.
// We use require() because yauzl ships no TS types and we want a lazy import.
interface YauzlEntry {
  fileName: string
  externalFileAttributes: number
}
interface YauzlZipFile {
  on(ev: 'entry', cb: (e: YauzlEntry) => void): void
  on(ev: 'end' | 'close' | 'error', cb: (err?: Error) => void): void
  readEntry(): void
  openReadStream(
    entry: YauzlEntry,
    cb: (err: Error | null, stream: NodeJS.ReadableStream | null) => void,
  ): void
}
interface YauzlModule {
  open(
    path: string,
    opts: { lazyEntries?: boolean },
    cb: (err: Error | null, zipfile: YauzlZipFile | null) => void,
  ): void
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yauzlMod = require('yauzl') as YauzlModule

export interface RuntimeProgress {
  message: string
  /** 0..1 */
  fraction: number
}

/** Major Java required for a Minecraft version. */
export function majorVersionForMc(mcVersion: string): number {
  const m = /^1\.(\d+)(?:\.(\d+))?/.exec(mcVersion.trim())
  if (!m) return 21 // default to newest if unknown
  const minor = Number(m[1])
  const patch = Number(m[2] ?? 0)

  if (minor <= 16) return 8
  if (minor === 17) return 16
  if (minor < 20) return 17
  if (minor === 20 && patch <= 4) return 17
  return 21
}

interface AdoptiumOs   { name: 'windows' | 'mac' | 'linux' }
interface AdoptiumArch { name: 'x64' | 'aarch64' | 'x86' }

function detectAdoptium(): { os: AdoptiumOs; arch: AdoptiumArch; archiveExt: 'zip' | 'tar.gz' } {
  const arch = process.arch
  const plat = process.platform
  const a: AdoptiumArch =
    arch === 'arm64' ? { name: 'aarch64' } :
    arch === 'ia32'  ? { name: 'x86' } :
    { name: 'x64' }
  if (plat === 'win32')  return { os: { name: 'windows' }, arch: a, archiveExt: 'zip' }
  if (plat === 'darwin') return { os: { name: 'mac' },     arch: a, archiveExt: 'tar.gz' }
  return { os: { name: 'linux' }, arch: a, archiveExt: 'tar.gz' }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Streams a URL to a file, following redirects, with progress callbacks.
 * Reports the fraction of bytes received based on Content-Length when
 * available (the Adoptium CDN sets it).
 * 
 * Requirements: 15.1, 15.3 - Validates download URL uses HTTPS and trusted domain
 */
function downloadWithProgress(
  url: string,
  dest: string,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Validate download URL before attempting download
    // Requirements: 15.1, 15.3
    const validation = validateDownloadUrl(url)
    if (!validation.valid) {
      reject(new Error(validation.error))
      return
    }

    const tmp = `${dest}.part-${process.pid}-${Date.now()}`
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const out = fs.createWriteStream(tmp)

    const cleanup = (err?: Error) => {
      out.destroy()
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
      if (err) reject(err); else resolve()
    }

    const fetch = (u: string, redirects = 0) => {
      // Validate redirect URLs as well
      // Requirements: 15.1, 15.3
      if (redirects > 0) {
        const redirectValidation = validateDownloadUrl(u)
        if (!redirectValidation.valid) {
          cleanup(new Error(`Invalid redirect URL: ${redirectValidation.error}`))
          return
        }
      }

      const transport = u.startsWith('https:') ? https : http
      const req = transport.get(u, {
        headers: { 'User-Agent': 'NimbusLauncher/0.1 (+nimbusgg.me)' },
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
          res.resume()
          fetch(res.headers.location, redirects + 1)
          return
        }
        if (!res.statusCode || res.statusCode >= 400) {
          cleanup(new Error(`HTTP ${res.statusCode} for ${u}`))
          res.resume()
          return
        }
        const total = Number(res.headers['content-length'] ?? 0)
        let received = 0
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (onProgress && total > 0) onProgress(received, total)
        })
        res.pipe(out)
        out.on('finish', () => {
          out.close()
          try {
            if (fs.existsSync(dest)) fs.unlinkSync(dest)
            fs.renameSync(tmp, dest)
            resolve()
          } catch (err) { cleanup(err as Error) }
        })
        out.on('error', (err) => cleanup(err))
      })
      req.on('error', (err) => cleanup(err))
      req.setTimeout(60_000, () => req.destroy(new Error(`Timeout fetching ${u}`)))
    }

    fetch(url)
  })
}

// ---------------------------------------------------------------------------
// Archive extraction
// ---------------------------------------------------------------------------

import { spawn } from 'child_process'

/**
 * Extracts a single zip entry. Walks the entries lazily, writing files
 * (and creating directories) into `destDir` while preserving the layout.
 */
function extractZipWithYauzl(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzlMod.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('yauzl: open returned no zipfile'))

      zipfile.on('error', reject)
      zipfile.on('end', () => resolve())

      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        const entryName = entry.fileName
        // Reject zip slip attacks.
        const safeName = entryName.replace(/\\/g, '/')
        if (safeName.includes('..')) {
          zipfile.readEntry()
          return
        }
        const outPath = path.join(destDir, safeName)

        if (/\/$/.test(safeName)) {
          // Directory entry.
          fs.mkdirSync(outPath, { recursive: true })
          zipfile.readEntry()
          return
        }

        // File entry.
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        zipfile.openReadStream(entry, (err2, readStream) => {
          if (err2 || !readStream) return reject(err2 ?? new Error('openReadStream failed'))
          // Posix-style file mode lives in the high 16 bits of externalFileAttributes.
          const mode = (entry.externalFileAttributes >>> 16) & 0xFFFF
          const out = fs.createWriteStream(outPath, { mode: mode || undefined })
          readStream.on('error', reject)
          readStream.pipe(out as Writable)
          out.on('finish', () => zipfile.readEntry())
          out.on('error', reject)
        })
      })
    })
  })
}

/**
 * Extracts a .zip or .tar.gz file into a destination directory.
 * On Windows we use yauzl (shipped as a dep). On macOS/Linux we shell out
 * to tar (always present).
 */
async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true })
  if (archivePath.endsWith('.zip')) {
    await extractZipWithYauzl(archivePath, destDir)
    return
  }
  // tar.gz
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar exited with code ${code}`))
    })
  })
}

/**
 * Adoptium archives extract to a folder like `jdk-17.0.10+7-jre/`. Find
 * the single child directory and return its absolute path so callers
 * can jump straight to bin/java.
 */
function findExtractedRoot(extractedDir: string): string {
  const entries = fs.readdirSync(extractedDir, { withFileTypes: true })
  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name)
  if (dirs.length === 1) return path.join(extractedDir, dirs[0]!)
  // Sometimes the archive extracts directly. If we find bin/java(.exe) at the
  // top level, return extractedDir itself.
  const binJava = process.platform === 'win32'
    ? path.join(extractedDir, 'bin', 'java.exe')
    : path.join(extractedDir, 'bin', 'java')
  if (fs.existsSync(binJava)) return extractedDir
  // Otherwise pick the first directory.
  if (dirs.length > 0) return path.join(extractedDir, dirs[0]!)
  throw new Error(`Não foi possível localizar a raiz extraída em ${extractedDir}`)
}

// ---------------------------------------------------------------------------
// JavaRuntimeManager
// ---------------------------------------------------------------------------

const readdirAsync = promisify(fs.readdir)

export class JavaRuntimeManager {
  /** Root for managed runtimes: <root>/java-runtime/<major>/ */
  readonly runtimeRoot: string

  constructor(rootDir?: string) {
    const root = rootDir ?? path.join(os.homedir(), '.nimbus-launcher')
    this.runtimeRoot = path.join(root, 'java-runtime')
  }

  private dirFor(major: number): string {
    return path.join(this.runtimeRoot, String(major))
  }

  /**
   * Walks the runtime folder for `major` looking for bin/java(.exe).
   * Returns the path or null.
   */
  private findJavaExecutable(major: number): string | null {
    const dir = this.dirFor(major)
    if (!fs.existsSync(dir)) return null
    const exeName = process.platform === 'win32' ? 'java.exe' : 'java'
    // 1) <dir>/bin/<exe>
    const direct = path.join(dir, 'bin', exeName)
    if (fs.existsSync(direct)) return direct
    // 2) <dir>/<root>/bin/<exe>
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
    catch { return null }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      // macOS layout: <root>/Contents/Home/bin/<exe>
      if (process.platform === 'darwin') {
        const macExe = path.join(dir, e.name, 'Contents', 'Home', 'bin', exeName)
        if (fs.existsSync(macExe)) return macExe
      }
      const exe = path.join(dir, e.name, 'bin', exeName)
      if (fs.existsSync(exe)) return exe
    }
    return null
  }

  /** True when a usable Java executable is already on disk. */
  isInstalled(major: number): boolean {
    return this.findJavaExecutable(major) != null
  }

  /**
   * Build the Adoptium download URL for a feature version.
   *
   * Docs: https://api.adoptium.net/q/swagger-ui/
   * Endpoint: /v3/binary/latest/{feature}/ga/{os}/{arch}/jre/hotspot/normal/eclipse
   */
  private adoptiumUrl(major: number): string {
    const { os: o, arch } = detectAdoptium()
    return `https://api.adoptium.net/v3/binary/latest/${major}/ga/${o.name}/${arch.name}/jre/hotspot/normal/eclipse`
  }

  /**
   * Ensure a Java runtime for the given major version is installed; download
   * if it isn't. Returns the path to the java executable.
   *
   * `onProgress` is called with a 0..1 fraction so the UI can show a bar
   * while pulling the (~40 MB) JRE archive.
   */
  async ensureRuntime(
    major: number,
    onProgress?: (p: RuntimeProgress) => void,
  ): Promise<string> {
    const cached = this.findJavaExecutable(major)
    if (cached) return cached

    const dir = this.dirFor(major)
    fs.mkdirSync(dir, { recursive: true })

    const { archiveExt } = detectAdoptium()
    const archivePath = path.join(dir, `_dl.${archiveExt}`)

    onProgress?.({ message: `Buscando Java ${major} (Adoptium Temurin)…`, fraction: 0 })

    const url = this.adoptiumUrl(major)

    // 1. Download the archive with progress.
    let lastEmit = 0
    await downloadWithProgress(url, archivePath, (received, total) => {
      const now = Date.now()
      if (now - lastEmit < 250) return
      lastEmit = now
      const frac = total > 0 ? Math.min(0.95, received / total) : 0
      onProgress?.({
        message: `Baixando Java ${major} (${formatBytes(received)} / ${formatBytes(total)})`,
        fraction: frac,
      })
    })

    // 2. Extract.
    onProgress?.({ message: `Extraindo Java ${major}…`, fraction: 0.96 })
    try {
      await extractArchive(archivePath, dir)
    } finally {
      try { fs.unlinkSync(archivePath) } catch { /* ignore */ }
    }

    // 3. On non-Windows, ensure the executable bit on java + child binaries.
    if (process.platform !== 'win32') {
      try {
        const root = findExtractedRoot(dir)
        const binDir = process.platform === 'darwin'
          ? path.join(root, 'Contents', 'Home', 'bin')
          : path.join(root, 'bin')
        const files = await readdirAsync(binDir)
        for (const f of files) {
          try { fs.chmodSync(path.join(binDir, f), 0o755) } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }

    const exe = this.findJavaExecutable(major)
    if (!exe) {
      throw new Error(
        `Java ${major} foi baixado mas o executável não foi encontrado em ${dir}. ` +
        `Conteúdo: ${(fs.readdirSync(dir).join(', ') || '(vazio)')}`)
    }

    onProgress?.({ message: `Java ${major} pronto`, fraction: 1 })
    return exe
  }

  /**
   * Convenience: ensure the right Java runtime for a Minecraft version and
   * return the executable path.
   */
  async ensureForMinecraft(
    mcVersion: string,
    onProgress?: (p: RuntimeProgress) => void,
  ): Promise<{ executable: string; major: number }> {
    const major = majorVersionForMc(mcVersion)
    const executable = await this.ensureRuntime(major, onProgress)
    return { executable, major }
  }
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
