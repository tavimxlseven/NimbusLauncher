/**
 * Unit tests for ProfileManager
 *
 * Tests cover:
 * - createProfile: creates a profile with generated ID and timestamps
 * - createProfile: validates required fields
 * - listProfiles: returns all profiles
 * - getProfile: returns a profile by ID or null
 * - updateProfile: updates specified fields and refreshes updatedAt
 * - updateProfile: throws ProfileError when profile not found
 * - listProfileFiles: returns files in the install directory
 * - listProfileFiles: throws ProfileError when profile not found
 * - removeProfile (dry-run): returns files without deleting when confirmed=false
 * - removeProfile (confirmed): deletes files and removes profile from index
 * - removeProfile: throws ProfileError when profile not found
 * - removeProfile: handles missing install directory gracefully
 *
 * Requirements: 9.5, 9.6
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProfileManager } from './ProfileManager.js';
import { ProfileError, type CreateProfileInput } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a temporary directory for test isolation. */
async function makeTempDir(): Promise<string> {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'pm-test-'));
}

/** Creates a minimal valid CreateProfileInput. */
function makeInput(overrides: Partial<CreateProfileInput> = {}): CreateProfileInput {
  return {
    name: 'Test Profile',
    minecraftVersion: '1.20.1',
    loader: 'fabric',
    loaderVersion: '0.15.11',
    installPath: '/tmp/test-install',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileManager', () => {
  let tempDir: string;
  let manager: ProfileManager;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    manager = new ProfileManager(tempDir);
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // createProfile
  // -------------------------------------------------------------------------

  describe('createProfile', () => {
    it('creates a profile with a generated UUID and timestamps', async () => {
      const profile = await manager.createProfile(makeInput());

      expect(profile.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(profile.name).toBe('Test Profile');
      expect(profile.minecraftVersion).toBe('1.20.1');
      expect(profile.loader).toBe('fabric');
      expect(profile.loaderVersion).toBe('0.15.11');
      expect(profile.mods).toEqual([]);
      expect(profile.createdAt).toBeDefined();
      expect(profile.updatedAt).toBeDefined();
    });

    it('trims whitespace from name, minecraftVersion and loaderVersion', async () => {
      const profile = await manager.createProfile(
        makeInput({ name: '  My Pack  ', minecraftVersion: ' 1.19.4 ', loaderVersion: ' 0.14.0 ' }),
      );

      expect(profile.name).toBe('My Pack');
      expect(profile.minecraftVersion).toBe('1.19.4');
      expect(profile.loaderVersion).toBe('0.14.0');
    });

    it('persists the profile so it appears in listProfiles', async () => {
      await manager.createProfile(makeInput({ name: 'Alpha' }));
      await manager.createProfile(makeInput({ name: 'Beta' }));

      const profiles = await manager.listProfiles();
      expect(profiles).toHaveLength(2);
      expect(profiles.map((p) => p.name)).toContain('Alpha');
      expect(profiles.map((p) => p.name)).toContain('Beta');
    });

    it('accepts optional mods list', async () => {
      const mods = [
        {
          source: 'modrinth' as const,
          projectId: 'AANobbMI',
          versionId: 'IZskON6d',
          filename: 'sodium.jar',
        },
      ];
      const profile = await manager.createProfile(makeInput({ mods }));
      expect(profile.mods).toHaveLength(1);
      expect(profile.mods[0]!.projectId).toBe('AANobbMI');
    });

    it('throws ProfileError when name is empty', async () => {
      await expect(manager.createProfile(makeInput({ name: '' }))).rejects.toThrow(ProfileError);
      await expect(manager.createProfile(makeInput({ name: '   ' }))).rejects.toThrow(ProfileError);
    });

    it('throws ProfileError when minecraftVersion is empty', async () => {
      await expect(
        manager.createProfile(makeInput({ minecraftVersion: '' })),
      ).rejects.toThrow(ProfileError);
    });

    it('throws ProfileError when loaderVersion is empty', async () => {
      await expect(
        manager.createProfile(makeInput({ loaderVersion: '' })),
      ).rejects.toThrow(ProfileError);
    });

    it('throws ProfileError when installPath is empty', async () => {
      await expect(
        manager.createProfile(makeInput({ installPath: '' })),
      ).rejects.toThrow(ProfileError);
    });
  });

  // -------------------------------------------------------------------------
  // listProfiles
  // -------------------------------------------------------------------------

  describe('listProfiles', () => {
    it('returns an empty array when no profiles exist', async () => {
      const profiles = await manager.listProfiles();
      expect(profiles).toEqual([]);
    });

    it('returns all created profiles', async () => {
      await manager.createProfile(makeInput({ name: 'P1' }));
      await manager.createProfile(makeInput({ name: 'P2' }));
      await manager.createProfile(makeInput({ name: 'P3' }));

      const profiles = await manager.listProfiles();
      expect(profiles).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // getProfile
  // -------------------------------------------------------------------------

  describe('getProfile', () => {
    it('returns the profile with the matching ID', async () => {
      const created = await manager.createProfile(makeInput({ name: 'FindMe' }));
      const found = await manager.getProfile(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('FindMe');
    });

    it('returns null when the ID does not exist', async () => {
      const found = await manager.getProfile('non-existent-id');
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // updateProfile
  // -------------------------------------------------------------------------

  describe('updateProfile', () => {
    it('updates only the specified fields', async () => {
      const created = await manager.createProfile(makeInput({ name: 'Original' }));

      const updated = await manager.updateProfile(created.id, { name: 'Updated' });

      expect(updated.name).toBe('Updated');
      expect(updated.minecraftVersion).toBe(created.minecraftVersion);
      expect(updated.loader).toBe(created.loader);
    });

    it('refreshes updatedAt after update', async () => {
      const created = await manager.createProfile(makeInput());
      // Small delay to ensure timestamps differ.
      await new Promise((r) => setTimeout(r, 5));

      const updated = await manager.updateProfile(created.id, { name: 'New Name' });

      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.updatedAt).getTime(),
      );
    });

    it('persists the update so getProfile returns the new values', async () => {
      const created = await manager.createProfile(makeInput({ name: 'Before' }));
      await manager.updateProfile(created.id, { name: 'After', loader: 'forge' });

      const fetched = await manager.getProfile(created.id);
      expect(fetched!.name).toBe('After');
      expect(fetched!.loader).toBe('forge');
    });

    it('throws ProfileError when the profile does not exist', async () => {
      await expect(
        manager.updateProfile('no-such-id', { name: 'X' }),
      ).rejects.toThrow(ProfileError);
    });

    it('trims whitespace from updated name', async () => {
      const created = await manager.createProfile(makeInput());
      const updated = await manager.updateProfile(created.id, { name: '  Trimmed  ' });
      expect(updated.name).toBe('Trimmed');
    });
  });

  // -------------------------------------------------------------------------
  // previewRemoval
  // -------------------------------------------------------------------------

  describe('previewRemoval', () => {
    it('returns the profile and all files in the install directory', async () => {
      const installDir = await makeTempDir();
      const profile = await manager.createProfile(makeInput({ installPath: installDir }));

      // Create some files in the install directory.
      await fs.promises.writeFile(path.join(installDir, 'mod1.jar'), 'data1');
      await fs.promises.writeFile(path.join(installDir, 'mod2.jar'), 'data2');
      const subDir = path.join(installDir, 'config');
      await fs.promises.mkdir(subDir);
      await fs.promises.writeFile(path.join(subDir, 'settings.json'), '{}');

      const preview = await manager.previewRemoval(profile.id);

      expect(preview.profile.id).toBe(profile.id);
      expect(preview.filesToDelete).toHaveLength(3);
      expect(preview.filesToDelete.some((f) => f.endsWith('mod1.jar'))).toBe(true);
      expect(preview.filesToDelete.some((f) => f.endsWith('mod2.jar'))).toBe(true);
      expect(preview.filesToDelete.some((f) => f.endsWith('settings.json'))).toBe(true);

      await fs.promises.rm(installDir, { recursive: true, force: true });
    });

    it('returns empty filesToDelete when the install directory does not exist', async () => {
      const profile = await manager.createProfile(
        makeInput({ installPath: '/non/existent/path' }),
      );
      const preview = await manager.previewRemoval(profile.id);
      expect(preview.filesToDelete).toEqual([]);
    });

    it('throws ProfileError when the profile does not exist', async () => {
      await expect(manager.previewRemoval('no-such-id')).rejects.toThrow(ProfileError);
    });
  });

  // -------------------------------------------------------------------------
  // removeProfile
  // -------------------------------------------------------------------------

  describe('removeProfile', () => {
    it('deletes all files and removes profile from index', async () => {
      const installDir = await makeTempDir();
      const profile = await manager.createProfile(makeInput({ installPath: installDir }));

      const file1 = path.join(installDir, 'mod1.jar');
      const file2 = path.join(installDir, 'mod2.jar');
      await fs.promises.writeFile(file1, 'data1');
      await fs.promises.writeFile(file2, 'data2');

      const result = await manager.removeProfile(profile.id);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Files should be gone (directory was deleted).
      await expect(fs.promises.access(file1)).rejects.toThrow();
      await expect(fs.promises.access(file2)).rejects.toThrow();

      // Profile should be removed from the index.
      const gone = await manager.getProfile(profile.id);
      expect(gone).toBeNull();
    });

    it('handles missing install directory gracefully', async () => {
      const profile = await manager.createProfile(
        makeInput({ installPath: '/non/existent/path' }),
      );

      const result = await manager.removeProfile(profile.id);

      expect(result.success).toBe(true);

      // Profile should be removed from the index.
      const gone = await manager.getProfile(profile.id);
      expect(gone).toBeNull();
    });

    it('throws ProfileError when the profile does not exist', async () => {
      await expect(manager.removeProfile('no-such-id')).rejects.toThrow(ProfileError);
    });

    it('removes only the target profile, leaving others intact', async () => {
      const p1 = await manager.createProfile(makeInput({ name: 'Keep' }));
      const p2 = await manager.createProfile(makeInput({ name: 'Remove' }));

      await manager.removeProfile(p2.id);

      const profiles = await manager.listProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0]!.id).toBe(p1.id);
    });

    it('dry-run (confirmed=false) returns files without deleting', async () => {
      const installDir = await makeTempDir();
      const profile = await manager.createProfile(makeInput({ installPath: installDir }));

      const file1 = path.join(installDir, 'mod1.jar');
      await fs.promises.writeFile(file1, 'data1');

      const result = await manager.removeProfile(profile.id, false);

      // Dry-run: success=false, files listed but not deleted.
      expect(result.success).toBe(false);
      expect(result.deletedFiles.some((f) => f.endsWith('mod1.jar'))).toBe(true);

      // File should still exist.
      await expect(fs.promises.access(file1)).resolves.toBeUndefined();

      // Profile should still be in the index.
      const still = await manager.getProfile(profile.id);
      expect(still).not.toBeNull();

      await fs.promises.rm(installDir, { recursive: true, force: true });
    });
  });
});
