/**
 * Unit tests for useAIModpack hook.
 *
 * Requirements: 11.1, 11.6
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAIModpack } from './useAIModpack'

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const mockGenerateResponse = {
  data: {
    id: '42',
    name: 'Tech & Magic Pack',
    minecraft_version: '1.20.1',
    loader: 'fabric' as const,
    loader_version: '0.15.11',
    status: 'completed' as const,
    selected_mods: [
      { project_id: 'AANobbMI', name: 'Sodium', source: 'modrinth' as const, version_id: 'IZskON6d', justification: 'Performance' },
      { project_id: 'gvQqBUqZ', name: 'Lithium', source: 'modrinth' as const, version_id: 'abc123', justification: 'Optimization' },
      { project_id: 'H8CaAYZC', name: 'Phosphor', source: 'modrinth' as const, version_id: 'def456', justification: 'Lighting' },
    ],
    optional_mods: [
      { project_id: 'opt1', name: 'OptionalMod', source: 'curseforge' as const, version_id: 'v1' },
    ],
    kubejs_scripts: ['script1', 'script2'],
  },
}

const mockAdjustResponse = {
  data: {
    id: '42',
    name: 'Tech Pack (adjusted)',
    minecraft_version: '1.20.1',
    loader: 'fabric' as const,
    loader_version: '0.15.11',
    status: 'completed' as const,
    selected_mods: [
      { project_id: 'AANobbMI', name: 'Sodium', source: 'modrinth' as const, version_id: 'IZskON6d', justification: 'Performance' },
      { project_id: 'gvQqBUqZ', name: 'Lithium', source: 'modrinth' as const, version_id: 'abc123', justification: 'Optimization' },
    ],
    optional_mods: [],
    kubejs_scripts: [],
  },
}

/* ── Setup ───────────────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ── Tests ───────────────────────────────────────────────────────────────── */

describe('useAIModpack — initial state', () => {
  it('starts with null result, no loading, no error', () => {
    const { result } = renderHook(() => useAIModpack())
    expect(result.current.result).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

describe('useAIModpack — generate (Requirement 11.1)', () => {
  it('calls POST /api/v1/ai/generate with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.generate({
        description: 'tech + magic',
        minecraftVersion: '1.20.1',
        loader: 'fabric',
      })
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/ai/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          description: 'tech + magic',
          minecraft_version: '1.20.1',
          loader: 'fabric',
        }),
      }),
    )
  })

  it('sets result on successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    }))

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.generate({
        description: 'tech + magic',
        minecraftVersion: '1.20.1',
        loader: 'fabric',
      })
    })

    expect(result.current.result).not.toBeNull()
    expect(result.current.result?.id).toBe('42')
    expect(result.current.result?.name).toBe('Tech & Magic Pack')
    expect(result.current.result?.status).toBe('completed')
    expect(result.current.result?.mods).toHaveLength(3)
    expect(result.current.result?.optionalMods).toHaveLength(1)
    expect(result.current.result?.kubeJsScriptCount).toBe(2)
  })

  it('maps selected_mods to GeneratedMod shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    }))

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.generate({
        description: 'tech',
        minecraftVersion: '1.20.1',
        loader: 'fabric',
      })
    })

    const firstMod = result.current.result?.mods[0]
    expect(firstMod?.id).toBe('AANobbMI')
    expect(firstMod?.name).toBe('Sodium')
    expect(firstMod?.source).toBe('modrinth')
    expect(firstMod?.version).toBe('IZskON6d')
    expect(firstMod?.justification).toBe('Performance')
    expect(firstMod?.isOptional).toBe(false)
  })

  it('sets loading to false after a successful request completes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    }))

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.generate({
        description: 'tech',
        minecraftVersion: '1.20.1',
        loader: 'fabric',
      })
    })

    // After the request completes, loading must be false
    expect(result.current.loading).toBe(false)
    // And the result should be populated
    expect(result.current.result).not.toBeNull()
  })

  it('sets error on HTTP error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ errors: [{ message: 'Descrição inválida', code: 'blank' }] }),
    }))

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.generate({
        description: '',
        minecraftVersion: '1.20.1',
        loader: 'fabric',
      })
    })

    expect(result.current.error).toBe('Descrição inválida')
    expect(result.current.result?.status).toBe('failed')
  })

  it('sets error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.generate({
        description: 'tech',
        minecraftVersion: '1.20.1',
        loader: 'fabric',
      })
    })

    expect(result.current.error).toBe('Network error')
    expect(result.current.result?.status).toBe('failed')
  })

  it('clears previous error on new generate call', async () => {
    // First call fails
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.generate({ description: 'tech', minecraftVersion: '1.20.1', loader: 'fabric' })
    })

    expect(result.current.error).not.toBeNull()

    // Second call succeeds
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    }))

    await act(async () => {
      await result.current.generate({ description: 'tech', minecraftVersion: '1.20.1', loader: 'fabric' })
    })

    expect(result.current.error).toBeNull()
  })
})

describe('useAIModpack — adjust (Requirement 11.6)', () => {
  it('calls PATCH /api/v1/ai/modpacks/:id/adjust with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAdjustResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.adjust('42', 'remove magic mods')
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/ai/modpacks/42/adjust',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ instruction: 'remove magic mods' }),
      }),
    )
  })

  it('updates result on successful adjust', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAdjustResponse,
    }))

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.adjust('42', 'remove magic mods')
    })

    expect(result.current.result?.name).toBe('Tech Pack (adjusted)')
    expect(result.current.result?.mods).toHaveLength(2)
    expect(result.current.result?.status).toBe('completed')
  })

  it('is a no-op when modpackId is empty', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.adjust('', 'some instruction')
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sets error on HTTP error during adjust', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ errors: [{ message: 'Modpack não encontrado' }] }),
    }))

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.adjust('999', 'adjust')
    })

    expect(result.current.error).toBe('Modpack não encontrado')
  })
})

describe('useAIModpack — reset', () => {
  it('clears result, error and loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')))

    const { result } = renderHook(() => useAIModpack())

    await act(async () => {
      await result.current.generate({ description: 'tech', minecraftVersion: '1.20.1', loader: 'fabric' })
    })

    expect(result.current.error).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.result).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })
})
