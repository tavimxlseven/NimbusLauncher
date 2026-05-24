/**
 * Unit tests for DownloadManager
 *
 * Tests cover:
 * - enqueue: items are added to the queue
 * - start: processes all items and returns results
 * - start: never exceeds 5 simultaneous downloads (Requirement 9.1)
 * - onProgress: callback receives totalPercent and currentFile (Requirement 9.2)
 * - onProgress: totalPercent reaches 100 when all files complete
 * - verifyAndRetry: succeeds when hash matches (Requirement 9.3)
 * - verifyAndRetry: retries up to 3 times on hash mismatch (Requirement 9.4)
 * - verifyAndRetry: reports failure with filename after 3 retries
 * - verifyAndRetry: succeeds without hash verification when expectedHash is absent
 * - start: returns success=false with filename when download fails after retries
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { DownloadManager, DownloadItem, DownloadProgress } from './DownloadManager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Computes SHA-256 of a buffer/string. */
function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Creates a temporary directory and returns its path. */
async function makeTempDir(): Promise<string> {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'dm-test-'));
}

/** Starts a minimal HTTP server that serves fixed content for any path. */
function startServer(
  content: string | Buffer,
  statusCode = 200,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/octet-stream' });
      res.end(content);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}/file`,
        close: () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

/** Starts an HTTP server that serves different content on each request. */
function startAlternatingServer(
  responses: Array<string | Buffer>,
): Promise<{ url: string; close: () => Promise<void> }> {
  let callCount = 0;
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      const idx = Math.min(callCount++, responses.length - 1);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(responses[idx]);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}/file`,
        close: () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DownloadManager', () => {
  // -------------------------------------------------------------------------
  // enqueue + start — basic functionality
  // -------------------------------------------------------------------------

  describe('enqueue and start', () => {
    it('downloads a single file successfully', async () => {
      const content = 'hello download';
      const { url, close } = await startServer(content);
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        dm.enqueue([{ url, filename: 'file.txt', destinationDir: destDir }]);
        const results = await dm.start();

        expect(results).toHaveLength(1);
        expect(results[0]!.success).toBe(true);
        expect(results[0]!.filename).toBe('file.txt');

        const saved = await fs.promises.readFile(path.join(destDir, 'file.txt'), 'utf8');
        expect(saved).toBe(content);
      } finally {
        await close();
      }
    });

    it('downloads multiple files and returns a result for each', async () => {
      const content = 'multi-file content';
      const { url, close } = await startServer(content);
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        const items: DownloadItem[] = Array.from({ length: 8 }, (_, i) => ({
          url,
          filename: `file-${i}.txt`,
          destinationDir: destDir,
        }));
        dm.enqueue(items);
        const results = await dm.start();

        expect(results).toHaveLength(8);
        expect(results.every((r) => r.success)).toBe(true);
      } finally {
        await close();
      }
    });

    it('returns an empty array when no items are enqueued', async () => {
      const dm = new DownloadManager();
      const results = await dm.start();
      expect(results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 9.1 — max 5 simultaneous downloads
  // -------------------------------------------------------------------------

  describe('parallelism limit (Requirement 9.1)', () => {
    it('never exceeds 5 simultaneous downloads', async () => {
      let activeCount = 0;
      let maxObservedActive = 0;

      // Server that tracks concurrent connections.
      const server = http.createServer((_req, res) => {
        activeCount++;
        maxObservedActive = Math.max(maxObservedActive, activeCount);
        // Delay response slightly so downloads overlap.
        setTimeout(() => {
          activeCount--;
          res.writeHead(200);
          res.end('data');
        }, 20);
      });

      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}/file`;
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        // Enqueue 12 items — well above the limit of 5.
        const items: DownloadItem[] = Array.from({ length: 12 }, (_, i) => ({
          url,
          filename: `file-${i}.bin`,
          destinationDir: destDir,
        }));
        dm.enqueue(items);
        await dm.start();

        expect(maxObservedActive).toBeLessThanOrEqual(5);
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 9.2 — progress reporting
  // -------------------------------------------------------------------------

  describe('onProgress (Requirement 9.2)', () => {
    it('calls the progress callback with currentFile and totalPercent', async () => {
      const content = 'progress test';
      const { url, close } = await startServer(content);
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        const progressEvents: DownloadProgress[] = [];
        dm.onProgress((p) => progressEvents.push({ ...p }));

        dm.enqueue([{ url, filename: 'prog.txt', destinationDir: destDir }]);
        await dm.start();

        expect(progressEvents.length).toBeGreaterThan(0);
        // At least one event should reference the file.
        const hasFile = progressEvents.some((p) => p.currentFile === 'prog.txt');
        expect(hasFile).toBe(true);
        // totalPercent must be in [0, 100].
        for (const p of progressEvents) {
          expect(p.totalPercent).toBeGreaterThanOrEqual(0);
          expect(p.totalPercent).toBeLessThanOrEqual(100);
        }
      } finally {
        await close();
      }
    });

    it('totalPercent reaches 100 after all files complete', async () => {
      const content = 'done';
      const { url, close } = await startServer(content);
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        const progressEvents: DownloadProgress[] = [];
        dm.onProgress((p) => progressEvents.push({ ...p }));

        dm.enqueue([
          { url, filename: 'a.txt', destinationDir: destDir },
          { url, filename: 'b.txt', destinationDir: destDir },
        ]);
        await dm.start();

        const lastEvent = progressEvents[progressEvents.length - 1]!;
        expect(lastEvent.totalPercent).toBe(100);
        expect(lastEvent.completedCount).toBe(2);
        expect(lastEvent.totalCount).toBe(2);
      } finally {
        await close();
      }
    });

    it('supports multiple progress callbacks', async () => {
      const { url, close } = await startServer('x');
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        let cb1Count = 0;
        let cb2Count = 0;
        dm.onProgress(() => cb1Count++);
        dm.onProgress(() => cb2Count++);

        dm.enqueue([{ url, filename: 'multi-cb.txt', destinationDir: destDir }]);
        await dm.start();

        expect(cb1Count).toBeGreaterThan(0);
        expect(cb2Count).toBe(cb1Count);
      } finally {
        await close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 9.3 — SHA-256 verification
  // -------------------------------------------------------------------------

  describe('verifyAndRetry — hash verification (Requirement 9.3)', () => {
    it('succeeds when the downloaded file matches the expected hash', async () => {
      const content = 'correct content';
      const { url, close } = await startServer(content);
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        const result = await dm.verifyAndRetry({
          url,
          filename: 'correct.bin',
          destinationDir: destDir,
          expectedHash: sha256(content),
        });

        expect(result.success).toBe(true);
        expect(result.filename).toBe('correct.bin');
      } finally {
        await close();
      }
    });

    it('succeeds without hash verification when expectedHash is absent', async () => {
      const { url, close } = await startServer('no hash needed');
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        const result = await dm.verifyAndRetry({
          url,
          filename: 'no-hash.bin',
          destinationDir: destDir,
          // No expectedHash provided.
        });

        expect(result.success).toBe(true);
      } finally {
        await close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 9.4 — retry up to 3 times on hash mismatch
  // -------------------------------------------------------------------------

  describe('verifyAndRetry — retry on hash mismatch (Requirement 9.4)', () => {
    it('retries and succeeds when the correct file arrives on the 2nd attempt', async () => {
      const wrongContent = 'wrong data';
      const correctContent = 'correct data';
      const expectedHash = sha256(correctContent);

      // First response: wrong content; second response: correct content.
      const { url, close } = await startAlternatingServer([wrongContent, correctContent]);
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        const result = await dm.verifyAndRetry({
          url,
          filename: 'retry-ok.bin',
          destinationDir: destDir,
          expectedHash,
        });

        expect(result.success).toBe(true);
        expect(result.filename).toBe('retry-ok.bin');
      } finally {
        await close();
      }
    });

    it('reports failure with filename after 3 retries with persistent hash mismatch', async () => {
      const wrongContent = 'always wrong';
      const expectedHash = sha256('correct content that never arrives');

      const { url, close } = await startServer(wrongContent);
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        const result = await dm.verifyAndRetry({
          url,
          filename: 'always-fail.bin',
          destinationDir: destDir,
          expectedHash,
        });

        expect(result.success).toBe(false);
        expect(result.filename).toBe('always-fail.bin');
        expect(result.error).toBeDefined();
        expect(result.error).toContain('3');
      } finally {
        await close();
      }
    });

    it('reports failure with filename when download itself fails after 3 retries', async () => {
      const destDir = await makeTempDir();
      const dm = new DownloadManager();

      // Use a port that is not listening.
      const result = await dm.verifyAndRetry({
        url: 'http://127.0.0.1:1', // port 1 is reserved and should refuse connections
        filename: 'unreachable.bin',
        destinationDir: destDir,
      });

      expect(result.success).toBe(false);
      expect(result.filename).toBe('unreachable.bin');
      expect(result.error).toBeDefined();
    });

    it('includes the filename in the failure result', async () => {
      const { url, close } = await startServer('bad');
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        const result = await dm.verifyAndRetry({
          url,
          filename: 'named-file.jar',
          destinationDir: destDir,
          expectedHash: 'a'.repeat(64), // wrong hash
        });

        expect(result.filename).toBe('named-file.jar');
      } finally {
        await close();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Integration: start() with hash verification
  // -------------------------------------------------------------------------

  describe('start() with hash verification', () => {
    it('marks a file as failed in results when hash never matches', async () => {
      const { url, close } = await startServer('bad content');
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        dm.enqueue([
          {
            url,
            filename: 'bad.jar',
            destinationDir: destDir,
            expectedHash: 'b'.repeat(64), // wrong hash
          },
        ]);
        const results = await dm.start();

        expect(results).toHaveLength(1);
        expect(results[0]!.success).toBe(false);
        expect(results[0]!.filename).toBe('bad.jar');
      } finally {
        await close();
      }
    });

    it('processes a mix of successful and failed downloads', async () => {
      const goodContent = 'good';
      const { url: goodUrl, close: closeGood } = await startServer(goodContent);
      const { url: badUrl, close: closeBad } = await startServer('bad');
      const destDir = await makeTempDir();

      try {
        const dm = new DownloadManager();
        dm.enqueue([
          {
            url: goodUrl,
            filename: 'good.jar',
            destinationDir: destDir,
            expectedHash: sha256(goodContent),
          },
          {
            url: badUrl,
            filename: 'bad.jar',
            destinationDir: destDir,
            expectedHash: 'c'.repeat(64),
          },
        ]);
        const results = await dm.start();

        expect(results).toHaveLength(2);
        const good = results.find((r) => r.filename === 'good.jar')!;
        const bad = results.find((r) => r.filename === 'bad.jar')!;
        expect(good.success).toBe(true);
        expect(bad.success).toBe(false);
      } finally {
        await closeGood();
        await closeBad();
      }
    });
  });
});
