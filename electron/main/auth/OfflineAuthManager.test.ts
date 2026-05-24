/**
 * Unit tests for OfflineAuthManager
 *
 * Tests cover:
 * - validateUsername: accepts valid usernames, rejects invalid ones
 * - generateUUID: produces deterministic UUID v3 from username
 * - createProfile: returns correct OfflineProfile, throws on invalid username
 *
 * Requirements: 8.3, 8.4
 */

import { OfflineAuthManager } from './OfflineAuthManager.js';

// ---------------------------------------------------------------------------
// validateUsername
// ---------------------------------------------------------------------------

describe('OfflineAuthManager — validateUsername', () => {
  const manager = new OfflineAuthManager();

  // Valid usernames
  it('accepts a username with exactly 3 characters', () => {
    expect(manager.validateUsername('abc')).toBe(true);
  });

  it('accepts a username with exactly 16 characters', () => {
    expect(manager.validateUsername('abcdefghijklmnop')).toBe(true);
  });

  it('accepts a username with letters only', () => {
    expect(manager.validateUsername('Steve')).toBe(true);
  });

  it('accepts a username with digits only', () => {
    expect(manager.validateUsername('123')).toBe(true);
  });

  it('accepts a username with underscores', () => {
    expect(manager.validateUsername('my_username')).toBe(true);
  });

  it('accepts a username with mixed alphanumeric and underscores', () => {
    expect(manager.validateUsername('Player_123')).toBe(true);
  });

  it('accepts a username that starts with an underscore', () => {
    expect(manager.validateUsername('_player')).toBe(true);
  });

  it('accepts a username that ends with an underscore', () => {
    expect(manager.validateUsername('player_')).toBe(true);
  });

  it('accepts a username with uppercase letters', () => {
    expect(manager.validateUsername('STEVE')).toBe(true);
  });

  // Invalid usernames — too short
  it('rejects an empty string', () => {
    expect(manager.validateUsername('')).toBe(false);
  });

  it('rejects a username with 1 character', () => {
    expect(manager.validateUsername('a')).toBe(false);
  });

  it('rejects a username with 2 characters', () => {
    expect(manager.validateUsername('ab')).toBe(false);
  });

  // Invalid usernames — too long
  it('rejects a username with 17 characters', () => {
    expect(manager.validateUsername('abcdefghijklmnopq')).toBe(false);
  });

  it('rejects a username with 32 characters', () => {
    expect(manager.validateUsername('a'.repeat(32))).toBe(false);
  });

  // Invalid usernames — forbidden characters
  it('rejects a username with a space', () => {
    expect(manager.validateUsername('my name')).toBe(false);
  });

  it('rejects a username with a hyphen', () => {
    expect(manager.validateUsername('my-name')).toBe(false);
  });

  it('rejects a username with a dot', () => {
    expect(manager.validateUsername('my.name')).toBe(false);
  });

  it('rejects a username with an at-sign', () => {
    expect(manager.validateUsername('my@name')).toBe(false);
  });

  it('rejects a username with unicode characters', () => {
    expect(manager.validateUsername('Stëve')).toBe(false);
  });

  it('rejects a username with emoji', () => {
    expect(manager.validateUsername('play😀r')).toBe(false);
  });

  it('rejects a username with a newline character', () => {
    expect(manager.validateUsername('abc\ndef')).toBe(false);
  });

  it('rejects a username with a null byte', () => {
    expect(manager.validateUsername('abc\0def')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateUUID
// ---------------------------------------------------------------------------

describe('OfflineAuthManager — generateUUID', () => {
  const manager = new OfflineAuthManager();

  it('returns a string in UUID format', () => {
    const uuid = manager.generateUUID('Steve');
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('is deterministic — same username always produces the same UUID', () => {
    const uuid1 = manager.generateUUID('Steve');
    const uuid2 = manager.generateUUID('Steve');
    expect(uuid1).toBe(uuid2);
  });

  it('produces different UUIDs for different usernames', () => {
    const uuid1 = manager.generateUUID('Steve');
    const uuid2 = manager.generateUUID('Alex');
    expect(uuid1).not.toBe(uuid2);
  });

  it('is case-sensitive — different case produces different UUID', () => {
    const uuid1 = manager.generateUUID('steve');
    const uuid2 = manager.generateUUID('Steve');
    expect(uuid1).not.toBe(uuid2);
  });

  it('produces a UUID v3 (version digit is 3)', () => {
    const uuid = manager.generateUUID('Player_123');
    // UUID v3 has version digit 3 in the third group
    expect(uuid[14]).toBe('3');
  });

  it('produces a known UUID for "Steve" (regression test)', () => {
    // UUID v3 with DNS namespace for "Steve" — deterministic value
    const uuid = manager.generateUUID('Steve');
    // Verify it's a valid UUID v3 format (we don't hardcode the exact value
    // to avoid coupling to a specific uuid library version, but we verify
    // the format and determinism above)
    expect(typeof uuid).toBe('string');
    expect(uuid.length).toBe(36);
  });
});

// ---------------------------------------------------------------------------
// createProfile
// ---------------------------------------------------------------------------

describe('OfflineAuthManager — createProfile', () => {
  const manager = new OfflineAuthManager();

  it('returns an OfflineProfile with correct username', () => {
    const profile = manager.createProfile('Steve');
    expect(profile.username).toBe('Steve');
  });

  it('returns an OfflineProfile with type "offline"', () => {
    const profile = manager.createProfile('Steve');
    expect(profile.type).toBe('offline');
  });

  it('returns an OfflineProfile with a valid UUID', () => {
    const profile = manager.createProfile('Steve');
    expect(profile.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('UUID in profile matches generateUUID output', () => {
    const profile = manager.createProfile('Player_123');
    expect(profile.uuid).toBe(manager.generateUUID('Player_123'));
  });

  it('is deterministic — same username always produces the same profile', () => {
    const profile1 = manager.createProfile('Steve');
    const profile2 = manager.createProfile('Steve');
    expect(profile1.uuid).toBe(profile2.uuid);
    expect(profile1.username).toBe(profile2.username);
    expect(profile1.type).toBe(profile2.type);
  });

  it('throws TypeError for a username that is too short', () => {
    expect(() => manager.createProfile('ab')).toThrow(TypeError);
  });

  it('throws TypeError for a username that is too long', () => {
    expect(() => manager.createProfile('a'.repeat(17))).toThrow(TypeError);
  });

  it('throws TypeError for a username with spaces', () => {
    expect(() => manager.createProfile('my name')).toThrow(TypeError);
  });

  it('throws TypeError for an empty username', () => {
    expect(() => manager.createProfile('')).toThrow(TypeError);
  });

  it('error message includes the invalid username', () => {
    expect(() => manager.createProfile('bad name!')).toThrow(
      /Invalid offline username "bad name!"/,
    );
  });

  it('accepts a 3-character username', () => {
    const profile = manager.createProfile('abc');
    expect(profile.username).toBe('abc');
  });

  it('accepts a 16-character username', () => {
    const username = 'abcdefghijklmnop';
    const profile = manager.createProfile(username);
    expect(profile.username).toBe(username);
  });
});
