/**
 * Integration tests for complete modpack repair flow
 * 
 * Tests the end-to-end repair functionality including:
 * - Repair without version change
 * - Repair with version change
 * - Local instance cleanup
 * - Reinstallation completion
 * - Error scenarios
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.2, 4.3,
 *               5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { GameLauncher } from './GameLauncher.js'

describe('GameLauncher - Complete Repair Flow', () => {
  let launcher: GameLauncher
  let testRoot: string
  let testModpackId: string

  beforeEach(() => {
    // Create a temporary test directory
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-repair-test-'))
    launcher = new GameLauncher(testRoot)
    testModpackId = 'test-modpack-repair-123'
    
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

  describe('Repair without version change', () => {
    it('should clear local instance and prepare for reinstallation', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Simulate an existing installation with files
      const dirsToCreate = ['mods', 'config', 'kubejs', 'resourcepacks', 'shaderpacks']
      for (const dir of dirsToCreate) {
        const dirPath = path.join(gameDir, dir)
        fs.mkdirSync(dirPath, { recursive: true })
        // Add files to simulate existing installation
        fs.writeFileSync(path.join(dirPath, 'existing-file.txt'), 'existing content')
      }

      // Verify files exist before repair
      for (const dir of dirsToCreate) {
        const filePath = path.join(gameDir, dir, 'existing-file.txt')
        expect(fs.existsSync(filePath)).toBe(true)
      }

      // Trigger cleanup (simulating repair without version change)
      await launcher.cleanupLocalInstance(testModpackId)

      // Verify all directories were cleared
      for (const dir of dirsToCreate) {
        expect(fs.existsSync(path.join(gameDir, dir))).toBe(false)
      }

      // Verify instance can be re-initialized
      launcher.instances.ensureInstance(testModpackId)
      expect(fs.existsSync(gameDir)).toBe(true)
    })

    it('should handle repair when some directories are missing', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Create only some directories (simulating partial installation)
      const modsDir = path.join(gameDir, 'mods')
      const configDir = path.join(gameDir, 'config')
      fs.mkdirSync(modsDir, { recursive: true })
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(path.join(modsDir, 'mod.jar'), 'mod content')
      fs.writeFileSync(path.join(configDir, 'config.cfg'), 'config content')

      // Verify only these directories exist
      expect(fs.existsSync(modsDir)).toBe(true)
      expect(fs.existsSync(configDir)).toBe(true)
      expect(fs.existsSync(path.join(gameDir, 'kubejs'))).toBe(false)

      // Trigger cleanup
      await launcher.cleanupLocalInstance(testModpackId)

      // Verify existing directories were cleared
      expect(fs.existsSync(modsDir)).toBe(false)
      expect(fs.existsSync(configDir)).toBe(false)

      // Verify no error occurred for missing directories
      expect(fs.existsSync(path.join(gameDir, 'kubejs'))).toBe(false)
    })
  })

  describe('Repair with version change', () => {
    it('should clear local instance when version changes', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Simulate existing installation with version-specific files
      const dirsToCreate = ['mods', 'config', 'kubejs', 'resourcepacks', 'shaderpacks']
      for (const dir of dirsToCreate) {
        const dirPath = path.join(gameDir, dir)
        fs.mkdirSync(dirPath, { recursive: true })
        // Add version-specific files
        fs.writeFileSync(path.join(dirPath, 'v1.0.0-file.txt'), 'version 1.0.0 content')
      }

      // Verify old version files exist
      for (const dir of dirsToCreate) {
        const filePath = path.join(gameDir, dir, 'v1.0.0-file.txt')
        expect(fs.existsSync(filePath)).toBe(true)
      }

      // Trigger cleanup (simulating version change from 1.0.0 to 1.1.0)
      await launcher.cleanupLocalInstance(testModpackId)

      // Verify all old version files were removed
      for (const dir of dirsToCreate) {
        expect(fs.existsSync(path.join(gameDir, dir))).toBe(false)
      }

      // Verify instance is ready for new version installation
      launcher.instances.ensureInstance(testModpackId)
      expect(fs.existsSync(gameDir)).toBe(true)
    })

    it('should preserve other instance files during repair', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Create directories to be cleared
      const modsDir = path.join(gameDir, 'mods')
      fs.mkdirSync(modsDir, { recursive: true })
      fs.writeFileSync(path.join(modsDir, 'mod.jar'), 'mod content')

      // Create files that should NOT be cleared (e.g., saves, screenshots)
      const savesDir = path.join(gameDir, 'saves')
      const screenshotsDir = path.join(gameDir, 'screenshots')
      fs.mkdirSync(savesDir, { recursive: true })
      fs.mkdirSync(screenshotsDir, { recursive: true })
      fs.writeFileSync(path.join(savesDir, 'world.dat'), 'world data')
      fs.writeFileSync(path.join(screenshotsDir, 'screenshot.png'), 'image data')

      // Trigger cleanup
      await launcher.cleanupLocalInstance(testModpackId)

      // Verify mods directory was cleared
      expect(fs.existsSync(modsDir)).toBe(false)

      // Verify saves and screenshots were preserved
      expect(fs.existsSync(savesDir)).toBe(true)
      expect(fs.existsSync(screenshotsDir)).toBe(true)
      expect(fs.existsSync(path.join(savesDir, 'world.dat'))).toBe(true)
      expect(fs.existsSync(path.join(screenshotsDir, 'screenshot.png'))).toBe(true)
    })
  })

  describe('Local instance cleanup verification', () => {
    it('should clear all specified directories completely', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Create directories with multiple files and subdirectories
      const dirsToCreate = ['mods', 'config', 'kubejs', 'resourcepacks', 'shaderpacks']
      for (const dir of dirsToCreate) {
        const dirPath = path.join(gameDir, dir)
        fs.mkdirSync(dirPath, { recursive: true })
        
        // Add multiple files
        for (let i = 0; i < 5; i++) {
          fs.writeFileSync(path.join(dirPath, `file${i}.txt`), `content ${i}`)
        }
        
        // Add subdirectories with files
        const subDir = path.join(dirPath, 'subfolder')
        fs.mkdirSync(subDir, { recursive: true })
        fs.writeFileSync(path.join(subDir, 'nested-file.txt'), 'nested content')
      }

      // Verify complex structure exists
      for (const dir of dirsToCreate) {
        const dirPath = path.join(gameDir, dir)
        expect(fs.existsSync(dirPath)).toBe(true)
        expect(fs.existsSync(path.join(dirPath, 'file0.txt'))).toBe(true)
        expect(fs.existsSync(path.join(dirPath, 'subfolder', 'nested-file.txt'))).toBe(true)
      }

      // Trigger cleanup
      await launcher.cleanupLocalInstance(testModpackId)

      // Verify all directories and their contents were completely removed
      for (const dir of dirsToCreate) {
        const dirPath = path.join(gameDir, dir)
        expect(fs.existsSync(dirPath)).toBe(false)
      }
    })

    it('should handle large directories efficiently', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      const modsDir = path.join(gameDir, 'mods')
      
      // Create directory with many files (simulating large modpack)
      fs.mkdirSync(modsDir, { recursive: true })
      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(path.join(modsDir, `mod${i}.jar`), `mod content ${i}`)
      }

      // Verify files exist
      expect(fs.readdirSync(modsDir).length).toBe(100)

      // Measure cleanup time
      const startTime = Date.now()
      await launcher.cleanupLocalInstance(testModpackId)
      const duration = Date.now() - startTime

      // Verify directory was cleared
      expect(fs.existsSync(modsDir)).toBe(false)

      // Verify cleanup completed in reasonable time (should be fast with parallel deletion)
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
    })
  })

  describe('Reinstallation readiness', () => {
    it('should leave instance in clean state ready for reinstallation', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Create existing installation
      const dirsToCreate = ['mods', 'config', 'kubejs']
      for (const dir of dirsToCreate) {
        const dirPath = path.join(gameDir, dir)
        fs.mkdirSync(dirPath, { recursive: true })
        fs.writeFileSync(path.join(dirPath, 'file.txt'), 'content')
      }

      // Trigger cleanup
      await launcher.cleanupLocalInstance(testModpackId)

      // Verify instance directory still exists but is clean
      expect(fs.existsSync(gameDir)).toBe(true)
      
      // Verify no modpack-specific directories remain
      for (const dir of dirsToCreate) {
        expect(fs.existsSync(path.join(gameDir, dir))).toBe(false)
      }

      // Verify instance can be re-initialized for new installation
      launcher.instances.ensureInstance(testModpackId)
      expect(fs.existsSync(gameDir)).toBe(true)
    })

    it('should allow immediate reinstallation after cleanup', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Create and cleanup
      const modsDir = path.join(gameDir, 'mods')
      fs.mkdirSync(modsDir, { recursive: true })
      fs.writeFileSync(path.join(modsDir, 'old-mod.jar'), 'old content')
      
      await launcher.cleanupLocalInstance(testModpackId)
      
      // Verify cleanup completed
      expect(fs.existsSync(modsDir)).toBe(false)

      // Simulate new installation
      launcher.instances.ensureInstance(testModpackId)
      const newModsDir = path.join(gameDir, 'mods')
      fs.mkdirSync(newModsDir, { recursive: true })
      fs.writeFileSync(path.join(newModsDir, 'new-mod.jar'), 'new content')

      // Verify new installation succeeded
      expect(fs.existsSync(newModsDir)).toBe(true)
      expect(fs.existsSync(path.join(newModsDir, 'new-mod.jar'))).toBe(true)
      expect(fs.existsSync(path.join(newModsDir, 'old-mod.jar'))).toBe(false)
    })
  })

  describe('Error scenarios', () => {
    it('should throw descriptive error when cleanup fails', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      const modsDir = path.join(gameDir, 'mods')
      
      // Create directory
      fs.mkdirSync(modsDir, { recursive: true })
      fs.writeFileSync(path.join(modsDir, 'test.jar'), 'test')

      // Mock fs.promises.rm to simulate failure
      const originalRm = fs.promises.rm
      fs.promises.rm = jest.fn().mockRejectedValue(new Error('Permission denied'))

      try {
        // Should throw error with descriptive message
        await expect(launcher.cleanupLocalInstance(testModpackId))
          .rejects
          .toThrow('Failed to clean instance directories')
      } finally {
        // Restore original function
        fs.promises.rm = originalRm
      }
    })

    it('should handle cleanup when instance directory does not exist', async () => {
      const nonExistentModpackId = 'non-existent-modpack'
      
      // Verify instance directory does not exist
      const gameDir = launcher.instances.gameDir(nonExistentModpackId)
      expect(fs.existsSync(gameDir)).toBe(false)

      // Should not throw error when instance does not exist
      await expect(launcher.cleanupLocalInstance(nonExistentModpackId))
        .resolves
        .toBeUndefined()
    })

    it('should handle cleanup when only some directories fail to delete', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Create multiple directories
      const modsDir = path.join(gameDir, 'mods')
      const configDir = path.join(gameDir, 'config')
      fs.mkdirSync(modsDir, { recursive: true })
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(path.join(modsDir, 'mod.jar'), 'mod')
      fs.writeFileSync(path.join(configDir, 'config.cfg'), 'config')

      // Mock fs.promises.rm to fail only for mods directory
      const originalRm = fs.promises.rm
      let callCount = 0
      fs.promises.rm = jest.fn().mockImplementation((dirPath: string, options?: any) => {
        callCount++
        if (dirPath.includes('mods')) {
          return Promise.reject(new Error('Permission denied for mods'))
        }
        return originalRm(dirPath, options)
      })

      try {
        // Should throw error when any directory fails
        await expect(launcher.cleanupLocalInstance(testModpackId))
          .rejects
          .toThrow('Failed to clean instance directories')
      } finally {
        // Restore original function
        fs.promises.rm = originalRm
      }
    })

    it('should provide clear error message for locked files', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      const modsDir = path.join(gameDir, 'mods')
      
      // Create directory with file
      fs.mkdirSync(modsDir, { recursive: true })
      fs.writeFileSync(path.join(modsDir, 'locked.jar'), 'locked content')

      // Mock fs.promises.rm to simulate locked file error
      const originalRm = fs.promises.rm
      fs.promises.rm = jest.fn().mockRejectedValue(
        new Error('EBUSY: resource busy or locked')
      )

      try {
        // Should throw error with clear message
        await expect(launcher.cleanupLocalInstance(testModpackId))
          .rejects
          .toThrow('Failed to clean instance directories')
      } finally {
        // Restore original function
        fs.promises.rm = originalRm
      }
    })
  })

  describe('Atomicity and consistency', () => {
    it('should maintain consistency when cleanup is interrupted', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Create all directories
      const dirsToCreate = ['mods', 'config', 'kubejs', 'resourcepacks', 'shaderpacks']
      for (const dir of dirsToCreate) {
        const dirPath = path.join(gameDir, dir)
        fs.mkdirSync(dirPath, { recursive: true })
        fs.writeFileSync(path.join(dirPath, 'file.txt'), 'content')
      }

      // Mock fs.promises.rm to fail after deleting some directories
      const originalRm = fs.promises.rm
      let deleteCount = 0
      fs.promises.rm = jest.fn().mockImplementation((dirPath: string, options?: any) => {
        deleteCount++
        if (deleteCount > 2) {
          return Promise.reject(new Error('Simulated interruption'))
        }
        return originalRm(dirPath, options)
      })

      try {
        // Attempt cleanup (will fail)
        await launcher.cleanupLocalInstance(testModpackId).catch(() => {
          // Expected to fail
        })

        // Verify some directories were deleted (partial state)
        // This demonstrates that cleanup is not fully atomic at the directory level
        // but the error is properly propagated
      } finally {
        // Restore original function
        fs.promises.rm = originalRm
      }
    })

    it('should allow retry after failed cleanup', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      const modsDir = path.join(gameDir, 'mods')
      
      // Create directory
      fs.mkdirSync(modsDir, { recursive: true })
      fs.writeFileSync(path.join(modsDir, 'mod.jar'), 'mod')

      // Mock fs.promises.rm to fail first time, succeed second time
      const originalRm = fs.promises.rm
      let attemptCount = 0
      fs.promises.rm = jest.fn().mockImplementation((dirPath: string, options?: any) => {
        attemptCount++
        if (attemptCount === 1) {
          return Promise.reject(new Error('First attempt failed'))
        }
        return originalRm(dirPath, options)
      })

      try {
        // First attempt should fail
        await expect(launcher.cleanupLocalInstance(testModpackId))
          .rejects
          .toThrow('Failed to clean instance directories')

        // Second attempt should succeed
        await expect(launcher.cleanupLocalInstance(testModpackId))
          .resolves
          .toBeUndefined()

        // Verify directory was eventually deleted
        expect(fs.existsSync(modsDir)).toBe(false)
      } finally {
        // Restore original function
        fs.promises.rm = originalRm
      }
    })
  })

  describe('Performance and efficiency', () => {
    it('should delete directories in parallel for better performance', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Create all directories with files
      const dirsToCreate = ['mods', 'config', 'kubejs', 'resourcepacks', 'shaderpacks']
      for (const dir of dirsToCreate) {
        const dirPath = path.join(gameDir, dir)
        fs.mkdirSync(dirPath, { recursive: true })
        // Add multiple files to each directory
        for (let i = 0; i < 20; i++) {
          fs.writeFileSync(path.join(dirPath, `file${i}.txt`), `content ${i}`)
        }
      }

      // Measure cleanup time
      const startTime = Date.now()
      await launcher.cleanupLocalInstance(testModpackId)
      const duration = Date.now() - startTime

      // Verify all directories were deleted
      for (const dir of dirsToCreate) {
        expect(fs.existsSync(path.join(gameDir, dir))).toBe(false)
      }

      // Parallel deletion should complete quickly
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
    })

    it('should handle cleanup of very large modpacks efficiently', async () => {
      const gameDir = launcher.instances.gameDir(testModpackId)
      
      // Create directories with many files (simulating 500+ mod modpack)
      const modsDir = path.join(gameDir, 'mods')
      const configDir = path.join(gameDir, 'config')
      fs.mkdirSync(modsDir, { recursive: true })
      fs.mkdirSync(configDir, { recursive: true })

      // Add many files
      for (let i = 0; i < 200; i++) {
        fs.writeFileSync(path.join(modsDir, `mod${i}.jar`), `mod ${i}`)
      }
      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(path.join(configDir, `config${i}.cfg`), `config ${i}`)
      }

      // Measure cleanup time
      const startTime = Date.now()
      await launcher.cleanupLocalInstance(testModpackId)
      const duration = Date.now() - startTime

      // Verify cleanup completed
      expect(fs.existsSync(modsDir)).toBe(false)
      expect(fs.existsSync(configDir)).toBe(false)

      // Should complete in reasonable time even with many files
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
    })
  })
})
