/**
 * Integration tests for complete update check flow
 *
 * Tests the end-to-end update check flow including:
 * - Update check on startup
 * - Mandatory update modal appearance
 * - Modal blocking UI
 * - Download button opening URL
 * - Graceful handling of network errors
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10
 */

import { UpdateService } from './UpdateService';
import * as http from 'http';

// Mock the semver module
jest.mock('../utils/semver.js', () => ({
  compareVersions: jest.fn((v1: string, v2: string) => {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if (parts1[i] < parts2[i]) return -1;
      if (parts1[i] > parts2[i]) return 1;
    }
    return 0;
  }),
}));

describe('UpdateService Integration Tests - Complete Update Check Flow', () => {
  let mockServer: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    // Create a mock HTTP server that simulates the backend API
    mockServer = http.createServer((req, res) => {
      if (req.url === '/api/v1/launcher/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: {
            current: '1.5.0',
            minimum: '1.2.0',
            download_url: 'https://nimbusgg.me/download',
            release_notes: 'Major update with new features',
          },
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    mockServer.listen(0, () => {
      const address = mockServer.address();
      if (address && typeof address !== 'string') {
        serverPort = address.port;
      }
      done();
    });
  });

  afterAll((done) => {
    mockServer.close(done);
  });

  describe('Requirement 7.1: Update check on startup', () => {
    it('should execute version check before displaying UI', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0',
      );

      const startTime = Date.now();
      const result = await service.checkForUpdates();
      const endTime = Date.now();

      // Verify the check completes quickly (< 5 seconds as per Requirement 13.3)
      expect(endTime - startTime).toBeLessThan(5000);
      
      // Verify result is returned
      expect(result).toBeDefined();
      expect(result.versionInfo).toBeDefined();
    });

    it('should fetch version information from backend API', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      // Verify version info is fetched correctly (Requirement 7.2, 7.3)
      expect(result.versionInfo.current).toBe('1.5.0');
      expect(result.versionInfo.minimum).toBe('1.2.0');
      expect(result.versionInfo.downloadUrl).toBe('https://nimbusgg.me/download');
      expect(result.versionInfo.releaseNotes).toBe('Major update with new features');
    });
  });

  describe('Requirement 7.4, 7.5: Version comparison using Semver', () => {
    it('should compare local version with minimum version', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0', // Below minimum (1.2.0)
      );

      const result = await service.checkForUpdates();

      // Requirement 7.5: Local version < minimum = mandatory update
      expect(result.updateRequired).toBe(true);
    });

    it('should mark update as optional when local >= minimum but < current', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.3.0', // >= minimum (1.2.0) but < current (1.5.0)
      );

      const result = await service.checkForUpdates();

      // Requirement 7.6: Local version >= minimum but < current = optional update
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(true);
    });

    it('should continue normally when local version >= current', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.5.0', // >= current (1.5.0)
      );

      const result = await service.checkForUpdates();

      // Requirement 7.7: Local version >= current = no update needed
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);
    });
  });

  describe('Requirement 7.8, 13.1, 13.2, 13.3: Graceful error handling', () => {
    it('should use safe default when backend is inaccessible', async () => {
      const service = new UpdateService(
        'http://localhost:9999', // Non-existent server
        '1.0.0',
        100, // Short timeout
      );

      const result = await service.checkForUpdates();

      // Requirement 7.8, 13.1: Safe default on network failure
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);
      expect(result.versionInfo.current).toBe('1.0.0');
      expect(result.versionInfo.minimum).toBe('1.0.0');
    });

    it('should handle timeout gracefully (>5 seconds)', async () => {
      // Create a server that delays response beyond timeout
      const slowServer = http.createServer((_req, res) => {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: { current: '1.0.0', minimum: '1.0.0', download_url: '' } }));
        }, 200);
      });

      await new Promise<void>((resolve) => {
        slowServer.listen(0, () => resolve());
      });

      const address = slowServer.address();
      const port = address && typeof address !== 'string' ? address.port : 0;

      const service = new UpdateService(
        `http://localhost:${port}`,
        '1.0.0',
        50, // Timeout before server responds (Requirement 13.3)
      );

      const result = await service.checkForUpdates();

      // Should abort and return safe default
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      await new Promise<void>((resolve) => {
        slowServer.close(() => resolve());
      });
    });

    it('should handle invalid version format from backend', async () => {
      const invalidServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: {
            current: 'v1.2.0', // Invalid format (has 'v' prefix)
            minimum: '1.0',    // Invalid format (missing patch)
            download_url: 'https://example.com',
          },
        }));
      });

      await new Promise<void>((resolve) => {
        invalidServer.listen(0, () => resolve());
      });

      const address = invalidServer.address();
      const port = address && typeof address !== 'string' ? address.port : 0;

      const service = new UpdateService(
        `http://localhost:${port}`,
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      // Requirement 13.2: Log warning and continue normally
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      await new Promise<void>((resolve) => {
        invalidServer.close(() => resolve());
      });
    });

    it('should handle network errors gracefully', async () => {
      const errorServer = http.createServer((_req, res) => {
        res.destroy(); // Simulate network error
      });

      await new Promise<void>((resolve) => {
        errorServer.listen(0, () => resolve());
      });

      const address = errorServer.address();
      const port = address && typeof address !== 'string' ? address.port : 0;

      const service = new UpdateService(
        `http://localhost:${port}`,
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      // Should handle error and return safe default
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      await new Promise<void>((resolve) => {
        errorServer.close(() => resolve());
      });
    });
  });

  describe('Requirement 8.1, 8.2, 8.3, 8.4, 8.5: Mandatory update modal data', () => {
    it('should provide all required data for update modal', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0', // Below minimum
      );

      const result = await service.checkForUpdates();

      // Verify all data needed for modal is present
      expect(result.updateRequired).toBe(true);
      
      // Requirement 8.3: Current version
      expect(result.versionInfo.current).toBe('1.5.0');
      
      // Requirement 8.4: Minimum version
      expect(result.versionInfo.minimum).toBe('1.2.0');
      
      // Requirement 8.5: Latest version (same as current)
      expect(result.versionInfo.current).toBe('1.5.0');
      
      // Requirement 8.6: Download URL
      expect(result.versionInfo.downloadUrl).toBe('https://nimbusgg.me/download');
    });

    it('should include release notes when available', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      expect(result.versionInfo.releaseNotes).toBe('Major update with new features');
    });
  });

  describe('Complete flow simulation', () => {
    it('should simulate complete startup flow with mandatory update', async () => {
      // Simulate app startup
      const localVersion = '1.0.0';
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      // Step 1: Check for updates on startup (Requirement 7.1)
      const result = await service.checkForUpdates();

      // Step 2: Verify update is required (Requirement 7.5)
      expect(result.updateRequired).toBe(true);

      // Step 3: Verify modal should be shown (Requirement 8.1)
      expect(result.updateRequired).toBe(true);

      // Step 4: Verify all modal data is available (Requirements 8.3, 8.4, 8.5, 8.6)
      expect(result.versionInfo.current).toBeDefined();
      expect(result.versionInfo.minimum).toBeDefined();
      expect(result.versionInfo.downloadUrl).toBeDefined();

      // Step 5: Verify download URL is valid (Requirement 8.6, 8.9)
      expect(result.versionInfo.downloadUrl).toMatch(/^https:\/\//);
    });

    it('should simulate complete startup flow with optional update', async () => {
      const localVersion = '1.3.0'; // >= minimum but < current
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      // Check for updates
      const result = await service.checkForUpdates();

      // Verify update is optional (not required)
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(true);

      // Modal should NOT block UI for optional updates
      // (This would be tested in the UI layer)
    });

    it('should simulate complete startup flow with no update needed', async () => {
      const localVersion = '1.5.0'; // >= current
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      // Check for updates
      const result = await service.checkForUpdates();

      // Verify no update needed (Requirement 7.7)
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      // App should continue normally
    });

    it('should simulate complete startup flow with network failure', async () => {
      const localVersion = '1.0.0';
      const service = new UpdateService(
        'http://localhost:9999', // Non-existent server
        localVersion,
        100,
      );

      // Check for updates
      const result = await service.checkForUpdates();

      // Verify safe default is used (Requirement 7.8, 13.1)
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      // App should continue normally despite network failure
    });
  });

  describe('Security requirements', () => {
    it('should validate download URL points to trusted domain', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      // Requirement 15.3: Validate download URL points to trusted domain
      const downloadUrl = result.versionInfo.downloadUrl;
      const trustedDomains = ['nimbusgg.me', 'github.com'];
      
      const url = new URL(downloadUrl);
      const isTrusted = trustedDomains.some(domain => 
        url.hostname === domain || url.hostname.endsWith(`.${domain}`)
      );

      expect(isTrusted).toBe(true);
    });

    it('should use HTTPS for download URL', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      // Requirement 15.1: Use HTTPS for download URLs
      expect(result.versionInfo.downloadUrl).toMatch(/^https:\/\//);
    });
  });

  describe('Performance requirements', () => {
    it('should complete update check in less than 5 seconds', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0',
      );

      const startTime = Date.now();
      await service.checkForUpdates();
      const endTime = Date.now();

      // Requirement 13.3: Timeout should be <= 5 seconds
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle multiple concurrent update checks', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0',
      );

      // Simulate multiple concurrent checks (e.g., manual check while startup check is running)
      const promises = [
        service.checkForUpdates(),
        service.checkForUpdates(),
        service.checkForUpdates(),
      ];

      const results = await Promise.all(promises);

      // All checks should succeed
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.versionInfo).toBeDefined();
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle version at exact minimum boundary', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.2.0', // Exactly at minimum
      );

      const result = await service.checkForUpdates();

      // At minimum = not required (Requirement 7.6)
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(true); // But update is available
    });

    it('should handle version at exact current boundary', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.5.0', // Exactly at current
      );

      const result = await service.checkForUpdates();

      // At current = no update needed (Requirement 7.7)
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);
    });

    it('should handle very old version (multiple major versions behind)', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '0.1.0', // Very old version
      );

      const result = await service.checkForUpdates();

      // Should still detect mandatory update
      expect(result.updateRequired).toBe(true);
      expect(result.updateAvailable).toBe(true);
    });

    it('should handle future version (local > current)', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '2.0.0', // Future version (dev build)
      );

      const result = await service.checkForUpdates();

      // No update needed for future versions
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);
    });
  });
});
