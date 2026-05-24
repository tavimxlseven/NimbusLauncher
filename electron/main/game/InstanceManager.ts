/**
 * InstanceManager — manages per-modpack folder structure on disk.
 *
 * Layout (under ~/.nimbus-launcher/):
 *
 *   ./instances/<modpackId>/
 *       .minecraft/        (game directory: mods, saves, options.txt, …)
 *       instance.json      (cached metadata: mc_version, loader, last_played, …)
 *
 *   ./minecraft/           (shared: libraries, assets, versions)
 *       libraries/
 *       assets/
 *       versions/
 *
 *   ./mods-cache/          (downloaded mod jars, deduplicated by sha1)
 *       <sha1[0:2]>/<sha1>.jar
 *
 *   ./java-runtime/        (Mojang-managed JREs, optional)
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface InstanceMeta {
  id:          string
  name:        string
  mcVersion:   string
  loader:      'fabric' | 'forge' | 'neoforge' | 'quilt' | 'vanilla'
  loaderVer?:  string
  createdAt:   string
  lastPlayed?: string
}

export class InstanceManager {
  readonly root:           string
  readonly minecraftDir:   string
  readonly libsDir:        string
  readonly assetsDir:      string
  readonly versionsDir:    string
  readonly modsCacheDir:   string
  readonly instancesDir:   string

  constructor(rootDir?: string) {
    this.root         = rootDir ?? path.join(os.homedir(), '.nimbus-launcher')
    this.minecraftDir = path.join(this.root, 'minecraft')
    this.libsDir      = path.join(this.minecraftDir, 'libraries')
    this.assetsDir    = path.join(this.minecraftDir, 'assets')
    this.versionsDir  = path.join(this.minecraftDir, 'versions')
    this.modsCacheDir = path.join(this.root, 'mods-cache')
    this.instancesDir = path.join(this.root, 'instances')
  }

  ensureDirs(): void {
    [this.root, this.minecraftDir, this.libsDir, this.assetsDir,
     this.versionsDir, this.modsCacheDir, this.instancesDir]
      .forEach(d => fs.mkdirSync(d, { recursive: true }))
  }

  instanceDir(id: string): string {
    return path.join(this.instancesDir, sanitizeId(id))
  }

  gameDir(id: string): string {
    return path.join(this.instanceDir(id), '.minecraft')
  }

  modsDir(id: string): string {
    return path.join(this.gameDir(id), 'mods')
  }

  resourcepacksDir(id: string): string {
    return path.join(this.gameDir(id), 'resourcepacks')
  }

  shaderpacksDir(id: string): string {
    return path.join(this.gameDir(id), 'shaderpacks')
  }

  ensureInstance(id: string): void {
    fs.mkdirSync(this.gameDir(id), { recursive: true })
    fs.mkdirSync(this.modsDir(id), { recursive: true })
    fs.mkdirSync(this.resourcepacksDir(id), { recursive: true })
    fs.mkdirSync(this.shaderpacksDir(id), { recursive: true })
  }

  loadMeta(id: string): InstanceMeta | null {
    try {
      const f = path.join(this.instanceDir(id), 'instance.json')
      return JSON.parse(fs.readFileSync(f, 'utf-8')) as InstanceMeta
    } catch { return null }
  }

  saveMeta(meta: InstanceMeta): void {
    this.ensureInstance(meta.id)
    const f = path.join(this.instanceDir(meta.id), 'instance.json')
    fs.writeFileSync(f, JSON.stringify(meta, null, 2), { encoding: 'utf-8', mode: 0o644 })
  }

  cachedModPath(sha1: string): string {
    const safe = sha1.replace(/[^a-f0-9]/gi, '').toLowerCase()
    return path.join(this.modsCacheDir, safe.slice(0, 2), `${safe}.jar`)
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}
