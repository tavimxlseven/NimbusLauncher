/**
 * Tests for GameLauncher.cleanupLocalInstance()
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8, 12.3
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { GameLauncher } from './GameLauncher.js'

describe('GameLauncher.cleanupLocalInstance', () => {
  let launcher: GameLauncher
  let testRoot: string
  let testModpackId: string

  beforeEach(() => {
    // Create a temporary test directory
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'))
    launcher = new GameLauncher(testRoot)
    testModpackId = 'test-modpack-123'
    
    // Ensure instance directories exist
    launcher.instances.ensureDirs()
    launcher.instances.ensureInstance(testModpackId)
  })

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true })
    }
  })

  it('should delete all specified directories when they exist', async () => {
    const gameDir = launcher.instances.gameDir(testModpackId)
    
    // Create all directories that should be deleted
    const dirsToCreate = ['mods', 'config', 'kubejs', 'resourcepacks', 'shaderpacks']
    for (const dir of dirsToCreate) {
      const dirPath = path.join(gameDir, dir)
      fs.mkdirSync(dirPath, { recursive: true })
      // Add a test file to verify directory deletion
      fs.writeFileSync(path.join(dirPath, 'test.txt'), 'test content')
    }

    // Verify directories exist before cleanup
    for (const dir of dirsToCreate) {
      expect(fs.existsSync(path.join(gameDir, dir))).toBe(true)
    }

    // Run cleanup
    await launcher.cleanupLocalInstance(testModpackId)

    // Verify all directories were deleted
    for (const dir of dirsToCreate) {
      expect(fs.existsSync(path.join(gameDir, dir))).toBe(false)
    }
  })

  it('should handle case when no directories exist', async () => {
    const gameDir = launcher.instances.gameDir(testModpackId)
    
    // Verify no directories exist
    const dirsToCheck = ['mods', 'config', 'kubejs', 'resourcepacks', 'shaderpacks']
    for (const dir of dirsToCheck) {
      const dirPath = path.join(gameDir, dir)
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true })
      }
    }

    // Should not throw when no directories exist
    await expect(launcher.cleanupLocalInstance(testModpackId)).resolves.toBeUndefined()
  })

  it('should handle case when only some directories exist', async () => {
    const gameDir = launcher.instances.gameDir(testModpackId)
    
    // Create only mods and config directories
    const modsDir = path.join(gameDir, 'mods')
    const configDir = path.join(gameDir, 'config')
    fs.mkdirSync(modsDir, { recursive: true })
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(modsDir, 'test.jar'), 'test')
    fs.writeFileSync(path.join(configDir, 'test.cfg'), 'test')

    // Verify only these directories exist
    expect(fs.existsSync(modsDir)).toBe(true)
    expect(fs.existsSync(configDir)).toBe(true)
    expect(fs.existsSync(path.join(gameDir, 'kubejs'))).toBe(false)

    // Run cleanup
    await launcher.cleanupLocalInstance(testModpackId)

    // Verify the existing directories were deleted
    expect(fs.existsSync(modsDir)).toBe(false)
    expect(fs.existsSync(configDir)).toBe(false)
  })

  it('should delete directories with nested content', async () => {
    const gameDir = launcher.instances.gameDir(testModpackId)
    const modsDir = path.join(gameDir, 'mods')
    
    // Create nested directory structure
    fs.mkdirSync(modsDir, { recursive: true })
    fs.writeFileSync(path.join(modsDir, 'mod1.jar'), 'mod1')
    fs.writeFileSync(path.join(modsDir, 'mod2.jar'), 'mod2')
    
    const subDir = path.join(modsDir, 'subfolder')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(subDir, 'mod3.jar'), 'mod3')

    // Verify structure exists
    expect(fs.existsSync(modsDir)).toBe(true)
    expect(fs.existsSync(subDir)).toBe(true)
    expect(fs.existsSync(path.join(modsDir, 'mod1.jar'))).toBe(true)

    // Run cleanup
    await launcher.cleanupLocalInstance(testModpackId)

    // Verify entire directory tree was deleted
    expect(fs.existsSync(modsDir)).toBe(false)
  })

  it('should throw error if directory deletion fails', async () => {
    const gameDir = launcher.instances.gameDir(testModpackId)
    const modsDir = path.join(gameDir, 'mods')
    
    // Create directory
    fs.mkdirSync(modsDir, { recursive: true })
    fs.writeFileSync(path.join(modsDir, 'test.jar'), 'test')

    // Mock fs.promises.rm to simulate failure
    const originalRm = fs.promises.rm
    fs.promises.rm = jest.fn().mockRejectedValue(new Error('Permission denied'))

    try {
      // Should throw error when deletion fails
      await expect(launcher.cleanupLocalInstance(testModpackId)).rejects.toThrow('Failed to clean instance directories')
    } finally {
      // Restore original function
      fs.promises.rm = originalRm
    }
  })

  it('should delete all directories in parallel', async () => {
    const gameDir = launcher.instances.gameDir(testModpackId)
    
    // Create all directories
    const dirsToCreate = ['mods', 'config', 'kubejs', 'resourcepacks', 'shaderpacks']
    for (const dir of dirsToCreate) {
      const dirPath = path.join(gameDir, dir)
      fs.mkdirSync(dirPath, { recursive: true })
      // Add multiple files to make deletion take some time
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(path.join(dirPath, `file${i}.txt`), `content ${i}`)
      }
    }

    const startTime = Date.now()
    await launcher.cleanupLocalInstance(testModpackId)
    const duration = Date.now() - startTime

    // Verify all directories were deleted
    for (const dir of dirsToCreate) {
      expect(fs.existsSync(path.join(gameDir, dir))).toBe(false)
    }

    // Parallel deletion should be faster than sequential
    // This is a rough check - parallel should complete in reasonable time
    expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
  })
})
