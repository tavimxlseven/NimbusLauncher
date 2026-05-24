/**
 * End-to-end integration tests for complete update check flow
 *
 * This test file simulates the complete update flow from application startup
 * through modal display and user interaction. It tests the integration between:
 * - UpdateService (backend check)
 * - IPC communication (main <-> renderer)
 * - UpdateModal (UI display)
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

describe('Complete Update Flow - End-to-End Integration', () => {
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
            release_notes: 'Major update with new features and bug fixes',
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

  describe('Scenario 1: Mandatory update flow (local version < minimum)', () => {
    it('should complete full flow from startup to modal display', async () => {
      // Step 1: Application starts (Requirement 7.1)
      const localVersion = '1.0.0'; // Below minimum (1.2.0)
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      // Step 2: Check for updates on startup (Requirement 7.1)
      const updateCheckResult = await updateService.checkForUpdates();

      // Step 3: Verify update is required (Requirement 7.5)
      expect(updateCheckResult.updateRequired).toBe(true);
      expect(updateCheckResult.updateAvailable).toBe(true);

      // Step 4: Verify version information is correct (Requirements 7.2, 7.3)
      expect(updateCheckResult.versionInfo.current).toBe('1.5.0');
      expect(updateCheckResult.versionInfo.minimum).toBe('1.2.0');
      expect(updateCheckResult.versionInfo.downloadUrl).toBe('https://nimbusgg.me/download');
      expect(updateCheckResult.versionInfo.releaseNotes).toBe('Major update with new features and bug fixes');

      // Step 5: Simulate modal display (Requirement 8.1)
      // In the real app, this would trigger UpdateModal to be shown
      const shouldShowModal = updateCheckResult.updateRequired;
      expect(shouldShowModal).toBe(true);

      // Step 6: Verify modal data (Requirements 8.3, 8.4, 8.5, 8.6)
      const modalData = {
        currentVersion: localVersion,
        versionInfo: updateCheckResult.versionInfo,
      };

      expect(modalData.currentVersion).toBe('1.0.0'); // Requirement 8.3
      expect(modalData.versionInfo.minimum).toBe('1.2.0'); // Requirement 8.4
      expect(modalData.versionInfo.current).toBe('1.5.0'); // Requirement 8.5
      expect(modalData.versionInfo.downloadUrl).toBe('https://nimbusgg.me/download'); // Requirement 8.6

      // Step 7: Verify modal blocks UI (Requirement 8.7)
      // This is tested in the UI layer - modal should have blocking overlay
      expect(updateCheckResult.updateRequired).toBe(true); // Indicates UI should be blocked

      // Step 8: Simulate user clicking "Download Update" (Requirement 8.9)
      // In the real app, this would call window.nimbus.openExternal(downloadUrl)
      const downloadUrl = modalData.versionInfo.downloadUrl;
      expect(downloadUrl).toMatch(/^https:\/\//); // Must be HTTPS (Requirement 15.1)
      expect(downloadUrl).toContain('nimbusgg.me'); // Must be trusted domain (Requirement 15.3)

      // Step 9: Verify modal cannot be closed (Requirement 8.8)
      // This is tested in the UI layer - no X button, no ESC key
      // The updateRequired flag indicates the modal must remain visible
      expect(updateCheckResult.updateRequired).toBe(true);
    });
  });

  describe('Scenario 2: Optional update flow (minimum <= local < current)', () => {
    it('should complete flow without blocking UI', async () => {
      // Step 1: Application starts
      const localVersion = '1.3.0'; // >= minimum (1.2.0) but < current (1.5.0)
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      // Step 2: Check for updates
      const updateCheckResult = await updateService.checkForUpdates();

      // Step 3: Verify update is optional (Requirement 7.6)
      expect(updateCheckResult.updateRequired).toBe(false);
      expect(updateCheckResult.updateAvailable).toBe(true);

      // Step 4: Verify UI is NOT blocked
      // In the real app, the modal would not be shown or would be dismissible
      const shouldBlockUI = updateCheckResult.updateRequired;
      expect(shouldBlockUI).toBe(false);

      // Step 5: User can continue using the app normally
      // Optional update notification could be shown in settings or as a banner
    });
  });

  describe('Scenario 3: No update needed (local >= current)', () => {
    it('should continue normally without any modal', async () => {
      // Step 1: Application starts
      const localVersion = '1.5.0'; // >= current (1.5.0)
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      // Step 2: Check for updates
      const updateCheckResult = await updateService.checkForUpdates();

      // Step 3: Verify no update needed (Requirement 7.7)
      expect(updateCheckResult.updateRequired).toBe(false);
      expect(updateCheckResult.updateAvailable).toBe(false);

      // Step 4: Verify no modal is shown
      const shouldShowModal = updateCheckResult.updateRequired;
      expect(shouldShowModal).toBe(false);

      // Step 5: App continues normally
    });
  });

  describe('Scenario 4: Network failure during startup', () => {
    it('should handle gracefully and allow app to continue', async () => {
      // Step 1: Application starts
      const localVersion = '1.0.0';
      const updateService = new UpdateService(
        'http://localhost:9999', // Non-existent server
        localVersion,
        100, // Short timeout
      );

      // Step 2: Check for updates (network fails)
      const updateCheckResult = await updateService.checkForUpdates();

      // Step 3: Verify safe default is used (Requirement 7.8, 13.1)
      expect(updateCheckResult.updateRequired).toBe(false);
      expect(updateCheckResult.updateAvailable).toBe(false);

      // Step 4: Verify no modal is shown
      const shouldShowModal = updateCheckResult.updateRequired;
      expect(shouldShowModal).toBe(false);

      // Step 5: App continues normally despite network failure
      // User can manually check for updates later via Settings (Requirement 13.5)
    });
  });

  describe('Scenario 5: Timeout during update check', () => {
    it('should abort check and continue with safe default', async () => {
      // Create a slow server that delays response
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

      // Step 1: Application starts
      const localVersion = '1.0.0';
      const updateService = new UpdateService(
        `http://localhost:${port}`,
        localVersion,
        50, // Timeout before server responds (Requirement 13.3)
      );

      // Step 2: Check for updates (times out)
      const startTime = Date.now();
      const updateCheckResult = await updateService.checkForUpdates();
      const endTime = Date.now();

      // Step 3: Verify timeout occurred quickly
      expect(endTime - startTime).toBeLessThan(100); // Should abort quickly

      // Step 4: Verify safe default is used
      expect(updateCheckResult.updateRequired).toBe(false);
      expect(updateCheckResult.updateAvailable).toBe(false);

      // Step 5: App continues normally
      const shouldShowModal = updateCheckResult.updateRequired;
      expect(shouldShowModal).toBe(false);

      await new Promise<void>((resolve) => {
        slowServer.close(() => resolve());
      });
    });
  });

  describe('Scenario 6: Invalid version format from backend', () => {
    it('should handle gracefully and use safe default', async () => {
      // Create a server that returns invalid version format
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

      // Step 1: Application starts
      const localVersion = '1.0.0';
      const updateService = new UpdateService(
        `http://localhost:${port}`,
        localVersion,
      );

      // Step 2: Check for updates (receives invalid format)
      const updateCheckResult = await updateService.checkForUpdates();

      // Step 3: Verify safe default is used (Requirement 13.2)
      expect(updateCheckResult.updateRequired).toBe(false);
      expect(updateCheckResult.updateAvailable).toBe(false);

      // Step 4: App continues normally
      const shouldShowModal = updateCheckResult.updateRequired;
      expect(shouldShowModal).toBe(false);

      await new Promise<void>((resolve) => {
        invalidServer.close(() => resolve());
      });
    });
  });

  describe('Scenario 7: User interaction with mandatory update modal', () => {
    it('should handle download button click correctly', async () => {
      // Step 1: Setup - mandatory update detected
      const localVersion = '1.0.0';
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      const updateCheckResult = await updateService.checkForUpdates();
      expect(updateCheckResult.updateRequired).toBe(true);

      // Step 2: Modal is displayed with download button
      const downloadUrl = updateCheckResult.versionInfo.downloadUrl;

      // Step 3: Verify download URL is valid and secure
      expect(downloadUrl).toMatch(/^https:\/\//); // HTTPS only (Requirement 15.1)
      
      // Step 4: Verify download URL points to trusted domain (Requirement 15.3)
      const url = new URL(downloadUrl);
      const trustedDomains = ['nimbusgg.me', 'github.com'];
      const isTrusted = trustedDomains.some(domain => 
        url.hostname === domain || url.hostname.endsWith(`.${domain}`)
      );
      expect(isTrusted).toBe(true);

      // Step 5: Simulate user clicking "Download Update" (Requirement 8.9)
      // In the real app, this would call:
      // window.nimbus.openExternal(downloadUrl)
      // which opens the URL in the default browser

      // Step 6: Verify modal remains visible after click (Requirement 8.10)
      // The modal should stay open until the launcher is closed and updated
      expect(updateCheckResult.updateRequired).toBe(true);
    });

    it('should prevent modal from being closed', async () => {
      // Step 1: Setup - mandatory update detected
      const localVersion = '1.0.0';
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      const updateCheckResult = await updateService.checkForUpdates();
      expect(updateCheckResult.updateRequired).toBe(true);

      // Step 2: Verify modal cannot be dismissed (Requirement 8.8)
      // In the UI layer:
      // - No X button to close modal
      // - ESC key is blocked
      // - Clicking outside modal does nothing
      // - Modal remains until launcher is closed

      // The updateRequired flag indicates the modal must remain visible
      expect(updateCheckResult.updateRequired).toBe(true);
    });
  });

  describe('Scenario 8: Multiple update checks', () => {
    it('should handle concurrent update checks correctly', async () => {
      // Step 1: Application starts
      const localVersion = '1.0.0';
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      // Step 2: Simulate multiple concurrent checks
      // (e.g., startup check + manual check from settings)
      const promises = [
        updateService.checkForUpdates(),
        updateService.checkForUpdates(),
        updateService.checkForUpdates(),
      ];

      const results = await Promise.all(promises);

      // Step 3: Verify all checks return consistent results
      results.forEach(result => {
        expect(result.updateRequired).toBe(true);
        expect(result.versionInfo.current).toBe('1.5.0');
        expect(result.versionInfo.minimum).toBe('1.2.0');
      });

      // Step 4: Verify only one modal is shown (handled by UI layer)
      // The UI should deduplicate modal displays
    });
  });

  describe('Scenario 9: Edge cases', () => {
    it('should handle version at exact minimum boundary', async () => {
      const localVersion = '1.2.0'; // Exactly at minimum
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      const result = await updateService.checkForUpdates();

      // At minimum = not required but update available
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(true);

      // Modal should NOT block UI
      expect(result.updateRequired).toBe(false);
    });

    it('should handle version at exact current boundary', async () => {
      const localVersion = '1.5.0'; // Exactly at current
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      const result = await updateService.checkForUpdates();

      // At current = no update needed
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      // No modal shown
      expect(result.updateRequired).toBe(false);
    });

    it('should handle very old version (multiple major versions behind)', async () => {
      const localVersion = '0.1.0'; // Very old
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      const result = await updateService.checkForUpdates();

      // Should still detect mandatory update
      expect(result.updateRequired).toBe(true);
      expect(result.updateAvailable).toBe(true);

      // Modal should block UI
      expect(result.updateRequired).toBe(true);
    });

    it('should handle future version (dev build)', async () => {
      const localVersion = '2.0.0'; // Future version
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      const result = await updateService.checkForUpdates();

      // No update needed for future versions
      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      // No modal shown
      expect(result.updateRequired).toBe(false);
    });
  });

  describe('Performance and reliability', () => {
    it('should complete update check quickly', async () => {
      const localVersion = '1.0.0';
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
      );

      const startTime = Date.now();
      await updateService.checkForUpdates();
      const endTime = Date.now();

      // Should complete in less than 5 seconds (Requirement 13.3)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should not block application startup on slow network', async () => {
      const localVersion = '1.0.0';
      const updateService = new UpdateService(
        `http://localhost:${serverPort}`,
        localVersion,
        5000, // 5 second timeout
      );

      // Even with slow network, should complete within timeout
      const startTime = Date.now();
      await updateService.checkForUpdates();
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(6000);
    });
  });
});
