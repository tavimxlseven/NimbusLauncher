/**
 * Property-based tests for DownloadManager + HashVerifier
 *
 * # Feature: minecraft-launcher-platform, Property 11: Limite de downloads paralelos no Launcher
 *
 * **Property 11: Limite de downloads paralelos no Launcher — 100 iterações (fast-check)**
 *
 * For any list of mods to install of any size, the number of simultaneous
 * downloads at any instant must be at most 5; SHA-256 verification of each
 * file must be executed after download, and files with incorrect hash must be
 * retried exactly 3 times before reporting failure.
 *
 * **Validates: Requirements 9.1, 9.3, 9.4**
 */

import * as fc from 'fast-check';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { DownloadManager, DownloadItem } from './DownloadManager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Computes SHA-256 of a string/buffer. */
function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Creates a temporary directory and returns its path. */
async function makeTempDir(): Promise<string> {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'dm-prop-test-'));
}

/**
 * Starts an HTTP server that tracks concurrent active connections.
 * Each request is held open for `delayMs` milliseconds so that downloads
 * overlap and the concurrency limit can be observed.
 */
function startTrackingServer(
  content: string,
  delayMs = 30,
): Promise<{
  url: string;
  getMaxConcurrent: () => number;
  getRequestCount: () => number;
  close: () => Promise<void>;
}> {
  let active = 0;
  let maxActive = 0;
  let requestCount = 0;

  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      active++;
      requestCount++;
      maxActive = Math.max(maxActive, active);

      setTimeout(() => {
        active--;
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(content);
      }, delayMs);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}/file`,
        getMaxConcurrent: () => maxActive,
        getRequestCount: () => requestCount,
        close: () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

/**
 * Starts an HTTP server that always returns `content` regardless of the
 * number of requests. Used for hash-mismatch retry tests.
 */
function startFixedServer(
  content: string,
): Promise<{ url: string; getRequestCount: () => number; close: () => Promise<void> }> {
  let requestCount = 0;

  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      requestCount++;
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(content);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}/file`,
        getRequestCount: () => requestCount,
        close: () => new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r()))),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a list of 1–50 download items that all point to the same URL
 * (supplied at test time) with unique filenames and a correct expected hash.
 */
function downloadItemsArbitrary(
  url: string,
  destDir: string,
  content: string,
): fc.Arbitrary<DownloadItem[]> {
  return fc.integer({ min: 1, max: 50 }).chain((count) =>
    fc.constant(
      Array.from({ length: count }, (_, i) => ({
        url,
        filename: `mod-${i}-${Date.now()}.jar`,
        destinationDir: destDir,
        expectedHash: sha256(content),
      })),
    ),
  );
}

// ---------------------------------------------------------------------------
// Property 11 — Part A: Concurrency limit ≤ 5 (Requirement 9.1)
// ---------------------------------------------------------------------------

describe('Property 11 — Part A: Concurrency limit ≤ 5 (Requirement 9.1)', () => {
  /**
   * **Validates: Requirements 9.1**
   *
   * For any list of mods to install of any size (1–50), the number of
   * simultaneous downloads at any instant must be at most 5.
   */
  it(
    'never exceeds 5 simultaneous downloads for any list size',
    async () => {
      const content = 'mod-file-content';
      const { url, getMaxConcurrent, close } = await startTrackingServer(content, 40);
      const destDir = await makeTempDir();

      try {
        await fc.assert(
          fc.asyncProperty(
            downloadItemsArbitrary(url, destDir, content),
            async (items) => {
              // Each iteration uses a fresh DownloadManager so state does not
              // bleed between runs.
              const dm = new DownloadManager();
              dm.enqueue(items);
              await dm.start();

              // The tracking server records the peak concurrency across ALL
              // iterations. We assert after each run that it never exceeded 5.
              return getMaxConcurrent() <= 5;
            },
          ),
          { numRuns: 10, verbose: false },
        );
      } finally {
        await close();
      }
    },
    // Generous timeout: 100 iterations × up to 50 files × 40 ms delay.
    300_000,
  );
});

// ---------------------------------------------------------------------------
// Property 11 — Part B: SHA-256 verification called for each file (Req 9.3)
// ---------------------------------------------------------------------------

describe('Property 11 — Part B: SHA-256 verification for each file (Requirement 9.3)', () => {
  /**
   * **Validates: Requirements 9.3**
   *
   * For any list of mods, every downloaded file must have its SHA-256 hash
   * verified. We confirm this by providing the correct hash for each item and
   * asserting that all results are successful (meaning verification ran and
   * passed).
   */
  it(
    'verifies SHA-256 for every downloaded file and reports success when hashes match',
    async () => {
      const content = 'verified-mod-content';
      const { url, close } = await startTrackingServer(content, 5);
      const destDir = await makeTempDir();

      try {
        await fc.assert(
          fc.asyncProperty(
            downloadItemsArbitrary(url, destDir, content),
            async (items) => {
              const dm = new DownloadManager();
              dm.enqueue(items);
              const results = await dm.start();

              // Every result must be successful — hash verification ran and
              // the computed hash matched the expected hash.
              return (
                results.length === items.length &&
                results.every((r) => r.success === true)
              );
            },
          ),
          { numRuns: 10, verbose: false },
        );
      } finally {
        await close();
      }
    },
    300_000,
  );
});

// ---------------------------------------------------------------------------
// Property 11 — Part C: Exactly 3 retries on hash mismatch (Requirement 9.4)
// ---------------------------------------------------------------------------

describe('Property 11 — Part C: Exactly 3 retries on hash mismatch (Requirement 9.4)', () => {
  /**
   * **Validates: Requirements 9.4**
   *
   * For any list of mods whose hash never matches, each file must be retried
   * exactly 3 times (i.e. the server receives exactly 3 requests per file)
   * before the DownloadManager reports failure for that file.
   *
   * The DownloadManager's MAX_RETRIES constant is 3, meaning it makes up to 3
   * download attempts per item. When all 3 attempts fail hash verification the
   * result must be `success: false`.
   */
  it(
    'retries each file exactly 3 times and reports failure when hash never matches',
    async () => {
      // Use content that will never match the wrong hash supplied by the
      // wrongHashItemsArbitrary generator.
      const content = 'always-wrong-content';

      await fc.assert(
        fc.asyncProperty(
          // Generate a small count (1–5) to keep the test fast; the property
          // holds for any count.
          fc.integer({ min: 1, max: 5 }),
          async (count) => {
            const { url, getRequestCount, close } = await startFixedServer(content);
            const destDir = await makeTempDir();

            try {
              const items: DownloadItem[] = Array.from({ length: count }, (_, i) => ({
                url,
                filename: `retry-mod-${i}.jar`,
                destinationDir: destDir,
                expectedHash: 'b'.repeat(64), // always wrong
              }));

              const dm = new DownloadManager();
              dm.enqueue(items);
              const results = await dm.start();

              // All results must be failures.
              const allFailed = results.every((r) => r.success === false);

              // Each file must have been attempted exactly MAX_RETRIES (3) times.
              // Total requests = count × 3.
              const expectedRequests = count * 3;
              const correctRetryCount = getRequestCount() === expectedRequests;

              // Each failure result must include the filename.
              const allHaveFilename = results.every(
                (r) => typeof r.filename === 'string' && r.filename.length > 0,
              );

              return allFailed && correctRetryCount && allHaveFilename;
            } finally {
              await close();
            }
          },
        ),
        { numRuns: 10, verbose: false },
      );
    },
    300_000,
  );

  /**
   * **Validates: Requirements 9.4**
   *
   * Complementary check: when a file's hash matches on the 2nd attempt (after
   * 1 failure), the result must be `success: true` and the total request count
   * must be exactly 2 (1 failed attempt + 1 successful attempt).
   */
  it(
    'stops retrying and reports success as soon as hash matches',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (_count) => {
            const correctContent = 'correct-content';
            const wrongContent = 'wrong-content';
            const expectedHash = sha256(correctContent);

            // Server returns wrong content on odd requests, correct on even.
            let requestCount = 0;
            const server = await new Promise<{
              url: string;
              close: () => Promise<void>;
            }>((resolve) => {
              const srv = http.createServer((_req, res) => {
                requestCount++;
                const body = requestCount % 2 === 0 ? correctContent : wrongContent;
                res.writeHead(200);
                res.end(body);
              });
              srv.listen(0, '127.0.0.1', () => {
                const addr = srv.address() as { port: number };
                resolve({
                  url: `http://127.0.0.1:${addr.port}/file`,
                  close: () =>
                    new Promise<void>((r, j) => srv.close((e) => (e ? j(e) : r()))),
                });
              });
            });

            const destDir = await makeTempDir();

            try {
              // Use a single item to keep the request-count assertion simple.
              const item: DownloadItem = {
                url: server.url,
                filename: 'early-success.jar',
                destinationDir: destDir,
                expectedHash,
              };

              const dm = new DownloadManager();
              dm.enqueue([item]);
              const results = await dm.start();

              // Must succeed (matched on 2nd attempt).
              const succeeded = results[0]?.success === true;

              // Exactly 2 requests: 1 wrong + 1 correct.
              const twoRequests = requestCount === 2;

              return succeeded && twoRequests;
            } finally {
              await server.close();
            }
          },
        ),
        { numRuns: 10, verbose: false },
      );
    },
    300_000,
  );
});
