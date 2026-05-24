/**
 * ProfileManager — CRUD for installation profiles
 *
 * Manages multiple independent Minecraft installation profiles. Each profile
 * stores its own Minecraft version, loader, loader version, install path and
 * mod list. Profiles are persisted as a JSON file on disk.
 *
 * Profile removal is a two-step process:
 *   1. `previewRemoval(id)` — returns the profile and the list of files that
 *      would be deleted. The caller shows this as a confirmation dialog.
 *   2. `removeProfile(id)` — deletes all associated files and removes the
 *      profile from the index.
 *
 * Uses only Node.js built-in modules (`fs`, `path`, `os`, `crypto`).
 *
 * Requirements: 9.5, 9.6
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  type InstallationProfile,
  type CreateProfileInput,
  type UpdateProfileInput,
  type RemovalPreview,
  type RemoveProfileResult,
  ProfileError,
} from './types.js';

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------

export type { CreateProfileInput, UpdateProfileInput };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default directory where the profiles index file is stored.
 * Placed in the user's home directory under `.nimbus-launcher`.
 */
const DEFAULT_PROFILES_DIR = path.join(os.homedir(), '.nimbus-launcher');

/** Filename for the profiles index JSON. */
const PROFILES_FILE = 'profiles.json';

// ---------------------------------------------------------------------------
// ProfileManager
// ---------------------------------------------------------------------------

export class ProfileManager {
  private readonly profilesFilePath: string;

  /**
   * @param profilesDir - Directory where the profiles index file is stored.
   *                      Defaults to `~/.nimbus-launcher`.
   */
  constructor(profilesDir: string = DEFAULT_PROFILES_DIR) {
    this.profilesFilePath = path.join(profilesDir, PROFILES_FILE);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Creates a new installation profile and persists it.
   *
   * Generates a UUID v4 for the profile ID and sets `createdAt`/`updatedAt`
   * to the current ISO timestamp.
   *
   * Requirements: 9.5
   *
   * @param input - Profile creation data.
   * @returns The newly created profile.
   */
  async createProfile(input: CreateProfileInput): Promise<InstallationProfile> {
    this._validateCreateInput(input);

    const now = new Date().toISOString();
    const profile: InstallationProfile = {
      id: this._generateId(),
      name: input.name.trim(),
      minecraftVersion: input.minecraftVersion.trim(),
      loader: input.loader,
      loaderVersion: input.loaderVersion.trim(),
      installPath: input.installPath,
      javaPath: input.javaPath,
      mods: input.mods ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const profiles = await this._loadProfiles();
    profiles.push(profile);
    await this._saveProfiles(profiles);

    return profile;
  }

  /**
   * Returns all stored installation profiles.
   *
   * Requirements: 9.5
   */
  async listProfiles(): Promise<InstallationProfile[]> {
    return this._loadProfiles();
  }

  /**
   * Returns a single profile by ID, or null if not found.
   *
   * Requirements: 9.5
   *
   * @param id - The profile UUID.
   */
  async getProfile(id: string): Promise<InstallationProfile | null> {
    const profiles = await this._loadProfiles();
    return profiles.find((p) => p.id === id) ?? null;
  }

  /**
   * Updates an existing profile with the provided fields.
   *
   * Only the fields present in `input` are updated; all other fields remain
   * unchanged. `updatedAt` is always refreshed.
   *
   * Requirements: 9.5
   *
   * @param id    - The profile UUID to update.
   * @param input - Partial profile data to apply.
   * @returns The updated profile.
   * @throws ProfileError if the profile is not found.
   */
  async updateProfile(id: string, input: UpdateProfileInput): Promise<InstallationProfile> {
    const profiles = await this._loadProfiles();
    const index = profiles.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new ProfileError(`Profile not found: ${id}`, 'profile_not_found');
    }

    const existing = profiles[index]!;
    const updated: InstallationProfile = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.minecraftVersion !== undefined ? { minecraftVersion: input.minecraftVersion.trim() } : {}),
      ...(input.loader !== undefined ? { loader: input.loader } : {}),
      ...(input.loaderVersion !== undefined ? { loaderVersion: input.loaderVersion.trim() } : {}),
      ...(input.installPath !== undefined ? { installPath: input.installPath } : {}),
      ...(input.javaPath !== undefined ? { javaPath: input.javaPath } : {}),
      ...(input.mods !== undefined ? { mods: input.mods } : {}),
      updatedAt: new Date().toISOString(),
    };

    profiles[index] = updated;
    await this._saveProfiles(profiles);

    return updated;
  }

  /**
   * Returns a preview of what would be deleted when removing a profile.
   *
   * This is used to populate the confirmation dialog shown to the user before
   * removal. The caller should display this information and ask for
   * confirmation before calling `removeProfile`.
   *
   * Requirements: 9.6
   *
   * @param id - The profile UUID.
   * @returns Preview object with the profile and list of files to delete.
   * @throws ProfileError if the profile is not found.
   */
  async previewRemoval(id: string): Promise<RemovalPreview> {
    const profile = await this.getProfile(id);
    if (!profile) {
      throw new ProfileError(`Profile not found: ${id}`, 'profile_not_found');
    }

    const filesToDelete = await this._listInstallFiles(profile.installPath);

    return { profile, filesToDelete };
  }

  /**
   * Removes a profile, optionally deleting all associated files.
   *
   * When `confirmed` is `false` (dry-run / preview), returns the list of
   * files that would be deleted without actually deleting anything. This is
   * used to populate the confirmation dialog shown to the user.
   *
   * When `confirmed` is `true`, deletes all associated files from the file
   * system and removes the profile from the index.
   *
   * Requirements: 9.6
   *
   * @param id        - The profile UUID to remove.
   * @param confirmed - `false` for dry-run preview; `true` to actually delete.
   * @returns RemoveProfileResult with success flag, deleted files and errors.
   * @throws ProfileError if the profile is not found.
   */
  async removeProfile(id: string, confirmed = true): Promise<RemoveProfileResult> {
    const profile = await this.getProfile(id);
    if (!profile) {
      throw new ProfileError(`Profile not found: ${id}`, 'profile_not_found');
    }

    // Collect the list of files that would be (or are being) deleted.
    const filesToDelete = await this._listInstallFiles(profile.installPath);

    if (!confirmed) {
      // Dry-run: return the preview without deleting anything.
      return { success: false, deletedFiles: filesToDelete, errors: [] };
    }

    // Confirmed: delete all files in the install directory.
    const errors: string[] = [];
    try {
      await this._deleteInstallDirectory(profile.installPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
    }

    // Remove the profile from the index regardless of file deletion errors.
    const profiles = await this._loadProfiles();
    const filtered = profiles.filter((p) => p.id !== id);
    await this._saveProfiles(filtered);

    return { success: true, deletedFiles: filesToDelete, errors };
  }

  // -------------------------------------------------------------------------
  // Private helpers (some are patched in tests)
  // -------------------------------------------------------------------------

  /**
   * Generates a UUID v4 using Node.js crypto.
   */
  private _generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Validates the input for profile creation.
   * @throws ProfileError on invalid input.
   */
  private _validateCreateInput(input: CreateProfileInput): void {
    if (!input.name || input.name.trim().length === 0) {
      throw new ProfileError('Profile name cannot be empty', 'invalid_input');
    }
    if (!input.minecraftVersion || input.minecraftVersion.trim().length === 0) {
      throw new ProfileError('Minecraft version cannot be empty', 'invalid_input');
    }
    if (!input.loaderVersion || input.loaderVersion.trim().length === 0) {
      throw new ProfileError('Loader version cannot be empty', 'invalid_input');
    }
    if (!input.installPath || input.installPath.trim().length === 0) {
      throw new ProfileError('Install path cannot be empty', 'invalid_input');
    }
  }

  /**
   * Lists all files in the install directory recursively.
   * Returns an empty array if the directory does not exist.
   *
   * This method is patched in tests to avoid real file system access.
   */
  private async _listInstallFiles(installPath: string): Promise<string[]> {
    const files: string[] = [];
    try {
      await this._collectFilesRecursively(installPath, files);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
    return files;
  }

  /**
   * Deletes the install directory and all its contents.
   * No-op if the directory does not exist.
   *
   * This method is patched in tests to avoid real file system access.
   */
  private async _deleteInstallDirectory(installPath: string): Promise<void> {
    try {
      await fs.promises.rm(installPath, { recursive: true, force: true });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Recursively collects all file paths under a directory.
   */
  private async _collectFilesRecursively(dir: string, files: string[]): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._collectFilesRecursively(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
  }

  /**
   * Loads the profiles index from disk.
   * Returns an empty array if the file does not exist.
   */
  private async _loadProfiles(): Promise<InstallationProfile[]> {
    try {
      const raw = await fs.promises.readFile(this.profilesFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as InstallationProfile[];
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * Saves the profiles index to disk.
   * Creates the parent directory if it does not exist.
   */
  private async _saveProfiles(profiles: InstallationProfile[]): Promise<void> {
    const dir = path.dirname(this.profilesFilePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      this.profilesFilePath,
      JSON.stringify(profiles, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
  }
}
