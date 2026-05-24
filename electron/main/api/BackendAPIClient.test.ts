/**
 * Unit tests for BackendAPIClient
 *
 * Tests the HTTPS + JWT communication layer between the Electron main process
 * and the Backend_API. Uses a mock HTTP server to avoid real network calls.
 *
 * Requirements: 4.6, 5.1, 5.2
 */

import * as http from 'http';
import type { AddressInfo } from 'net';
import { BackendAPIClient, BackendAPIError } from './BackendAPIClient.js';
import { KeychainService } from '../auth/KeychainService.js';
import { MicrosoftAuthManager } from '../auth/MicrosoftAuthManager.js';
import type { AuthTokens } from '../auth/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: Date.now() + 3_600_000,
    userId: 'user-uuid-123',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock server factory
// ---------------------------------------------------------------------------

interface MockServerOptions {
  statusCode: number;
  body: unknown;
  /** If set, the server checks for this Authorization header value */
  expectedAuth?: string;
}

/**
 * Creates a minimal HTTP server that responds with the given status and body.
 * Returns the server and its base URL.
 */
async function createMockServer(
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => void,
): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function jsonHandler(opts: MockServerOptions) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (opts.expectedAuth) {
      const authHeader = req.headers['authorization'];
      if (authHeader !== opts.expectedAuth) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }));
        return;
      }
    }
    const body = JSON.stringify(opts.body);
    res.writeHead(opts.statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  };
}

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

function makeKeychainService(tokens: AuthTokens | null = makeTokens()): KeychainService {
  const svc = new KeychainService();
  jest.spyOn(svc, 'loadTokens').mockResolvedValue(tokens);
  jest.spyOn(svc, 'storeTokens').mockResolvedValue(undefined);
  return svc;
}

function makeAuthManager(newTokens?: AuthTokens): MicrosoftAuthManager {
  const mgr = new MicrosoftAuthManager();
  if (newTokens) {
    jest.spyOn(mgr, 'refreshToken').mockResolvedValue(newTokens);
  } else {
    jest.spyOn(mgr, 'refreshToken').mockRejectedValue(new Error('refresh failed'));
  }
  return mgr;
}

// ---------------------------------------------------------------------------
// Tests — getLibrary
// ---------------------------------------------------------------------------

describe('BackendAPIClient.getLibrary', () => {
  let server: http.Server;
  let baseUrl: string;

  afterEach(async () => {
    if (server) await closeServer(server);
    jest.restoreAllMocks();
  });

  it('returns library items on 200 response', async () => {
    const items = [
      { id: 1, source: 'modrinth', external_id: 'abc', item_type: 'mod', name: 'Sodium' },
    ];
    ({ server, baseUrl } = await createMockServer(
      jsonHandler({ statusCode: 200, body: { data: items } }),
    ));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    const result = await client.getLibrary();
    expect(result).toEqual(items);
  });

  it('sends Authorization Bearer header', async () => {
    const tokens = makeTokens({ accessToken: 'my-jwt-token' });
    let capturedAuth: string | undefined;

    ({ server, baseUrl } = await createMockServer((req, res) => {
      capturedAuth = req.headers['authorization'] as string;
      const body = JSON.stringify({ data: [] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    }));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(tokens),
      authManager: makeAuthManager(),
    });

    await client.getLibrary();
    expect(capturedAuth).toBe('Bearer my-jwt-token');
  });

  it('throws BackendAPIError on 503', async () => {
    ({ server, baseUrl } = await createMockServer(
      jsonHandler({
        statusCode: 503,
        body: { errors: [{ service: 'curseforge', message: 'Serviço indisponível' }] },
      }),
    ));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    await expect(client.getLibrary()).rejects.toThrow(BackendAPIError);
    await expect(client.getLibrary()).rejects.toMatchObject({ statusCode: 503 });
  });

  it('throws BackendAPIError with "Serviço indisponível" message on 503', async () => {
    ({ server, baseUrl } = await createMockServer(
      jsonHandler({
        statusCode: 503,
        body: { errors: [{ service: 'curseforge', message: 'Serviço indisponível' }] },
      }),
    ));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    await expect(client.getLibrary()).rejects.toThrow(/Serviço indisponível/);
  });

  it('returns empty array when library is empty', async () => {
    ({ server, baseUrl } = await createMockServer(
      jsonHandler({ statusCode: 200, body: { data: [] } }),
    ));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    const result = await client.getLibrary();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests — addToLibrary
// ---------------------------------------------------------------------------

describe('BackendAPIClient.addToLibrary', () => {
  let server: http.Server;
  let baseUrl: string;

  afterEach(async () => {
    if (server) await closeServer(server);
    jest.restoreAllMocks();
  });

  it('returns the created library item on 201', async () => {
    const created = {
      id: 42,
      source: 'modrinth',
      external_id: 'sodium-id',
      item_type: 'mod',
      name: 'Sodium',
      version: '0.5.8',
      added_at: '2024-01-15T10:00:00Z',
    };

    ({ server, baseUrl } = await createMockServer(
      jsonHandler({ statusCode: 201, body: { data: created } }),
    ));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    const result = await client.addToLibrary({
      source: 'modrinth',
      external_id: 'sodium-id',
      item_type: 'mod',
      name: 'Sodium',
      version: '0.5.8',
    });

    expect(result).toEqual(created);
  });

  it('throws BackendAPIError with 409 on duplicate item', async () => {
    ({ server, baseUrl } = await createMockServer(
      jsonHandler({
        statusCode: 409,
        body: { errors: [{ message: 'Item já está na sua biblioteca', code: 'duplicate' }] },
      }),
    ));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    await expect(
      client.addToLibrary({
        source: 'modrinth',
        external_id: 'sodium-id',
        item_type: 'mod',
        name: 'Sodium',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('sends POST request with JSON body', async () => {
    let capturedMethod: string | undefined;
    let capturedBody = '';

    ({ server, baseUrl } = await createMockServer((req, res) => {
      capturedMethod = req.method;
      req.on('data', (chunk: Buffer) => { capturedBody += chunk.toString(); });
      req.on('end', () => {
        const body = JSON.stringify({ data: { id: 1, source: 'modrinth', external_id: 'x', item_type: 'mod', name: 'X' } });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(body);
      });
    }));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    await client.addToLibrary({ source: 'modrinth', external_id: 'x', item_type: 'mod', name: 'X' });

    expect(capturedMethod).toBe('POST');
    const parsed = JSON.parse(capturedBody) as { library_item: unknown };
    expect(parsed).toHaveProperty('library_item');
  });
});

// ---------------------------------------------------------------------------
// Tests — removeFromLibrary
// ---------------------------------------------------------------------------

describe('BackendAPIClient.removeFromLibrary', () => {
  let server: http.Server;
  let baseUrl: string;

  afterEach(async () => {
    if (server) await closeServer(server);
    jest.restoreAllMocks();
  });

  it('resolves without error on 204', async () => {
    ({ server, baseUrl } = await createMockServer((_req, res) => {
      res.writeHead(204);
      res.end();
    }));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    await expect(client.removeFromLibrary(42)).resolves.toBeUndefined();
  });

  it('sends DELETE request to correct path', async () => {
    let capturedPath: string | undefined;

    ({ server, baseUrl } = await createMockServer((req, res) => {
      capturedPath = req.url;
      res.writeHead(204);
      res.end();
    }));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    await client.removeFromLibrary(99);
    expect(capturedPath).toBe('/api/v1/library/99');
  });

  it('throws BackendAPIError on 404', async () => {
    ({ server, baseUrl } = await createMockServer(
      jsonHandler({
        statusCode: 404,
        body: { errors: [{ message: 'Recurso não encontrado', code: 'not_found' }] },
      }),
    ));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    await expect(client.removeFromLibrary(999)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// Tests — getModpackManifest
// ---------------------------------------------------------------------------

describe('BackendAPIClient.getModpackManifest', () => {
  let server: http.Server;
  let baseUrl: string;

  afterEach(async () => {
    if (server) await closeServer(server);
    jest.restoreAllMocks();
  });

  it('returns manifest on 200 response', async () => {
    const manifest = {
      format_version: 1,
      name: 'Tech Pack',
      minecraft_version: '1.20.1',
      loader: 'fabric',
      loader_version: '0.15.11',
      mods: [
        {
          source: 'modrinth',
          project_id: 'AANobbMI',
          version_id: 'IZskON6d',
          filename: 'sodium-fabric-0.5.8.jar',
          sha256: 'a1b2c3d4e5f6',
        },
      ],
      generated_at: '2024-01-15T10:30:00Z',
    };

    ({ server, baseUrl } = await createMockServer(
      jsonHandler({ statusCode: 200, body: { data: manifest } }),
    ));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    const result = await client.getModpackManifest('AANobbMI', 'modrinth');
    expect(result).toEqual(manifest);
  });

  it('includes source query parameter in the request URL', async () => {
    let capturedUrl: string | undefined;

    ({ server, baseUrl } = await createMockServer((req, res) => {
      capturedUrl = req.url;
      const body = JSON.stringify({ data: { format_version: 1, name: 'x', minecraft_version: '1.20.1', loader: 'fabric', loader_version: null, mods: [], generated_at: '' } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    }));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(),
    });

    await client.getModpackManifest('my-pack-id', 'curseforge');
    expect(capturedUrl).toContain('/api/v1/modpacks/my-pack-id/manifest');
    expect(capturedUrl).toContain('source=curseforge');
  });

  it('throws BackendAPIError on 401 when token refresh fails', async () => {
    ({ server, baseUrl } = await createMockServer(
      jsonHandler({
        statusCode: 401,
        body: { errors: [{ message: 'Unauthorized' }] },
      }),
    ));

    const client = new BackendAPIClient(baseUrl, {
      keychainService: makeKeychainService(),
      authManager: makeAuthManager(), // refresh will fail
    });

    await expect(
      client.getModpackManifest('pack-id', 'modrinth'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('retries with refreshed token on 401 when refresh succeeds', async () => {
    const newTokens = makeTokens({ accessToken: 'refreshed-token' });
    let requestCount = 0;

    ({ server, baseUrl } = await createMockServer((req, res) => {
      requestCount++;
      const authHeader = req.headers['authorization'];
      if (authHeader === 'Bearer refreshed-token') {
        const manifest = {
          format_version: 1,
          name: 'Pack',
          minecraft_version: '1.20.1',
          loader: 'fabric',
          loader_version: null,
          mods: [],
          generated_at: '2024-01-15T10:30:00Z',
        };
        const body = JSON.stringify({ data: manifest });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
      } else {
        const body = JSON.stringify({ errors: [{ message: 'Unauthorized' }] });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(body);
      }
    }));

    const keychainService = makeKeychainService(makeTokens({ accessToken: 'old-token' }));
    const authManager = makeAuthManager(newTokens);

    const client = new BackendAPIClient(baseUrl, { keychainService, authManager });

    const result = await client.getModpackManifest('pack-id', 'modrinth');
    expect(result.name).toBe('Pack');
    expect(requestCount).toBe(2); // first attempt (401) + retry with refreshed token
  });
});

// ---------------------------------------------------------------------------
// Tests — BackendAPIError
// ---------------------------------------------------------------------------

describe('BackendAPIError', () => {
  it('has correct name, message and statusCode', () => {
    const err = new BackendAPIError('Something went wrong', 422, [
      { message: 'field is invalid', code: 'invalid' },
    ]);
    expect(err.name).toBe('BackendAPIError');
    expect(err.message).toBe('Something went wrong');
    expect(err.statusCode).toBe(422);
    expect(err.errors).toHaveLength(1);
  });

  it('is an instance of Error', () => {
    const err = new BackendAPIError('test', 500);
    expect(err).toBeInstanceOf(Error);
  });
});
