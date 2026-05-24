/**
 * MicrosoftAuthManager — Device Code Flow + Xbox Live + XSTS + Minecraft chain
 *
 * For third-party Minecraft launchers, MSAL Node + Azure AD v2.0 endpoints
 * do NOT work with the public Mojang client ID (`00000000402b5328`) — it's
 * registered with the legacy `login.live.com` (Microsoft Account) platform,
 * which expects different endpoints, scopes and a different RpsTicket prefix.
 *
 * This implementation talks directly to login.live.com and the Xbox Live /
 * Minecraft Services REST APIs, mirroring the approach used by PrismLauncher
 * and other third-party launchers.
 *
 * Flow:
 *   1. POST /oauth20_connect.srf            → device_code, user_code, uri
 *   2. Poll POST /oauth20_token.srf         → access_token (Live), refresh_token
 *   3. POST user.auth.xboxlive.com          → XBL token + userhash
 *   4. POST xsts.auth.xboxlive.com          → XSTS token
 *   5. POST api.minecraftservices.com login → Minecraft access_token
 *   6. GET  api.minecraftservices.com/profile → username + UUID
 *
 * Requirements: 8.1, 8.6, 8.7, 8.8
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { AuthError, type AuthTokens, type DeviceCodeResult } from './types.js';
import { KeychainService } from './KeychainService.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Public Mojang launcher client ID — works with login.live.com (Microsoft
 * Account / Xbox Live legacy platform). This is what most third-party
 * launchers use. Override with MICROSOFT_CLIENT_ID env var if you have an
 * Azure AD app with the right permissions.
 */
const DEFAULT_CLIENT_ID = process.env['MICROSOFT_CLIENT_ID'] ?? '00000000402b5328';

/**
 * Legacy MSA scope required by login.live.com for Xbox Live access.
 * Note: this is NOT the modern OAuth scope format — it's the legacy MSA scope.
 */
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';

const DEVICE_CODE_URL = 'https://login.live.com/oauth20_connect.srf';
const TOKEN_URL       = 'https://login.live.com/oauth20_token.srf';

/** Maximum time the device-code flow may take (15 minutes). */
const DEVICE_CODE_TIMEOUT_MS = 15 * 60 * 1_000;

/** Plaintext fallback for tokens when keychain is unavailable. */
const FALLBACK_TOKEN_FILE = path.join(
  os.homedir(),
  '.nimbus-launcher',
  'auth-tokens.json',
);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

interface HttpResult { status: number; body: string }

function httpPostForm(url: string, params: Record<string, string>): Promise<HttpResult> {
  const body = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return httpRaw(url, 'POST', body, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
  });
}

function httpPostJson(url: string, payload: unknown, extra: Record<string, string> = {}): Promise<HttpResult> {
  const body = JSON.stringify(payload);
  return httpRaw(url, 'POST', body, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    Accept: 'application/json',
    ...extra,
  });
}

function httpGet(url: string, headers: Record<string, string>): Promise<HttpResult> {
  return httpRaw(url, 'GET', null, { Accept: 'application/json', ...headers });
}

function httpRaw(
  url: string,
  method: string,
  body: string | null,
  headers: Record<string, string | number>,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    let parsed: URL
    try { parsed = new URL(url) } catch (err) { reject(err); return }

    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers,
    }, (res) => {
      let chunks = ''
      res.on('data', (c: Buffer) => { chunks += c.toString() })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: chunks }))
    })
    req.on('error', reject)
    req.setTimeout(30_000, () => req.destroy(new Error('HTTP timeout')))
    if (body !== null) req.write(body)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Token endpoint response parsing
// ---------------------------------------------------------------------------

interface DeviceCodeResponse {
  user_code:        string
  device_code:      string
  verification_uri: string
  expires_in:       number
  interval:         number
}

interface TokenResponse {
  access_token:  string
  refresh_token: string
  expires_in:    number
  token_type?:   string
  user_id?:      string
}

interface TokenErrorResponse {
  error?:             string
  error_description?: string
}

interface MinecraftProfile {
  id:   string
  name: string
}

// ---------------------------------------------------------------------------
// MicrosoftAuthManager
// ---------------------------------------------------------------------------

export class MicrosoftAuthManager {
  private readonly clientId: string
  private readonly keychainService: KeychainService

  /** In-flight device code flow shared between startDeviceCodeFlow + pollForToken. */
  private _pendingFlow: {
    deviceCode: string
    deadline:   number
    interval:   number
  } | null = null

  constructor(clientId: string = DEFAULT_CLIENT_ID) {
    this.clientId = clientId
    this.keychainService = new KeychainService()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async startDeviceCodeFlow(): Promise<DeviceCodeResult> {
    const res = await httpPostForm(DEVICE_CODE_URL, {
      client_id:     this.clientId,
      scope:         SCOPE,
      response_type: 'device_code',
    })

    if (res.status !== 200) {
      throw new AuthError(
        `Falha ao iniciar Device Code Flow (HTTP ${res.status}): ${this._safeMsg(res.body)}`,
        'device_code_failed',
      )
    }

    let parsed: DeviceCodeResponse
    try { parsed = JSON.parse(res.body) }
    catch { throw new AuthError('Resposta inválida do servidor de autenticação.', 'invalid_response') }

    if (!parsed.device_code || !parsed.user_code || !parsed.verification_uri) {
      throw new AuthError('Servidor não retornou code/uri esperados.', 'invalid_response')
    }

    const interval = parsed.interval || 5
    this._pendingFlow = {
      deviceCode: parsed.device_code,
      deadline:   Date.now() + DEVICE_CODE_TIMEOUT_MS,
      interval:   interval,
    }

    return {
      deviceCode:      parsed.device_code,
      userCode:        parsed.user_code,
      verificationUri: parsed.verification_uri,
      expiresIn:       parsed.expires_in,
      interval:        interval,
    }
  }

  async pollForToken(_deviceCode: string, _interval?: number): Promise<AuthTokens> {
    const pending = this._pendingFlow
    if (!pending) {
      throw new AuthError(
        'Nenhum fluxo de Device Code ativo. Inicie o login novamente.',
        'no_pending_flow',
      )
    }

    const intervalMs = pending.interval * 1_000

    while (Date.now() < pending.deadline) {
      const res = await httpPostForm(TOKEN_URL, {
        client_id:   this.clientId,
        grant_type:  'urn:ietf:params:oauth:grant-type:device_code',
        device_code: pending.deviceCode,
      })

      if (res.status === 200) {
        let token: TokenResponse
        try { token = JSON.parse(res.body) }
        catch { throw new AuthError('Resposta inválida do token endpoint.', 'invalid_response') }
        this._pendingFlow = null
        return this._exchangeForMinecraftToken(token)
      }

      // Error response — inspect the OAuth error code.
      let err: TokenErrorResponse = {}
      try { err = JSON.parse(res.body) as TokenErrorResponse } catch { /* ignore */ }
      const code = err.error ?? 'unknown'

      switch (code) {
        case 'authorization_pending':
          // User hasn't finished yet — wait the polling interval and retry.
          await this._sleep(intervalMs)
          break

        case 'slow_down':
          // The server asks us to back off — increase interval and retry.
          pending.interval += 5
          await this._sleep((pending.interval) * 1_000)
          break

        case 'authorization_declined':
          this._pendingFlow = null
          throw new AuthError('Login cancelado pelo usuário.', code)

        case 'expired_token':
        case 'bad_verification_code':
          this._pendingFlow = null
          throw new AuthError('O código expirou. Tente novamente.', 'expired_token')

        default:
          this._pendingFlow = null
          throw new AuthError(
            `Falha no login: ${err.error_description ?? code}`,
            code,
          )
      }
    }

    this._pendingFlow = null
    throw new AuthError(
      'Login expirou após 15 minutos. Tente novamente.',
      'expired_token',
    )
  }

  /**
   * Renews the live.com access token using the stored refresh token, then
   * re-runs the Xbox → XSTS → Minecraft chain.
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const res = await httpPostForm(TOKEN_URL, {
      client_id:     this.clientId,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      scope:         SCOPE,
    })

    if (res.status !== 200) {
      throw new AuthError(
        `Falha ao renovar token: ${this._safeMsg(res.body)}`,
        'refresh_failed',
      )
    }

    let token: TokenResponse
    try { token = JSON.parse(res.body) }
    catch { throw new AuthError('Resposta inválida ao renovar token.', 'invalid_response') }

    return this._exchangeForMinecraftToken(token)
  }

  async storeTokens(tokens: AuthTokens): Promise<void> {
    await this.keychainService.storeTokens(tokens)
    await this._storeTokensToFile(tokens)
  }

  async loadTokens(): Promise<AuthTokens | null> {
    try {
      const fromKeychain = await this.keychainService.loadTokens()
      if (fromKeychain) {
        // If the keychain blob is missing the Minecraft profile (older format
        // or a partial save where keychain succeeded but file write failed),
        // prefer the file fallback which usually has the full profile.
        if (!fromKeychain.minecraft?.name) {
          const fromFile = await this._loadTokensFromFile()
          if (fromFile?.minecraft?.name) return fromFile
        }
        return fromKeychain
      }
    } catch {
      // Keychain unavailable / locked — fall through to file fallback.
    }
    return this._loadTokensFromFile()
  }

  // -------------------------------------------------------------------------
  // Microsoft → Xbox Live → XSTS → Minecraft chain
  // -------------------------------------------------------------------------

  private async _exchangeForMinecraftToken(liveToken: TokenResponse): Promise<AuthTokens> {
    const liveAccessToken = liveToken.access_token

    // Step 2: Xbox Live authentication.
    // For login.live.com tokens, the RpsTicket prefix is `t=` (NOT `d=` which
    // is for Azure AD tokens). Getting this wrong → HTTP 401 from Xbox.
    const xblRes = await httpPostJson('https://user.auth.xboxlive.com/user/authenticate', {
      Properties: {
        AuthMethod: 'RPS',
        SiteName:   'user.auth.xboxlive.com',
        RpsTicket:  `t=${liveAccessToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType:    'JWT',
    }, { 'x-xbl-contract-version': '1' })

    if (xblRes.status !== 200) {
      throw new AuthError(`Falha no login Xbox Live (HTTP ${xblRes.status}): ${this._safeMsg(xblRes.body)}`, 'xbl_failed')
    }
    let xbl: { Token: string; DisplayClaims: { xui: Array<{ uhs: string }> } }
    try { xbl = JSON.parse(xblRes.body) } catch {
      throw new AuthError('Resposta inválida do Xbox Live.', 'xbl_invalid_response')
    }
    const xblToken = xbl.Token
    const userhash = xbl.DisplayClaims?.xui?.[0]?.uhs ?? ''

    // Step 3: XSTS authorization.
    const xstsRes = await httpPostJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: {
        SandboxId:  'RETAIL',
        UserTokens: [xblToken],
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType:    'JWT',
    }, { 'x-xbl-contract-version': '1' })

    if (xstsRes.status === 401) {
      let detail = 'desconhecido'
      try {
        const errJson = JSON.parse(xstsRes.body) as { XErr?: number }
        const xerr = errJson.XErr
        if (xerr === 2148916233) detail = 'Sua conta Microsoft não tem perfil Xbox. Crie um em xbox.com.'
        else if (xerr === 2148916235) detail = 'Sua região não tem suporte para Xbox Live.'
        else if (xerr === 2148916236 || xerr === 2148916237) detail = 'Conta precisa de verificação de adulto.'
        else if (xerr === 2148916238) detail = 'Conta de menor de idade. Adicione a uma família via xbox.com/family.'
        else if (xerr) detail = `Erro Xbox ${xerr}`
      } catch { /* ignore */ }
      throw new AuthError(`Autorização XSTS negada: ${detail}`, 'xsts_denied')
    }
    if (xstsRes.status !== 200) {
      throw new AuthError(`Falha na autorização XSTS (HTTP ${xstsRes.status}): ${this._safeMsg(xstsRes.body)}`, 'xsts_failed')
    }
    let xsts: { Token: string }
    try { xsts = JSON.parse(xstsRes.body) } catch {
      throw new AuthError('Resposta inválida do XSTS.', 'xsts_invalid_response')
    }
    const xstsToken = xsts.Token

    // Step 4: Login to Minecraft Services.
    const mcRes = await httpPostJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
      identityToken: `XBL3.0 x=${userhash};${xstsToken}`,
    })
    if (mcRes.status !== 200) {
      throw new AuthError(`Falha no login Minecraft (HTTP ${mcRes.status}): ${this._safeMsg(mcRes.body)}`, 'minecraft_login_failed')
    }
    let mc: { access_token: string; expires_in: number }
    try { mc = JSON.parse(mcRes.body) } catch {
      throw new AuthError('Resposta inválida do Minecraft Services.', 'mc_invalid_response')
    }
    const minecraftAccessToken = mc.access_token

    // Step 5: Fetch Minecraft profile (proves the user owns Minecraft).
    const profileRes = await httpGet('https://api.minecraftservices.com/minecraft/profile', {
      Authorization: `Bearer ${minecraftAccessToken}`,
    })
    if (profileRes.status === 404) {
      throw new AuthError(
        'Esta conta Microsoft não possui Minecraft. Compre o jogo em minecraft.net.',
        'no_minecraft',
      )
    }
    if (profileRes.status !== 200) {
      throw new AuthError(`Falha ao obter perfil Minecraft (HTTP ${profileRes.status}): ${this._safeMsg(profileRes.body)}`, 'profile_failed')
    }
    let profile: MinecraftProfile
    try { profile = JSON.parse(profileRes.body) } catch {
      throw new AuthError('Resposta inválida do perfil Minecraft.', 'profile_invalid')
    }

    return {
      accessToken:           liveAccessToken,
      refreshToken:          liveToken.refresh_token,
      expiresAt:             Date.now() + (mc.expires_in ?? 86400) * 1000,
      userId:                profile.id,
      minecraftAccessToken,
      minecraft:             { id: profile.id, name: profile.name },
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** Truncate raw response bodies before surfacing them in error messages. */
  private _safeMsg(body: string): string {
    const trimmed = body.trim()
    if (!trimmed) return ''
    return trimmed.length > 240 ? trimmed.slice(0, 240) + '…' : trimmed
  }

  // -------------------------------------------------------------------------
  // File-based token storage (fallback)
  // -------------------------------------------------------------------------

  private async _storeTokensToFile(tokens: AuthTokens): Promise<void> {
    const dir = path.dirname(FALLBACK_TOKEN_FILE)
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(
      FALLBACK_TOKEN_FILE,
      JSON.stringify(tokens, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    )
  }

  private async _loadTokensFromFile(): Promise<AuthTokens | null> {
    try {
      const raw = await fs.promises.readFile(FALLBACK_TOKEN_FILE, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (!this._isValidAuthTokens(parsed)) return null
      return parsed
    } catch {
      return null
    }
  }

  private _isValidAuthTokens(value: unknown): value is AuthTokens {
    if (typeof value !== 'object' || value === null) return false
    const obj = value as Record<string, unknown>
    return (
      typeof obj['accessToken']  === 'string' &&
      typeof obj['refreshToken'] === 'string' &&
      typeof obj['expiresAt']    === 'number' &&
      typeof obj['userId']       === 'string'
    )
  }
}
