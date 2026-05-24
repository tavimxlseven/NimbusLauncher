/**
 * ModResolver — turns a (source, externalId, version) triple into a real
 * download URL + filename + sha1 by calling the Backend_API.
 *
 * Falls back to direct Modrinth API call when the backend is unreachable
 * (CurseForge always needs the backend because the API key lives there).
 */

import { validateDownloadUrl, createSecureRequest } from '../security/SecurityValidator.js'

export interface ResolvedMod {
  downloadUrl: string
  filename:    string
  sha1?:       string
  sha512?:     string
  fileSize?:   number
}

interface ResolveOpts {
  /** Full base URL of the Backend_API (e.g. https://nimbusgg.me) */
  backendUrl:    string
  /** Bearer launcher session token (`nlsk_...`) */
  sessionToken?: string | null
  source:        'modrinth' | 'curseforge'
  externalId:    string
  /** Modrinth version_id OR CurseForge fileId */
  versionId:     string
}

export async function resolveMod(opts: ResolveOpts): Promise<ResolvedMod> {
  const { backendUrl, sessionToken, source, externalId, versionId } = opts

  const body = JSON.stringify({ source, external_id: externalId, version_id: versionId })

  const url = new URL(`${backendUrl.replace(/\/$/, '')}/api/v1/mod_files/resolve`)
  const headers: Record<string, string | number> = {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
    Accept:           'application/json',
  }
  if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`

  const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    // Use secure request with certificate validation
    // Requirements: 15.2
    const req = createSecureRequest({
      hostname: url.hostname,
      port:     url.port || 443,
      path:     url.pathname,
      method:   'POST',
      headers,
    }, (res) => {
      let chunks = ''
      res.on('data', (c: Buffer) => { chunks += c.toString() })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: chunks }))
    })
    req.on('error', reject)
    req.setTimeout(20_000, () => req.destroy(new Error('Resolve timeout')))
    req.write(body)
    req.end()
  })

  if (result.status === 401) {
    throw new Error(
      'Token de sessão inválido ou expirado. ' +
      'Por favor, faça login novamente no launcher. ' +
      '(Clique no ícone de usuário no canto superior direito)'
    )
  }

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Backend resolve failed: HTTP ${result.status} — ${result.body.slice(0, 200)}`)
  }

  const json = JSON.parse(result.body) as { data?: Record<string, unknown> }
  const data = json.data ?? {}

  const downloadUrl = String(data['download_url'] ?? '')
  
  // Validate download URL uses HTTPS and points to trusted domain
  // Requirements: 15.1, 15.3
  if (downloadUrl) {
    const validation = validateDownloadUrl(downloadUrl)
    if (!validation.valid) {
      throw new Error(`Invalid download URL from backend: ${validation.error}`)
    }
  }

  return {
    downloadUrl,
    filename:    String(data['filename'] ?? `${externalId}-${versionId}.jar`),
    sha1:        data['sha1'] as string | undefined,
    sha512:      data['sha512'] as string | undefined,
    fileSize:    data['file_size'] as number | undefined,
  }
}
