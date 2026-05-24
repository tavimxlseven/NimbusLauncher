/**
 * JavaDetector — Detect installed Java versions on the host system
 *
 * Scans common Java installation locations and the system PATH to find all
 * available Java executables. Returns version information for each one.
 * Alerts the caller when no compatible version is found for a given
 * Minecraft version.
 *
 * Requirements: 9.7
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { type JavaInstallation, type JavaCompatibilityResult } from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Minecraft → minimum Java version mapping
// Requirements: 9.7
// ---------------------------------------------------------------------------

/**
 * Maps Minecraft version prefixes to the minimum required Java major version.
 * Based on official Minecraft Java Edition requirements.
 *
 * Note: 1.20.5+ requires Java 21; 1.20.1–1.20.4 requires Java 17.
 */
const MINECRAFT_JAVA_REQUIREMENTS: Array<{ prefix: string; minJava: number }> = [
  { prefix: '1.21', minJava: 21 },
  { prefix: '1.20.5', minJava: 21 },
  { prefix: '1.20.6', minJava: 21 },
  { prefix: '1.20', minJava: 17 },
  { prefix: '1.19', minJava: 17 },
  { prefix: '1.18', minJava: 17 },
  { prefix: '1.17', minJava: 16 },
  { prefix: '1.16', minJava: 8 },
  { prefix: '1.15', minJava: 8 },
  { prefix: '1.14', minJava: 8 },
  { prefix: '1.13', minJava: 8 },
  { prefix: '1.12', minJava: 8 },
];

/** Default minimum Java version when the Minecraft version is unknown. */
const DEFAULT_MIN_JAVA = 8;

// ---------------------------------------------------------------------------
// Common Java installation directories per platform
// ---------------------------------------------------------------------------

function getCommonJavaDirs(): string[] {
  const platform = os.platform();

  if (platform === 'win32') {
    return [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\Amazon Corretto',
      path.join(os.homedir(), '.jdks'),
    ];
  }

  if (platform === 'darwin') {
    return [
      '/Library/Java/JavaVirtualMachines',
      '/System/Library/Java/JavaVirtualMachines',
      path.join(os.homedir(), 'Library/Java/JavaVirtualMachines'),
    ];
  }

  // Linux
  return [
    '/usr/lib/jvm',
    '/usr/local/lib/jvm',
    '/opt/java',
    '/opt/jdk',
  ];
}

// ---------------------------------------------------------------------------
// JavaDetector
// ---------------------------------------------------------------------------

export class JavaDetector {
  /**
   * Returns the minimum required Java major version for a Minecraft version.
   *
   * Public so tests can call it directly.
   *
   * Requirements: 9.7
   */
  getRequiredJavaVersion(minecraftVersion: string): number {
    for (const { prefix, minJava } of MINECRAFT_JAVA_REQUIREMENTS) {
      if (minecraftVersion.startsWith(prefix)) {
        return minJava;
      }
    }
    return DEFAULT_MIN_JAVA;
  }

  /**
   * Scans the system for all installed Java versions.
   *
   * Checks:
   *   1. The system PATH (via `java -version`)
   *   2. Common installation directories for the current OS
   *
   * Returns a deduplicated list of JavaInstallation objects, sorted by
   * major version descending (newest first).
   *
   * Requirements: 9.7
   */
  async detectAll(): Promise<JavaInstallation[]> {
    const candidates = new Set<string>();

    // 1. Check PATH.
    const pathJava = await this._findJavaOnPath();
    if (pathJava) candidates.add(pathJava);

    // 2. Scan common directories.
    for (const dir of getCommonJavaDirs()) {
      const found = await this._scanDirectory(dir);
      for (const p of found) candidates.add(p);
    }

    // Probe each candidate.
    const installations: JavaInstallation[] = [];
    for (const execPath of candidates) {
      const info = await this._probeJava(execPath);
      if (info) installations.push(info);
    }

    // Sort by major version descending.
    installations.sort((a, b) => b.majorVersion - a.majorVersion);

    // Deduplicate by executable path.
    const seen = new Set<string>();
    return installations.filter((inst) => {
      if (seen.has(inst.executablePath)) return false;
      seen.add(inst.executablePath);
      return true;
    });
  }

  /**
   * Alias for detectAll() — kept for backwards compatibility.
   * Requirements: 9.7
   */
  async detectInstallations(): Promise<JavaInstallation[]> {
    return this.detectAll();
  }

  /**
   * Checks whether a compatible Java version is available for the given
   * Minecraft version.
   *
   * Returns a JavaCompatibilityResult with the best matching installation
   * and an alert message if no compatible version is found.
   *
   * Requirements: 9.7
   */
  async checkCompatibility(minecraftVersion: string): Promise<JavaCompatibilityResult> {
    const required = this.getRequiredJavaVersion(minecraftVersion);
    const all = await this.detectAll();
    const compatible = all.filter((inst) => inst.majorVersion >= required);

    if (compatible.length > 0) {
      return {
        compatible: true,
        installation: compatible[0]!,
        requiredMajorVersion: required,
        alertMessage: null,
        allInstallations: all,
      };
    }

    return {
      compatible: false,
      installation: null,
      requiredMajorVersion: required,
      alertMessage:
        `Nenhuma versão compatível do Java foi encontrada para Minecraft ${minecraftVersion}. ` +
        `É necessário Java ${required} ou superior. ` +
        `Por favor, instale o Java ${required} antes de continuar.`,
      allInstallations: all,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Attempts to find the `java` executable on the system PATH.
   * Returns the resolved path or null.
   */
  private async _findJavaOnPath(): Promise<string | null> {
    const executable = os.platform() === 'win32' ? 'java.exe' : 'java';
    try {
      const { stdout } = await execFileAsync(
        os.platform() === 'win32' ? 'where' : 'which',
        [executable],
      );
      const firstLine = stdout.trim().split('\n')[0]?.trim();
      return firstLine ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Scans a directory for java executables (one level deep for JDK/JRE dirs).
   */
  private async _scanDirectory(dir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const javaExec = this._javaExecutablePath(path.join(dir, entry.name));
        try {
          await fs.promises.access(javaExec, fs.constants.X_OK);
          results.push(javaExec);
        } catch {
          // Not accessible — skip.
        }
      }
    } catch {
      // Directory doesn't exist — skip.
    }
    return results;
  }

  /**
   * Returns the expected java executable path inside a JDK/JRE root.
   */
  private _javaExecutablePath(jdkRoot: string): string {
    const platform = os.platform();
    if (platform === 'win32') {
      return path.join(jdkRoot, 'bin', 'java.exe');
    }
    if (platform === 'darwin') {
      return path.join(jdkRoot, 'Contents', 'Home', 'bin', 'java');
    }
    return path.join(jdkRoot, 'bin', 'java');
  }

  /**
   * Runs `java -version` on the given executable and parses the output.
   * Returns null if the executable is not a valid Java installation.
   */
  private async _probeJava(executablePath: string): Promise<JavaInstallation | null> {
    try {
      // `java -version` writes to stderr.
      const { stderr } = await execFileAsync(executablePath, ['-version'], {
        timeout: 5_000,
      });
      const versionOutput = stderr.trim();
      const parsed = this._parseJavaVersionOutput(versionOutput);
      if (!parsed) return null;

      return {
        executablePath,
        versionString: versionOutput,
        majorVersion: parsed.majorVersion,
        vendor: parsed.vendor,
        isJdk: await this._isJdk(executablePath),
      };
    } catch {
      return null;
    }
  }

  /**
   * Parses the output of `java -version` into version components.
   *
   * Handles both legacy format ("java version \"1.8.0_292\"") and
   * modern format ("openjdk version \"17.0.2\"").
   */
  private _parseJavaVersionOutput(
    versionOutput: string,
  ): { majorVersion: number; vendor: string } | null {
    // Extract vendor from first line (e.g. "openjdk", "java").
    const vendorMatch = /^(\S+)\s+version/.exec(versionOutput);
    const rawVendor = vendorMatch?.[1] ?? 'unknown';
    const vendor = this._normaliseVendor(rawVendor, versionOutput);

    // Modern format: version "17.0.2" or version "21.0.1"
    const modernMatch = /version "(\d+)\.(\d+)/.exec(versionOutput);
    if (modernMatch) {
      const major = parseInt(modernMatch[1]!, 10);
      if (major >= 9) {
        return { majorVersion: major, vendor };
      }
      // Java 8 and below: "1.8.0_292" — major is the second component
      const minor = parseInt(modernMatch[2]!, 10);
      return { majorVersion: minor, vendor };
    }

    return null;
  }

  /**
   * Normalises vendor strings from `java -version` output.
   */
  private _normaliseVendor(rawVendor: string, fullOutput: string): string {
    if (fullOutput.toLowerCase().includes('adoptium') || fullOutput.toLowerCase().includes('temurin')) {
      return 'Eclipse Adoptium';
    }
    if (fullOutput.toLowerCase().includes('corretto')) {
      return 'Amazon Corretto';
    }
    if (fullOutput.toLowerCase().includes('microsoft')) {
      return 'Microsoft';
    }
    if (rawVendor.toLowerCase() === 'openjdk') {
      return 'OpenJDK';
    }
    if (rawVendor.toLowerCase() === 'java') {
      return 'Oracle';
    }
    return rawVendor;
  }

  /**
   * Checks whether the Java installation is a JDK (has `javac`) or JRE.
   */
  private async _isJdk(javaExecPath: string): Promise<boolean> {
    const javacPath = javaExecPath.replace(/java(\.exe)?$/, 'javac$1');
    try {
      await fs.promises.access(javacPath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
}
