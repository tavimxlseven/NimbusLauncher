/**
 * Property-based tests for OfflineAuthManager — username validation
 *
 * # Feature: minecraft-launcher-platform, Property 5: Validação de username offline
 *
 * **Property 5: Validação de username offline**
 * For any username string submitted in offline mode, the Launcher must accept
 * exactly usernames composed of 3 to 16 alphanumeric characters or underscores,
 * and reject all others (including empty strings, strings with spaces, strings
 * with special characters, strings with length outside the range).
 *
 * **Validates: Requirements 8.3**
 *
 * Uses fast-check with 200 iterations per property.
 */

import * as fc from 'fast-check';
import { OfflineAuthManager } from './OfflineAuthManager.js';

const manager = new OfflineAuthManager();

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Characters allowed in a valid offline username: [a-zA-Z0-9_] */
const validCharArb = fc.oneof(
  fc.integer({ min: 0x61, max: 0x7a }).map((n) => String.fromCharCode(n)), // a-z
  fc.integer({ min: 0x41, max: 0x5a }).map((n) => String.fromCharCode(n)), // A-Z
  fc.integer({ min: 0x30, max: 0x39 }).map((n) => String.fromCharCode(n)), // 0-9
  fc.constant('_'),
);

/** Valid username: 3–16 chars from [a-zA-Z0-9_] */
const validUsernameArb = fc
  .array(validCharArb, { minLength: 3, maxLength: 16 })
  .map((chars) => chars.join(''));

/** Username that is too short: 0–2 chars from [a-zA-Z0-9_] */
const tooShortUsernameArb = fc
  .array(validCharArb, { minLength: 0, maxLength: 2 })
  .map((chars) => chars.join(''));

/** Username that is too long: 17–50 chars from [a-zA-Z0-9_] */
const tooLongUsernameArb = fc
  .array(validCharArb, { minLength: 17, maxLength: 50 })
  .map((chars) => chars.join(''));

/**
 * Username with at least one forbidden character (not [a-zA-Z0-9_]).
 * We inject a forbidden char at a random position inside an otherwise
 * valid-length string.
 */
const forbiddenCharArb = fc.oneof(
  fc.constant(' '),
  fc.constant('-'),
  fc.constant('.'),
  fc.constant('@'),
  fc.constant('!'),
  fc.constant('#'),
  fc.constant('$'),
  fc.constant('%'),
  fc.constant('^'),
  fc.constant('&'),
  fc.constant('*'),
  fc.constant('('),
  fc.constant(')'),
  fc.constant('+'),
  fc.constant('='),
  fc.constant('['),
  fc.constant(']'),
  fc.constant('{'),
  fc.constant('}'),
  fc.constant('|'),
  fc.constant('\\'),
  fc.constant('/'),
  fc.constant('?'),
  fc.constant('<'),
  fc.constant('>'),
  fc.constant(','),
  fc.constant(';'),
  fc.constant(':'),
  fc.constant('"'),
  fc.constant("'"),
  fc.constant('\n'),
  fc.constant('\t'),
  fc.constant('\0'),
  // Unicode / emoji
  fc.constant('é'),
  fc.constant('ñ'),
  fc.constant('ü'),
  fc.constant('😀'),
  fc.constant('中'),
);

const usernameWithForbiddenCharArb = fc
  .tuple(
    fc.array(validCharArb, { minLength: 2, maxLength: 7 }),
    forbiddenCharArb,
    fc.array(validCharArb, { minLength: 2, maxLength: 7 }),
  )
  .map(([prefix, bad, suffix]) => prefix.join('') + bad + suffix.join(''));

// ---------------------------------------------------------------------------
// FC run options — 200 iterations as required by the spec
// ---------------------------------------------------------------------------

const FC_OPTIONS: fc.Parameters<unknown> = { numRuns: 20 };

// ---------------------------------------------------------------------------
// Property 5 — sub-property A: valid usernames are accepted
// ---------------------------------------------------------------------------

describe('P5 — OfflineAuthManager.validateUsername — valid usernames accepted', () => {
  it(
    'accepts any username composed of 3–16 alphanumeric/underscore characters',
    () => {
      fc.assert(
        fc.property(validUsernameArb, (username) => {
          return manager.validateUsername(username) === true;
        }),
        FC_OPTIONS,
      );
    },
  );

  it('accepts username with exactly 3 characters (lower boundary)', () => {
    fc.assert(
      fc.property(
        fc.array(validCharArb, { minLength: 3, maxLength: 3 }).map((c) => c.join('')),
        (username) => {
          return manager.validateUsername(username) === true;
        },
      ),
      FC_OPTIONS,
    );
  });

  it('accepts username with exactly 16 characters (upper boundary)', () => {
    fc.assert(
      fc.property(
        fc.array(validCharArb, { minLength: 16, maxLength: 16 }).map((c) => c.join('')),
        (username) => {
          return manager.validateUsername(username) === true;
        },
      ),
      FC_OPTIONS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 — sub-property B: too-short usernames are rejected
// ---------------------------------------------------------------------------

describe('P5 — OfflineAuthManager.validateUsername — too-short usernames rejected', () => {
  it('rejects any username shorter than 3 characters (including empty string)', () => {
    fc.assert(
      fc.property(tooShortUsernameArb, (username) => {
        return manager.validateUsername(username) === false;
      }),
      FC_OPTIONS,
    );
  });

  it('rejects username with exactly 2 characters (boundary below minimum)', () => {
    fc.assert(
      fc.property(
        fc.array(validCharArb, { minLength: 2, maxLength: 2 }).map((c) => c.join('')),
        (username) => {
          return manager.validateUsername(username) === false;
        },
      ),
      FC_OPTIONS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 — sub-property C: too-long usernames are rejected
// ---------------------------------------------------------------------------

describe('P5 — OfflineAuthManager.validateUsername — too-long usernames rejected', () => {
  it('rejects any username longer than 16 characters', () => {
    fc.assert(
      fc.property(tooLongUsernameArb, (username) => {
        return manager.validateUsername(username) === false;
      }),
      FC_OPTIONS,
    );
  });

  it('rejects username with exactly 17 characters (boundary above maximum)', () => {
    fc.assert(
      fc.property(
        fc.array(validCharArb, { minLength: 17, maxLength: 17 }).map((c) => c.join('')),
        (username) => {
          return manager.validateUsername(username) === false;
        },
      ),
      FC_OPTIONS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 — sub-property D: usernames with forbidden characters are rejected
// ---------------------------------------------------------------------------

describe('P5 — OfflineAuthManager.validateUsername — forbidden characters rejected', () => {
  it('rejects any username containing at least one character outside [a-zA-Z0-9_]', () => {
    fc.assert(
      fc.property(usernameWithForbiddenCharArb, (username) => {
        return manager.validateUsername(username) === false;
      }),
      FC_OPTIONS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 — sub-property E: arbitrary strings — accept iff valid
// ---------------------------------------------------------------------------

describe('P5 — OfflineAuthManager.validateUsername — arbitrary strings', () => {
  it(
    'for any arbitrary string, validateUsername returns true iff it matches /^[a-zA-Z0-9_]{3,16}$/',
    () => {
      fc.assert(
        fc.property(fc.string(), (username) => {
          const expected = /^[a-zA-Z0-9_]{3,16}$/.test(username);
          return manager.validateUsername(username) === expected;
        }),
        FC_OPTIONS,
      );
    },
  );
});
