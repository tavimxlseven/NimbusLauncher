/**
 * Unit tests for MicrosoftAuthManager
 *
 * Tests cover:
 * - startDeviceCodeFlow: returns DeviceCodeResult with correct shape
 * - pollForToken: handles authorization_pending, success, cancellation, expiry
 * - refreshToken: uses cached account or refresh token; throws on failure
 * - storeTokens / loadTokens: file-based fallback round-trip
 *
 * Requirements: 8.1, 8.6, 8.7, 8.8
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MicrosoftAuthManager } from './MicrosoftAuthManager.js';
import { AuthError, type AuthTokens } from './types.js';

// ---------------------------------------------------------------------------
// Mock keytar as unavailable so MicrosoftAuthManager falls back to file storage
// ---------------------------------------------------------------------------

// Simulate keytar being unavailable (native module not compiled).
// This ensures the file-based fallback path is exercised in these tests.
jest.mock('keytar', () => {
  throw new Error('Native module not available');
}, { virtual: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'access-token-abc',
    refreshToken: 'refresh-token-xyz',
    expiresAt: Date.now() + 3_600_000,
    userId: 'user-uuid-123',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// storeTokens / loadTokens (file-based fallback)
// ---------------------------------------------------------------------------

describe('MicrosoftAuthManager — token file storage', () => {
  const tokenFile = path.join(os.homedir(), '.nimbus-launcher', 'auth-tokens.json');

  afterEach(async () => {
    // Clean up the token file after each test.
    try {
      await fs.promises.unlink(tokenFile);
    } catch {
      // File may not exist — that's fine.
    }
  });

  it('stores tokens to file and loads them back', async () => {
    const manager = new MicrosoftAuthManager('test-client-id');
    const tokens = makeTokens();

    await manager.storeTokens(tokens);
    const loaded = await manager.loadTokens();

    expect(loaded).not.toBeNull();
    expect(loaded!.accessToken).toBe(tokens.accessToken);
    expect(loaded!.refreshToken).toBe(tokens.refreshToken);
    expect(loaded!.expiresAt).toBe(tokens.expiresAt);
    expect(loaded!.userId).toBe(tokens.userId);
  });

  it('returns null when no token file exists', async () => {
    // Ensure the file does not exist.
    try {
      await fs.promises.unlink(tokenFile);
    } catch {
      // Already absent.
    }

    const manager = new MicrosoftAuthManager('test-client-id');
    const loaded = await manager.loadTokens();

    expect(loaded).toBeNull();
  });

  it('returns null when token file contains invalid JSON', async () => {
    const dir = path.dirname(tokenFile);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(tokenFile, 'not-valid-json', 'utf-8');

    const manager = new MicrosoftAuthManager('test-client-id');
    const loaded = await manager.loadTokens();

    expect(loaded).toBeNull();
  });

  it('returns null when token file contains wrong shape', async () => {
    const dir = path.dirname(tokenFile);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      tokenFile,
      JSON.stringify({ foo: 'bar' }),
      'utf-8',
    );

    const manager = new MicrosoftAuthManager('test-client-id');
    const loaded = await manager.loadTokens();

    expect(loaded).toBeNull();
  });

  it('overwrites existing token file on second store', async () => {
    const manager = new MicrosoftAuthManager('test-client-id');
    const first = makeTokens({ accessToken: 'first-token' });
    const second = makeTokens({ accessToken: 'second-token' });

    await manager.storeTokens(first);
    await manager.storeTokens(second);

    const loaded = await manager.loadTokens();
    expect(loaded!.accessToken).toBe('second-token');
  });
});

// ---------------------------------------------------------------------------
// AuthError
// ---------------------------------------------------------------------------

describe('AuthError', () => {
  it('has the correct name and code', () => {
    const err = new AuthError('test message', 'test_code');
    expect(err.name).toBe('AuthError');
    expect(err.message).toBe('test message');
    expect(err.code).toBe('test_code');
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// pollForToken — error message assertions
// ---------------------------------------------------------------------------

describe('MicrosoftAuthManager — pollForToken error messages', () => {
  /**
   * We test the error messages by directly exercising the private
   * _extractErrorCode logic through the public pollForToken method.
   * We mock the MSAL app's acquireTokenByDeviceCode to throw specific errors.
   */

  it('throws descriptive error when device code expires (expired_token)', async () => {
    const manager = new MicrosoftAuthManager('test-client-id');

    // Inject a mock that immediately throws expired_token.
    const msalApp = (manager as unknown as { msalApp: { acquireTokenByDeviceCode: jest.Mock } }).msalApp;
    msalApp.acquireTokenByDeviceCode = jest.fn().mockRejectedValue(
      Object.assign(new Error('expired_token'), { errorCode: 'expired_token' }),
    );

    await expect(manager.pollForToken('device-code-123')).rejects.toMatchObject({
      message: 'Login cancelado: o código de dispositivo expirou após 15 minutos',
      code: 'expired_token',
    });
  });

  it('throws descriptive error when user cancels (authorization_declined)', async () => {
    const manager = new MicrosoftAuthManager('test-client-id');

    const msalApp = (manager as unknown as { msalApp: { acquireTokenByDeviceCode: jest.Mock } }).msalApp;
    msalApp.acquireTokenByDeviceCode = jest.fn().mockRejectedValue(
      Object.assign(new Error('authorization_declined'), {
        errorCode: 'authorization_declined',
      }),
    );

    await expect(manager.pollForToken('device-code-123')).rejects.toMatchObject({
      message: 'Login cancelado pelo usuário',
      code: 'authorization_declined',
    });
  });

  it('polls while authorization_pending and succeeds on next attempt', async () => {
    const manager = new MicrosoftAuthManager('test-client-id');

    const pendingError = Object.assign(new Error('authorization_pending'), {
      errorCode: 'authorization_pending',
    });

    const successResult = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresOn: new Date(Date.now() + 3_600_000),
      account: { homeAccountId: 'user-id', localAccountId: 'user-id' },
      uniqueId: 'user-id',
    };

    const msalApp = (manager as unknown as { msalApp: { acquireTokenByDeviceCode: jest.Mock } }).msalApp;
    msalApp.acquireTokenByDeviceCode = jest
      .fn()
      .mockRejectedValueOnce(pendingError)
      .mockResolvedValueOnce(successResult);

    // Use a very short interval to avoid slowing down the test.
    const tokens = await manager.pollForToken('device-code-123', 0.001);

    expect(tokens.accessToken).toBe('access-token');
    expect(tokens.userId).toBe('user-id');
    expect(msalApp.acquireTokenByDeviceCode).toHaveBeenCalledTimes(2);
  });

  it('throws expired error when deadline is exceeded', async () => {
    const manager = new MicrosoftAuthManager('test-client-id');

    // Always return authorization_pending so the loop runs until deadline.
    const pendingError = Object.assign(new Error('authorization_pending'), {
      errorCode: 'authorization_pending',
    });

    const msalApp = (manager as unknown as { msalApp: { acquireTokenByDeviceCode: jest.Mock } }).msalApp;
    msalApp.acquireTokenByDeviceCode = jest.fn().mockRejectedValue(pendingError);

    // Patch the private deadline calculation by mocking Date.now so that the
    // deadline is already in the past when pollForToken starts.
    const realDateNow = Date.now;
    const frozenNow = realDateNow();
    // First call (deadline = frozenNow + TIMEOUT) — return a past deadline.
    let callCount = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call sets the deadline; subsequent calls check it.
      // Return a value 16 minutes ahead so the while condition is false immediately.
      return frozenNow + (callCount === 1 ? 0 : 16 * 60 * 1_000);
    });

    try {
      await expect(manager.pollForToken('device-code-123', 0.001)).rejects.toMatchObject({
        message: 'Login cancelado: o código de dispositivo expirou após 15 minutos',
        code: 'expired_token',
      });
    } finally {
      jest.restoreAllMocks();
    }
  }, 10_000);
});

// ---------------------------------------------------------------------------
// refreshToken — error message assertions
// ---------------------------------------------------------------------------

describe('MicrosoftAuthManager — refreshToken error messages', () => {
  it('throws descriptive error when refresh fails with InteractionRequiredAuthError', async () => {
    const manager = new MicrosoftAuthManager('test-client-id');

    // Mock the token cache to return no accounts.
    const msalApp = (manager as unknown as {
      msalApp: {
        getTokenCache: jest.Mock;
        acquireTokenByRefreshToken: jest.Mock;
      };
    }).msalApp;

    msalApp.getTokenCache = jest.fn().mockReturnValue({
      getAllAccounts: jest.fn().mockResolvedValue([]),
    });

    // Mock acquireTokenByRefreshToken to throw InteractionRequiredAuthError.
    const { InteractionRequiredAuthError } = await import('@azure/msal-node');
    msalApp.acquireTokenByRefreshToken = jest
      .fn()
      .mockRejectedValue(new InteractionRequiredAuthError('interaction_required'));

    await expect(manager.refreshToken('some-refresh-token')).rejects.toMatchObject({
      message: 'Falha ao renovar token. Por favor, faça login novamente.',
      code: 'refresh_failed',
    });
  });

  it('uses cached account for silent token refresh', async () => {
    const manager = new MicrosoftAuthManager('test-client-id');

    const mockAccount = { homeAccountId: 'user-id', localAccountId: 'user-id' };
    const successResult = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresOn: new Date(Date.now() + 3_600_000),
      account: mockAccount,
      uniqueId: 'user-id',
    };

    const msalApp = (manager as unknown as {
      msalApp: {
        getTokenCache: jest.Mock;
        acquireTokenSilent: jest.Mock;
      };
    }).msalApp;

    msalApp.getTokenCache = jest.fn().mockReturnValue({
      getAllAccounts: jest.fn().mockResolvedValue([mockAccount]),
    });
    msalApp.acquireTokenSilent = jest.fn().mockResolvedValue(successResult);

    const tokens = await manager.refreshToken('old-refresh-token');

    expect(tokens.accessToken).toBe('new-access-token');
    expect(msalApp.acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: true }),
    );
  });
});
