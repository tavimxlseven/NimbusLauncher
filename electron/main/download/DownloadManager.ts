/**
 * DownloadManager — parallel download queue with SHA-256 verification
 *
 * Manages a queue of file downloads with a maximum of 5 simultaneous
 * downloads. Reports progress as a percentage of total files completed.
 * Verifies each file's SHA-256 hash after download and retries up to 3 times
 * on mismatch before reporting failure.
 *
 * Uses only Node.js built-in modules (`http`, `https`, `fs`, `path`).
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { HashVerifier } from './HashVerifier.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DownloadItem {
  /** Full URL of the file to download. */
  url: string;
  /** Filename to save as (without directory). */
  filename: string;
  /** Directory where the file will be saved. */
  destinationDir: string;
  /** Expected SHA-256 hash (lowercase hex). Optional — skips verification if absent. */
  expectedHash?: string;
}

export interface DownloadProgress {
  /** Overall completion percentage (0–100). */
  totalPercent: number;
  /** Filename currently being downloaded. */
  currentFile: string;
  /** Number of files fully processed (success or failure). */
  completedCount: number;
  /** Total number of files in the queue. */
  totalCount: number;
}

export interface VerificationResult {
  success: boolean;
  filename: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// DownloadManager
// ---------------------------------------------------------------------------

/** Maximum number of simultaneous downloads. Requirements: 9.1 */
const MAX_CONCURRENT = 5;

/** Maximum number of retry attempts on hash mismatch. Requirements: 9.4 */
const MAX_RETRIES = 3;

export class DownloadManager {
  private readonly verifier = new HashVerifier();
  private readonly progressCallbacks: Array<(progress: DownloadProgress) => void> = [];

  // Queue state
  private queue: DownloadItem[] = [];
  private totalCount = 0;
  private completedCount = 0;
  private activeCount = 0;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Adds items to the download queue.
   *
   * Items are processed when `start()` is called. Calling `enqueue` multiple
   * times before `start()` accumulates items in the queue.
   *
   * Requirements: 9.1
   */
  enqueue(items: DownloadItem[]): void {
    this.queue.push(...items);
    this.totalCount += items.length;
  }

  /**
   * Registers a callback to receive progress updates.
   *
   * The callback is invoked whenever a download starts or completes.
   * Multiple callbacks can be registered.
   *
   * Requirements: 9.2
   */
  onProgress(callback: (progress: DownloadProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Downloads a single item, verifies its SHA-256 hash, and retries up to
   * `MAX_RETRIES` times on hash mismatch.
   *
   * If `expectedHash` is not provided, the download is considered successful
   * without hash verification.
   *
   * Requirements: 9.3, 9.4
   */
  async verifyAndRetry(item: DownloadItem): Promise<VerificationResult> {
    const destPath = path.join(item.destinationDir, item.filename);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this._downloadFile(item.url, destPath);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === MAX_RETRIES) {
          return {
            success: false,
            filename: item.filename,
            error: `Download failed after ${MAX_RETRIES} retries: ${message}`,
          };
        }
        // Retry on download error as well.
        continue;
      }

      // Skip hash verification if no expected hash was provided.
      if (!item.expectedHash) {
        return { success: true, filename: item.filename };
      }

      const hashOk = await this.verifier.verify(destPath, item.expectedHash);
      if (hashOk) {
        return { success: true, filename: item.filename };
      }

      // Hash mismatch — delete the corrupt file before retrying.
      try {
        await fs.promises.unlink(destPath);
      } catch {
        // Ignore deletion errors; the file may not exist.
      }

      if (attempt === MAX_RETRIES) {
        return {
          success: false,
          filename: item.filename,
          error: `Hash mismatch after ${MAX_RETRIES} retries`,
        };
      }
    }

    // Unreachable, but satisfies TypeScript's control-flow analysis.
    return {
      success: false,
      filename: item.filename,
      error: `Hash mismatch after ${MAX_RETRIES} retries`,
    };
  }

  /**
   * Starts processing the download queue.
   *
   * Resolves when all enqueued items have been processed (successfully or
   * not). Maintains at most `MAX_CONCURRENT` simultaneous downloads.
   *
   * Requirements: 9.1, 9.2
   */
  async start(): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    // Snapshot the queue so that items enqueued after start() is called are
    // not processed in this run.
    const items = this.queue.splice(0, this.queue.length);
    this.totalCount = items.length;
    this.completedCount = 0;
    this.activeCount = 0;

    if (items.length === 0) {
      return results;
    }

    return new Promise<VerificationResult[]>((resolve) => {
      let index = 0;

      const tryStartNext = (): void => {
        while (this.activeCount < MAX_CONCURRENT && index < items.length) {
          const item = items[index++]!;
          this.activeCount++;

          // Notify progress: a new file is starting.
          this._emitProgress(item.filename);

          this.verifyAndRetry(item).then((result) => {
            results.push(result);
            this.activeCount--;
            this.completedCount++;

            // Notify progress: a file completed.
            this._emitProgress(item.filename);

            if (this.completedCount === items.length) {
              resolve(results);
            } else {
              tryStartNext();
            }
          }).catch((err: unknown) => {
            // verifyAndRetry should never reject, but handle defensively.
            const message = err instanceof Error ? err.message : String(err);
            results.push({ success: false, filename: item.filename, error: message });
            this.activeCount--;
            this.completedCount++;

            this._emitProgress(item.filename);

            if (this.completedCount === items.length) {
              resolve(results);
            } else {
              tryStartNext();
            }
          });
        }
      };

      tryStartNext();
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Emits a progress event to all registered callbacks.
   */
  private _emitProgress(currentFile: string): void {
    const progress: DownloadProgress = {
      totalPercent: this.totalCount > 0
        ? Math.round((this.completedCount / this.totalCount) * 100)
        : 0,
      currentFile,
      completedCount: this.completedCount,
      totalCount: this.totalCount,
    };

    for (const cb of this.progressCallbacks) {
      cb(progress);
    }
  }

  /**
   * Downloads a file from `url` and saves it to `destPath`.
   *
   * Follows HTTP redirects (up to 5 hops). Creates the destination directory
   * if it does not exist.
   *
   * Requirements: 9.1
   */
  private async _downloadFile(url: string, destPath: string, redirectCount = 0): Promise<void> {
    if (redirectCount > 5) {
      throw new Error(`Too many redirects for URL: ${url}`);
    }

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    return new Promise<void>((resolve, reject) => {
      const parsedUrl = new URL(url);
      const transport = parsedUrl.protocol === 'https:' ? https : http;

      const request = transport.get(url, (response) => {
        const statusCode = response.statusCode ?? 0;

        // Handle redirects.
        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume(); // Consume and discard the response body.
          const redirectUrl = new URL(response.headers.location, url).toString();
          this._downloadFile(redirectUrl, destPath, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${statusCode} for URL: ${url}`));
          return;
        }

        const fileStream = fs.createWriteStream(destPath);

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err: Error) => {
          fs.unlink(destPath, () => { /* ignore */ });
          reject(err);
        });

        response.on('error', (err: Error) => {
          fileStream.destroy();
          fs.unlink(destPath, () => { /* ignore */ });
          reject(err);
        });
      });

      request.on('error', (err: Error) => {
        reject(err);
      });

      request.setTimeout(30_000, () => {
        request.destroy(new Error(`Request timeout for URL: ${url}`));
      });
    });
  }
}
