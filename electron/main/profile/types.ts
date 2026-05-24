/**
 * Types for ProfileManager and JavaDetector
 *
 * Requirements: 9.5, 9.6, 9.7
 */

// ---------------------------------------------------------------------------
// Installation Profile
// ---------------------------------------------------------------------------

/**
 * Supported Minecraft mod loaders.
 * Requirements: 9.5
 */
export type ModLoader = 'forge' | 'fabric' | 'quilt' | 'neoforge';

/**
 * A single mod entry within an installation profile.
 * Requirements: 9.5
 */
export interface ProfileMod {
  /** Source platform for this mod. */
  source: 'curseforge' | 'modrinth';
  /** External project ID on the source platform. */
  projectId: string;
  /** Specific version ID of the mod. */
  versionId: string;
  /** Filename of the mod JAR. */
  filename: string;
  /** Expected SHA-256 hash of the file. */
  sha256?: string;
}

/**
 * An installation profile representing a complete Minecraft setup.
 * Requirements: 9.5
 */
export interface InstallationProfile {
  /** Unique identifier for this profile (UUID v4). */
  id: string;
  /** Human-readable name for this profile. */
  name: string;
  /** Minecraft version (e.g. "1.20.1"). */
  minecraftVersion: string;
  /** Mod loader type. */
  loader: ModLoader;
  /** Version of the mod loader (e.g. "0.15.11" for Fabric). */
  loaderVersion: string;
  /** Absolute path to the installation directory. */
  installPath: string;
  /** Optional path to the Java executable to use for this profile. */
  javaPath?: string;
  /** List of mods included in this profile. */
  mods: ProfileMod[];
  /** ISO 8601 timestamp when the profile was created. */
  createdAt: string;
  /** ISO 8601 timestamp when the profile was last updated. */
  updatedAt: string;
}

/**
 * Data required to create a new installation profile.
 * Requirements: 9.5
 */
export interface CreateProfileInput {
  name: string;
  minecraftVersion: string;
  loader: ModLoader;
  loaderVersion: string;
  installPath: string;
  javaPath?: string;
  mods?: ProfileMod[];
}

/**
 * Data that can be updated on an existing profile.
 * Requirements: 9.5
 */
export interface UpdateProfileInput {
  name?: string;
  minecraftVersion?: string;
  loader?: ModLoader;
  loaderVersion?: string;
  installPath?: string;
  javaPath?: string;
  mods?: ProfileMod[];
}

/**
 * Result of a profile removal operation.
 * Requirements: 9.6
 */
export interface RemoveProfileResult {
  /** Whether the removal was completed successfully. */
  success: boolean;
  /** List of files that were deleted (or would be deleted on dry-run). */
  deletedFiles: string[];
  /** Any errors encountered during file deletion. */
  errors: string[];
}


// ---------------------------------------------------------------------------
// Java Detection
// ---------------------------------------------------------------------------

/**
 * Information about a detected Java installation.
 * Requirements: 9.7
 */
export interface JavaInstallation {
  /** Absolute path to the java executable. */
  executablePath: string;
  /** Full version string from `java -version` output (e.g. 'openjdk version "17.0.9"'). */
  versionString: string;
  /** Major version number (e.g. 17). */
  majorVersion: number;
  /** Java vendor/distribution (e.g. "Eclipse Adoptium", "Oracle"). */
  vendor?: string;
  /** Whether this is a JDK (true) or JRE (false). */
  isJdk?: boolean;
}

/**
 * Result of a Java compatibility check.
 * Requirements: 9.7
 */
export interface JavaCompatibilityResult {
  /** Whether a compatible Java version was found. */
  compatible: boolean;
  /** The compatible Java installation, if found. Null when not compatible. */
  installation: JavaInstallation | null;
  /** Minimum required Java major version for the given Minecraft version. */
  requiredMajorVersion: number;
  /** Human-readable alert message when no compatible version is found. Null when compatible. */
  alertMessage: string | null;
  /** All detected Java installations on the system. */
  allInstallations: JavaInstallation[];
}

/**
 * Result of a profile removal preview (confirmation dialog data).
 * Requirements: 9.6
 */
export interface RemovalPreview {
  /** The profile that would be removed. */
  profile: InstallationProfile;
  /** Files that would be deleted. */
  filesToDelete: string[];
}

/**
 * Error thrown when a profile operation fails.
 */
export class ProfileError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ProfileError';
  }
}
