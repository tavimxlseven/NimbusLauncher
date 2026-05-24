/**
 * Unit tests for HashVerifier
 *
 * Tests cover:
 * - computeHash: returns correct SHA-256 hex string for known content
 * - computeHash: returns lowercase hex
 * - verify: returns true when hash matches
 * - verify: returns false when hash does not match
 * - verify: case-insensitive comparison (uppercase expected hash)
 * - computeHash: rejects when file does not exist
 *
 * Requirements: 9.3
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { HashVerifier } from './HashVerifier.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a temporary file with the given content and returns its path. */
async function writeTempFile(content: string | Buffer): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hash-verifier-test-'));
  const filePath = path.join(dir, 'test-file.bin');
  await fs.promises.writeFile(filePath, content);
  return filePath;
}

/** Computes the expected SHA-256 of a string using Node's crypto directly. */
function expectedSha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HashVerifier', () => {
  let verifier: HashVerifier;

  beforeEach(() => {
    verifier = new HashVerifier();
  });

  // -------------------------------------------------------------------------
  // computeHash
  // -------------------------------------------------------------------------

  describe('computeHash', () => {
    it('returns the correct SHA-256 hash for a known string', async () => {
      const content = 'hello world';
      const filePath = await writeTempFile(content);

      const hash = await verifier.computeHash(filePath);

      expect(hash).toBe(expectedSha256(content));
    });

    it('returns a lowercase hex string', async () => {
      const filePath = await writeTempFile('some content');

      const hash = await verifier.computeHash(filePath);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns the correct hash for an empty file', async () => {
      const filePath = await writeTempFile('');

      const hash = await verifier.computeHash(filePath);

      // SHA-256 of empty string is well-known.
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('returns the correct hash for binary content', async () => {
      const content = Buffer.from([0x00, 0xff, 0x10, 0x20, 0xab, 0xcd]);
      const filePath = await writeTempFile(content);

      const hash = await verifier.computeHash(filePath);

      expect(hash).toBe(expectedSha256(content));
    });

    it('rejects with an error when the file does not exist', async () => {
      await expect(
        verifier.computeHash('/nonexistent/path/to/file.bin'),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // verify
  // -------------------------------------------------------------------------

  describe('verify', () => {
    it('returns true when the computed hash matches the expected hash', async () => {
      const content = 'verify me';
      const filePath = await writeTempFile(content);
      const expected = expectedSha256(content);

      const result = await verifier.verify(filePath, expected);

      expect(result).toBe(true);
    });

    it('returns false when the computed hash does not match', async () => {
      const filePath = await writeTempFile('original content');
      const wrongHash = 'a'.repeat(64); // 64 hex chars, all 'a'

      const result = await verifier.verify(filePath, wrongHash);

      expect(result).toBe(false);
    });

    it('accepts uppercase expected hash (case-insensitive comparison)', async () => {
      const content = 'case test';
      const filePath = await writeTempFile(content);
      const expected = expectedSha256(content).toUpperCase();

      const result = await verifier.verify(filePath, expected);

      expect(result).toBe(true);
    });

    it('returns false for a hash that differs by one character', async () => {
      const content = 'off by one';
      const filePath = await writeTempFile(content);
      const correct = expectedSha256(content);
      // Flip the last character.
      const wrong = correct.slice(0, -1) + (correct.endsWith('0') ? '1' : '0');

      const result = await verifier.verify(filePath, wrong);

      expect(result).toBe(false);
    });

    it('rejects when the file does not exist', async () => {
      await expect(
        verifier.verify('/nonexistent/file.bin', 'a'.repeat(64)),
      ).rejects.toThrow();
    });
  });
});
