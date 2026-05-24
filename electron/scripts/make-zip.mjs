/**
 * make-zip.mjs
 *
 * Reads the version from package.json and creates:
 *   release/Nimbus-Launcher-vX.Y.Z-win-x64.zip
 *
 * from the already-built release/win-unpacked/ directory.
 *
 * Run automatically by `npm run release` after electron-builder finishes.
 */

import { createWriteStream, existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'

// ── Resolve paths ─────────────────────────────────────────────────────────────
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root      = join(__dirname, '..')
const pkg       = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version   = pkg.version
const srcDir    = join(root, 'release', 'win-unpacked')
const outFile   = join(root, 'release', `Nimbus-Launcher-v${version}-win-x64.zip`)

// ── Rename portable to match naming convention ────────────────────────────────
import { renameSync } from 'fs'

const portableSrc  = join(root, 'release', `Nimbus Launcher ${version}.exe`)
const portableDest = join(root, 'release', `Nimbus-Launcher-Portable-${version}.exe`)
const setupSrc     = join(root, 'release', `Nimbus Launcher Setup ${version}.exe`)
const setupDest    = join(root, 'release', `Nimbus-Launcher-Setup-${version}.exe`)

if (existsSync(portableSrc))  { renameSync(portableSrc,  portableDest);  console.log(`✓ Renamed → ${portableDest}`) }
if (existsSync(setupSrc))     { renameSync(setupSrc,     setupDest);     console.log(`✓ Renamed → ${setupDest}`) }

// ── Build ZIP using Node's built-in archiver ──────────────────────────────────
// We use the `archiver` package if available, otherwise fall back to a simple
// zip via the `zip` CLI on the PATH (works on Windows with Git Bash / 7-Zip).
// The cleanest cross-platform approach is to use the `archiver` npm package.

let archived = false

// Try archiver (installed as devDep)
try {
  const archiverPkg = await import('archiver')
  const { ZipArchive } = archiverPkg
  const output  = createWriteStream(outFile)
  const archive = new ZipArchive({ zlib: { level: 6 } })

  await new Promise((resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(srcDir, `Nimbus-Launcher-v${version}`)
    archive.finalize()
  })

  archived = true
  console.log(`✓ ZIP created → ${outFile}`)
} catch {
  // archiver not installed — try PowerShell Compress-Archive (Windows built-in)
}

if (!archived) {
  const { execSync } = await import('child_process')
  try {
    execSync(
      `powershell -Command "Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${outFile}' -Force"`,
      { stdio: 'inherit' }
    )
    archived = true
    console.log(`✓ ZIP created via PowerShell → ${outFile}`)
  } catch (e) {
    console.warn('⚠ Could not create ZIP:', e.message)
    console.warn('  Install archiver:  npm install --save-dev archiver')
    console.warn('  Or run manually:   Compress-Archive release\\win-unpacked release\\Nimbus-Launcher-vX.Y.Z-win-x64.zip')
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n── Release artifacts ──────────────────────────────────────────')
const releaseDir = join(root, 'release')
for (const f of readdirSync(releaseDir)) {
  if (f.endsWith('.exe') || f.endsWith('.zip')) {
    const size = (statSync(join(releaseDir, f)).size / 1024 / 1024).toFixed(1)
    console.log(`  ${f}  (${size} MB)`)
  }
}
console.log('───────────────────────────────────────────────────────────────\n')
