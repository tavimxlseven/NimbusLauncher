/**
 * HashVerifier — SHA-256 file integrity verification
 *
 * Uses Node.js built-in `crypto` module to compute and verify SHA-256 hashes
 * of downloaded files. No external dependencies required.
 *
 * Requirements: 9.3, 9.4
 */

import * as crypto from 'crypto';
import * as fs from 'fs';

export class HashVerifier {
  /**
   * Computes the SHA-256 hash of the file at the given path.
   *
   * Reads the file as a stream to avoid loading large files entirely into
   * memory. Returns the hash as a lowercase hex string.
   *
   * Requirements: 9.3
   */
  async computeHash(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk: Buffer) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Verifies that the file at `filePath` has the expected SHA-256 hash.
   *
   * Comparison is case-insensitive to handle both upper- and lower-case hex
   * strings from different API sources.
   *
   * Returns `true` if the computed hash matches `expectedHash`, `false`
   * otherwise.
   *
   * Requirements: 9.3
   */
  async verify(filePath: string, expectedHash: string): Promise<boolean> {
    const computed = await this.computeHash(filePath);
    return computed === expectedHash.toLowerCase();
  }
}
