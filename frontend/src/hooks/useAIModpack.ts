/**
 * useAIModpack — React hook that manages the AI modpack generation flow.
 *
 * Wires together:
 *  - POST /api/v1/ai/generate  (Requirement 11.1)
 *  - PATCH /api/v1/ai/modpacks/:id/adjust  (Requirement 11.6)
 *
 * Manages loading states, errors, and the generation result so that
 * AIModpackContainer (and any other consumer) can remain purely presentational.
 *
 * Requirements: 11.1, 11.6
 */

import { useState, useCallback } from 'react'
import type { AIModpackResultData, GeneratedMod } from '../components/ai/AIModpackResult'

/* ── API endpoint constants ──────────────────────────────────────────────── */

const AI_GENERATE_ENDPOINT = '/api/v1/ai/generate'
const AI_ADJUST_ENDPOINT = (id: string) => `/api/v1/ai/modpacks/${id}/adjust`

/* ── Types ───────────────────────────────────────────────────────────────── */

/** Parameters required to generate a new modpack. */
export interface GenerateParams {
  description: string
  minecraftVersion: string
  loader: 'forge' | 'fabric' | 'quilt' | 'neoforge'
}

/** Shape of the raw API response data from POST /api/v1/ai/generate */
interface RawGenerationData {
  id: string | number
  name: string
  minecraft_version: string
  loader: 'forge' | 'fabric' | 'quilt' | 'neoforge'
  loader_version?: string
  status: 'generating' | 'completed' | 'failed'
  selected_mods?: RawMod[]
  optional_mods?: RawMod[]
  kubejs_scripts?: unknown[]
  report?: unknown
}

interface RawMod {
  project_id?: string
  name?: string
  source?: 'curseforge' | 'modrinth'
  version_id?: string
  justification?: string
}

/** Return value of the hook. */
export interface UseAIModpackReturn {
  /** The current generation result, or null if nothing has been generated yet. */
  result: AIModpackResultData | null
  /** True while a generate or adjust request is in flight. */
  loading: boolean
  /** Error message from the last failed request, or null. */
  error: string | null
  /**
   * Generates a new modpack from a natural-language description.
   * Calls POST /api/v1/ai/generate.
   */
  generate: (params: GenerateParams) => Promise<void>
  /**
   * Adjusts the current modpack with a natural-language instruction.
   * Calls PATCH /api/v1/ai/modpacks/:id/adjust.
   * No-op if there is no current result.
   */
  adjust: (modpackId: string, instruction: string) => Promise<void>
  /** Clears the current result and error, returning to the initial state. */
  reset: () => void
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * Reads the CSRF token from the meta tag injected by Rails.
 * Returns an empty string when running outside a Rails context (e.g. tests).
 */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
  return meta?.content ?? ''
}

/**
 * Maps a raw mod object from the API response to the GeneratedMod shape
 * expected by AIModpackResult.
 */
function mapMod(raw: RawMod, index: number, isOptional = false): GeneratedMod {
  return {
    id: raw.project_id ?? `mod-${index}`,
    name: raw.name ?? 'Unknown mod',
    source: raw.source ?? 'modrinth',
    version: raw.version_id ?? '',
    justification: raw.justification,
    isOptional,
  }
}

/**
 * Converts the raw API response data into the AIModpackResultData shape.
 */
function mapResponseToResult(data: RawGenerationData): AIModpackResultData {
  const selectedMods = (data.selected_mods ?? []).map((m, i) => mapMod(m, i, false))
  const optionalMods = (data.optional_mods ?? []).map((m, i) => mapMod(m, i, true))
  const kubeJsScriptCount = Array.isArray(data.kubejs_scripts) ? data.kubejs_scripts.length : 0

  return {
    id: String(data.id),
    name: data.name,
    minecraftVersion: data.minecraft_version,
    loader: data.loader,
    loaderVersion: data.loader_version,
    status: data.status,
    mods: selectedMods,
    optionalMods,
    kubeJsScriptCount,
  }
}

/**
 * Extracts a human-readable error message from an API error response.
 * Falls back to a generic message when the response body cannot be parsed.
 */
async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      errors?: Array<{ message?: string; code?: string }>
    }
    const firstError = body.errors?.[0]
    if (firstError?.message) return firstError.message
  } catch {
    // Response body is not JSON — fall through to generic message
  }

  switch (response.status) {
    case 401:
      return 'Você precisa estar autenticado para usar o assistente de IA.'
    case 422:
      return 'Dados inválidos. Verifique a descrição e tente novamente.'
    case 429:
      return 'Muitas requisições. Aguarde um momento e tente novamente.'
    case 503:
      return 'Serviço temporariamente indisponível. Tente novamente em breve.'
    default:
      return `Erro inesperado (HTTP ${response.status}). Tente novamente.`
  }
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

/**
 * useAIModpack
 *
 * Manages the full AI modpack generation and adjustment flow.
 *
 * @example
 * ```tsx
 * const { result, loading, error, generate, adjust, reset } = useAIModpack()
 *
 * // Generate
 * await generate({ description: 'tech + magic', minecraftVersion: '1.20.1', loader: 'fabric' })
 *
 * // Adjust
 * if (result) await adjust(result.id, 'remove magic mods')
 * ```
 *
 * Requirements: 11.1, 11.6
 */
export function useAIModpack(): UseAIModpackReturn {
  const [result, setResult] = useState<AIModpackResultData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── generate ─────────────────────────────────────────────────────────────

  const generate = useCallback(async (params: GenerateParams): Promise<void> => {
    setLoading(true)
    setError(null)

    // Optimistically show a "generating" placeholder while the request is in flight.
    setResult({
      id: '',
      name: 'Gerando modpack…',
      minecraftVersion: params.minecraftVersion,
      loader: params.loader,
      status: 'generating',
      mods: [],
    })

    try {
      const response = await fetch(AI_GENERATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({
          description: params.description,
          minecraft_version: params.minecraftVersion,
          loader: params.loader,
        }),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        setError(message)
        setResult((prev) =>
          prev ? { ...prev, status: 'failed', errorMessage: message } : null,
        )
        return
      }

      const body = (await response.json()) as { data: RawGenerationData }
      setResult(mapResponseToResult(body.data))
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro de rede. Verifique sua conexão e tente novamente.'
      setError(message)
      setResult((prev) =>
        prev ? { ...prev, status: 'failed', errorMessage: message } : null,
      )
    } finally {
      setLoading(false)
    }
  }, [])

  // ── adjust ────────────────────────────────────────────────────────────────

  const adjust = useCallback(async (modpackId: string, instruction: string): Promise<void> => {
    if (!modpackId) return

    setLoading(true)
    setError(null)

    // Keep the current result visible but mark it as "generating" during the request.
    setResult((prev) => (prev ? { ...prev, status: 'generating' } : null))

    try {
      const response = await fetch(AI_ADJUST_ENDPOINT(modpackId), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ instruction }),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        setError(message)
        setResult((prev) =>
          prev ? { ...prev, status: 'failed', errorMessage: message } : null,
        )
        return
      }

      const body = (await response.json()) as { data: RawGenerationData }
      setResult(mapResponseToResult(body.data))
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro de rede. Verifique sua conexão e tente novamente.'
      setError(message)
      setResult((prev) =>
        prev ? { ...prev, status: 'failed', errorMessage: message } : null,
      )
    } finally {
      setLoading(false)
    }
  }, [])

  // ── reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setLoading(false)
  }, [])

  return { result, loading, error, generate, adjust, reset }
}

export default useAIModpack
