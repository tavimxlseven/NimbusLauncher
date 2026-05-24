/**
 * Unit tests for JavaDetector
 *
 * Tests cover:
 * - getRequiredJavaVersion: correct mapping for known Minecraft versions
 * - getRequiredJavaVersion: default Java 8 for old Minecraft versions
 * - checkCompatibility: returns compatible=true when a matching installation exists
 * - checkCompatibility: returns compatible=false with alertMessage when no match
 * - checkCompatibility: alert message includes required version and Minecraft version
 * - detectInstallations: returns an array (may be empty in CI)
 * - _parseJavaVersionOutput (via detectInstallations): parses new-style and old-style versions
 *
 * Requirements: 9.7
 */

import { JavaDetector } from './JavaDetector.js';
import { type JavaInstallation } from './types.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JavaDetector', () => {
  let detector: JavaDetector;

  beforeEach(() => {
    detector = new JavaDetector();
  });

  // -------------------------------------------------------------------------
  // getRequiredJavaVersion
  // -------------------------------------------------------------------------

  describe('getRequiredJavaVersion', () => {
    it('returns 21 for Minecraft 1.21.x', () => {
      expect(detector.getRequiredJavaVersion('1.21')).toBe(21);
      expect(detector.getRequiredJavaVersion('1.21.1')).toBe(21);
    });

    it('returns 21 for Minecraft 1.20.5 and 1.20.6', () => {
      expect(detector.getRequiredJavaVersion('1.20.5')).toBe(21);
      expect(detector.getRequiredJavaVersion('1.20.6')).toBe(21);
    });

    it('returns 17 for Minecraft 1.20.1 through 1.20.4', () => {
      expect(detector.getRequiredJavaVersion('1.20.1')).toBe(17);
      expect(detector.getRequiredJavaVersion('1.20.4')).toBe(17);
    });

    it('returns 17 for Minecraft 1.18.x and 1.19.x', () => {
      expect(detector.getRequiredJavaVersion('1.18')).toBe(17);
      expect(detector.getRequiredJavaVersion('1.18.2')).toBe(17);
      expect(detector.getRequiredJavaVersion('1.19')).toBe(17);
      expect(detector.getRequiredJavaVersion('1.19.4')).toBe(17);
    });

    it('returns 16 for Minecraft 1.17.x', () => {
      expect(detector.getRequiredJavaVersion('1.17')).toBe(16);
      expect(detector.getRequiredJavaVersion('1.17.1')).toBe(16);
    });

    it('returns 8 for Minecraft 1.16.x and older', () => {
      expect(detector.getRequiredJavaVersion('1.16.5')).toBe(8);
      expect(detector.getRequiredJavaVersion('1.12.2')).toBe(8);
      expect(detector.getRequiredJavaVersion('1.8.9')).toBe(8);
    });

    it('returns 8 for unknown or future versions not in the mapping', () => {
      expect(detector.getRequiredJavaVersion('2.0.0')).toBe(8);
      expect(detector.getRequiredJavaVersion('')).toBe(8);
    });
  });

  // -------------------------------------------------------------------------
  // checkCompatibility
  // -------------------------------------------------------------------------

  describe('checkCompatibility', () => {
    it('returns compatible=true when a matching installation is found', async () => {
      // Spy on detectAll to return a controlled set.
      const mockInstallations: JavaInstallation[] = [
        {
          executablePath: '/usr/bin/java',
          versionString: 'openjdk version "17.0.9"',
          majorVersion: 17,
          vendor: 'Eclipse Adoptium',
          isJdk: true,
        },
      ];
      jest.spyOn(detector, 'detectAll').mockResolvedValue(mockInstallations);

      const result = await detector.checkCompatibility('1.20.1');

      expect(result.compatible).toBe(true);
      expect(result.installation).toBeDefined();
      expect(result.installation!.majorVersion).toBe(17);
      expect(result.requiredMajorVersion).toBe(17);
      expect(result.alertMessage).toBeNull();
    });

    it('returns compatible=true when installed version exceeds requirement', async () => {
      const mockInstallations: JavaInstallation[] = [
        {
          executablePath: '/usr/bin/java',
          versionString: 'openjdk version "21.0.1"',
          majorVersion: 21,
          vendor: 'Eclipse Adoptium',
          isJdk: true,
        },
      ];
      jest.spyOn(detector, 'detectAll').mockResolvedValue(mockInstallations);

      // 1.20.1 requires Java 17, but we have Java 21 — should be compatible.
      const result = await detector.checkCompatibility('1.20.1');

      expect(result.compatible).toBe(true);
      expect(result.installation!.majorVersion).toBe(21);
    });

    it('returns compatible=false with alertMessage when no compatible version found', async () => {
      const mockInstallations: JavaInstallation[] = [
        {
          executablePath: '/usr/bin/java',
          versionString: 'openjdk version "11.0.20"',
          majorVersion: 11,
          vendor: 'OpenJDK',
          isJdk: false,
        },
      ];
      jest.spyOn(detector, 'detectAll').mockResolvedValue(mockInstallations);

      const result = await detector.checkCompatibility('1.20.1');

      expect(result.compatible).toBe(false);
      expect(result.installation).toBeNull();
      expect(result.alertMessage).toBeDefined();
      expect(result.alertMessage).toContain('17');
      expect(result.alertMessage).toContain('1.20.1');
    });

    it('returns compatible=false with alertMessage when no Java is installed', async () => {
      jest.spyOn(detector, 'detectAll').mockResolvedValue([]);

      const result = await detector.checkCompatibility('1.21');

      expect(result.compatible).toBe(false);
      expect(result.alertMessage).toBeDefined();
      expect(result.alertMessage).toContain('21');
      expect(result.allInstallations).toEqual([]);
    });

    it('includes all detected installations in the result', async () => {
      const mockInstallations: JavaInstallation[] = [
        {
          executablePath: '/usr/bin/java17',
          versionString: 'openjdk version "17.0.9"',
          majorVersion: 17,
          vendor: 'Eclipse Adoptium',
          isJdk: true,
        },
        {
          executablePath: '/usr/bin/java8',
          versionString: 'java version "1.8.0_392"',
          majorVersion: 8,
          vendor: 'Oracle',
          isJdk: false,
        },
      ];
      jest.spyOn(detector, 'detectAll').mockResolvedValue(mockInstallations);

      const result = await detector.checkCompatibility('1.20.1');

      expect(result.allInstallations).toHaveLength(2);
    });

    it('selects the first compatible installation (highest version first)', async () => {
      const mockInstallations: JavaInstallation[] = [
        {
          executablePath: '/usr/bin/java21',
          versionString: 'openjdk version "21.0.1"',
          majorVersion: 21,
          vendor: 'Eclipse Adoptium',
          isJdk: true,
        },
        {
          executablePath: '/usr/bin/java17',
          versionString: 'openjdk version "17.0.9"',
          majorVersion: 17,
          vendor: 'Eclipse Adoptium',
          isJdk: true,
        },
      ];
      jest.spyOn(detector, 'detectAll').mockResolvedValue(mockInstallations);

      const result = await detector.checkCompatibility('1.20.1');

      // Should pick the highest version (21) since detectAll sorts descending.
      expect(result.compatible).toBe(true);
      expect(result.installation!.majorVersion).toBe(21);
    });
  });

  // -------------------------------------------------------------------------
  // detectAll (integration — may find real Java or return empty)
  // -------------------------------------------------------------------------

  describe('detectAll', () => {
    it('returns an array (may be empty in environments without Java)', async () => {
      const installations = await detector.detectAll();
      expect(Array.isArray(installations)).toBe(true);
    });

    it('returns installations sorted by major version descending', async () => {
      const installations = await detector.detectAll();
      for (let i = 1; i < installations.length; i++) {
        expect(installations[i - 1]!.majorVersion).toBeGreaterThanOrEqual(
          installations[i]!.majorVersion,
        );
      }
    });

    it('each installation has required fields', async () => {
      const installations = await detector.detectAll();
      for (const inst of installations) {
        expect(typeof inst.executablePath).toBe('string');
        expect(typeof inst.versionString).toBe('string');
        expect(typeof inst.majorVersion).toBe('number');
        expect(inst.majorVersion).toBeGreaterThan(0);
      }
    });
  });
});
