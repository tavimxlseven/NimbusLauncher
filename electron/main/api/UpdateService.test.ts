/**
 * Unit tests for UpdateService
 *
 * Tests version checking, comparison logic, and error handling.
 */

import { UpdateService } from './UpdateService';
import * as http from 'http';

// Mock the semver module
jest.mock('../utils/semver.js', () => ({
  compareVersions: jest.fn((v1: string, v2: string) => {
    // Simple implementation for testing
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if (parts1[i] < parts2[i]) return -1;
      if (parts1[i] > parts2[i]) return 1;
    }
    return 0;
  }),
}));

describe('UpdateService', () => {
  let mockServer: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    // Create a mock HTTP server for testing
    mockServer = http.createServer((req, res) => {
      if (req.url === '/api/v1/launcher/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: {
            current: '1.2.0',
            minimum: '1.0.0',
            download_url: 'https://example.com/download',
            release_notes: 'Bug fixes and improvements',
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

  describe('checkForUpdates', () => {
    it('should detect mandatory update when local version < minimum', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '0.9.0',
      );

      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(true);
      expect(result.updateAvailable).toBe(true);
      expect(result.versionInfo.current).toBe('1.2.0');
      expect(result.versionInfo.minimum).toBe('1.0.0');
      expect(result.versionInfo.downloadUrl).toBe('https://example.com/download');
    });

    it('should detect optional update when minimum <= local version < current', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.1.0',
      );

      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(true);
      expect(result.versionInfo.current).toBe('1.2.0');
    });

    it('should detect no update when local version >= current', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.2.0',
      );

      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);
    });

    it('should detect no update when local version > current', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.3.0',
      );

      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);
    });

    it('should return safe default when backend is unreachable', async () => {
      const service = new UpdateService(
        'http://localhost:9999', // Non-existent server
        '1.0.0',
        100, // Short timeout
      );

      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);
      expect(result.versionInfo.current).toBe('1.0.0');
      expect(result.versionInfo.minimum).toBe('1.0.0');
    });

    it('should handle timeout gracefully', async () => {
      // Create a server that delays response
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
        50, // Timeout before server responds
      );

      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      await new Promise<void>((resolve) => {
        slowServer.close(() => resolve());
      });
    });

    it('should handle invalid JSON response', async () => {
      const invalidServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('invalid json');
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

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      await new Promise<void>((resolve) => {
        invalidServer.close(() => resolve());
      });
    });

    it('should handle missing required fields in response', async () => {
      const incompleteServer = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: {
            current: '1.0.0',
            // Missing minimum and download_url
          },
        }));
      });

      await new Promise<void>((resolve) => {
        incompleteServer.listen(0, () => resolve());
      });

      const address = incompleteServer.address();
      const port = address && typeof address !== 'string' ? address.port : 0;

      const service = new UpdateService(
        `http://localhost:${port}`,
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      await new Promise<void>((resolve) => {
        incompleteServer.close(() => resolve());
      });
    });

    it('should handle invalid semver format from backend', async () => {
      const invalidVersionServer = http.createServer((_req, res) => {
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
        invalidVersionServer.listen(0, () => resolve());
      });

      const address = invalidVersionServer.address();
      const port = address && typeof address !== 'string' ? address.port : 0;

      const service = new UpdateService(
        `http://localhost:${port}`,
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      await new Promise<void>((resolve) => {
        invalidVersionServer.close(() => resolve());
      });
    });

    it('should handle non-200 status codes', async () => {
      const errorServer = http.createServer((_req, res) => {
        res.writeHead(503);
        res.end('Service Unavailable');
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

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);

      await new Promise<void>((resolve) => {
        errorServer.close(() => resolve());
      });
    });

    it('should include release notes when provided', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      expect(result.versionInfo.releaseNotes).toBe('Bug fixes and improvements');
    });

    it('should normalize base URL by removing trailing slash', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}/`, // Trailing slash
        '1.0.0',
      );

      const result = await service.checkForUpdates();

      expect(result.versionInfo.current).toBe('1.2.0');
    });
  });

  describe('edge cases', () => {
    it('should handle version comparison at boundaries', async () => {
      const service = new UpdateService(
        `http://localhost:${serverPort}`,
        '1.0.0', // Exactly at minimum
      );

      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(false); // Not required (>= minimum)
      expect(result.updateAvailable).toBe(true); // Available (< current)
    });

    it('should work with HTTPS URLs', async () => {
      const service = new UpdateService(
        'https://nimbusgg.me',
        '1.0.0',
        100, // Short timeout to fail quickly
      );

      // This will fail due to network, but should return safe default
      const result = await service.checkForUpdates();

      expect(result.updateRequired).toBe(false);
      expect(result.updateAvailable).toBe(false);
    });
  });
});
