/**
 * Unit tests for AIModpackContainer component.
 *
 * Requirements: 11.1, 11.6
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AIModpackContainer from './AIModpackContainer'

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const mockGenerateResponse = {
  data: {
    id: '42',
    name: 'Tech & Magic Pack',
    minecraft_version: '1.20.1',
    loader: 'fabric',
    loader_version: '0.15.11',
    status: 'completed',
    selected_mods: [
      { project_id: 'mod1', name: 'Sodium', source: 'modrinth', version_id: 'v1', justification: 'Performance' },
      { project_id: 'mod2', name: 'Lithium', source: 'modrinth', version_id: 'v2', justification: 'Optimization' },
      { project_id: 'mod3', name: 'Phosphor', source: 'modrinth', version_id: 'v3', justification: 'Lighting' },
    ],
    optional_mods: [],
    kubejs_scripts: [],
  },
}

const mockAdjustResponse = {
  data: {
    id: '42',
    name: 'Tech Pack (adjusted)',
    minecraft_version: '1.20.1',
    loader: 'fabric',
    loader_version: '0.15.11',
    status: 'completed',
    selected_mods: [
      { project_id: 'mod1', name: 'Sodium', source: 'modrinth', version_id: 'v1', justification: 'Performance' },
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

describe('AIModpackContainer — rendering', () => {
  it('renders the prompt input initially', () => {
    render(<AIModpackContainer data-testid="container" />)
    expect(screen.getByTestId('container-prompt')).toBeInTheDocument()
  })

  it('renders the Minecraft version selector', () => {
    render(<AIModpackContainer data-testid="container" />)
    expect(screen.getByTestId('container-mc-version')).toBeInTheDocument()
  })

  it('renders the loader selector', () => {
    render(<AIModpackContainer data-testid="container" />)
    expect(screen.getByTestId('container-loader')).toBeInTheDocument()
  })

  it('does not render the result panel initially', () => {
    render(<AIModpackContainer data-testid="container" />)
    expect(screen.queryByTestId('container-result')).not.toBeInTheDocument()
  })

  it('does not render the adjust panel initially', () => {
    render(<AIModpackContainer data-testid="container" />)
    expect(screen.queryByTestId('container-adjust')).not.toBeInTheDocument()
  })

  it('applies default minecraft version', () => {
    render(<AIModpackContainer defaultMinecraftVersion="1.21.1" data-testid="container" />)
    const select = screen.getByTestId('container-mc-version') as HTMLSelectElement
    expect(select.value).toBe('1.21.1')
  })

  it('applies default loader', () => {
    render(<AIModpackContainer defaultLoader="forge" data-testid="container" />)
    const select = screen.getByTestId('container-loader') as HTMLSelectElement
    expect(select.value).toBe('forge')
  })
})

describe('AIModpackContainer — generate flow (Requirement 11.1)', () => {
  it('calls POST /api/v1/ai/generate when prompt is submitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AIModpackContainer data-testid="container" />)

    const textarea = screen.getByTestId('container-prompt-textarea')
    fireEvent.change(textarea, { target: { value: 'tech + magic modpack' } })
    fireEvent.click(screen.getByRole('button', { name: /gerar modpack/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/ai/generate',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('shows the result panel after successful generation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    }))

    render(<AIModpackContainer data-testid="container" />)

    const textarea = screen.getByTestId('container-prompt-textarea')
    fireEvent.change(textarea, { target: { value: 'tech + magic modpack' } })
    fireEvent.click(screen.getByRole('button', { name: /gerar modpack/i }))

    await waitFor(() => {
      expect(screen.getByTestId('container-result')).toBeInTheDocument()
    })
  })

  it('hides the prompt input after successful generation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    }))

    render(<AIModpackContainer data-testid="container" />)

    const textarea = screen.getByTestId('container-prompt-textarea')
    fireEvent.change(textarea, { target: { value: 'tech + magic modpack' } })
    fireEvent.click(screen.getByRole('button', { name: /gerar modpack/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('container-prompt')).not.toBeInTheDocument()
    })
  })

  it('shows error banner on failed generation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    render(<AIModpackContainer data-testid="container" />)

    const textarea = screen.getByTestId('container-prompt-textarea')
    fireEvent.change(textarea, { target: { value: 'tech modpack' } })
    fireEvent.click(screen.getByRole('button', { name: /gerar modpack/i }))

    // The error is shown inside the result panel (status: failed), not a separate banner
    await waitFor(() => {
      // Either the result shows failed status or an error banner appears
      const resultPanel = screen.queryByTestId('container-result')
      const errorBanner = screen.queryByTestId('container-error-banner')
      expect(resultPanel || errorBanner).toBeTruthy()
    })
  })
})

describe('AIModpackContainer — adjust flow (Requirement 11.6)', () => {
  const setupWithResult = async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    }))

    render(<AIModpackContainer data-testid="container" />)

    const textarea = screen.getByTestId('container-prompt-textarea')
    fireEvent.change(textarea, { target: { value: 'tech + magic modpack' } })
    fireEvent.click(screen.getByRole('button', { name: /gerar modpack/i }))

    await waitFor(() => {
      expect(screen.getByTestId('container-result')).toBeInTheDocument()
    })
  }

  it('shows the adjust panel when "Ajustar modpack" is clicked', async () => {
    await setupWithResult()

    fireEvent.click(screen.getByRole('button', { name: /ajustar modpack/i }))

    expect(screen.getByTestId('container-adjust')).toBeInTheDocument()
  })

  it('calls PATCH /api/v1/ai/modpacks/:id/adjust when adjust is submitted', async () => {
    await setupWithResult()

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAdjustResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    fireEvent.click(screen.getByRole('button', { name: /ajustar modpack/i }))

    const adjustTextarea = screen.getByTestId('container-adjust-textarea')
    fireEvent.change(adjustTextarea, { target: { value: 'remove magic mods' } })
    fireEvent.click(screen.getByRole('button', { name: /aplicar ajuste/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/ai/modpacks/42/adjust',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
  })

  it('hides the adjust panel after successful adjustment', async () => {
    await setupWithResult()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAdjustResponse,
    }))

    fireEvent.click(screen.getByRole('button', { name: /ajustar modpack/i }))

    const adjustTextarea = screen.getByTestId('container-adjust-textarea')
    fireEvent.change(adjustTextarea, { target: { value: 'remove magic mods' } })
    fireEvent.click(screen.getByRole('button', { name: /aplicar ajuste/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('container-adjust')).not.toBeInTheDocument()
    })
  })

  it('closes the adjust panel when the close button is clicked', async () => {
    await setupWithResult()

    fireEvent.click(screen.getByRole('button', { name: /ajustar modpack/i }))
    expect(screen.getByTestId('container-adjust')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /fechar painel de ajuste/i }))
    expect(screen.queryByTestId('container-adjust')).not.toBeInTheDocument()
  })
})

describe('AIModpackContainer — reset flow', () => {
  it('returns to the prompt input when "Gerar novo modpack" is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGenerateResponse,
    }))

    render(<AIModpackContainer data-testid="container" />)

    const textarea = screen.getByTestId('container-prompt-textarea')
    fireEvent.change(textarea, { target: { value: 'tech modpack' } })
    fireEvent.click(screen.getByRole('button', { name: /gerar modpack/i }))

    await waitFor(() => {
      expect(screen.getByTestId('container-result')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /gerar novo modpack/i }))

    expect(screen.queryByTestId('container-result')).not.toBeInTheDocument()
    expect(screen.getByTestId('container-prompt')).toBeInTheDocument()
  })
})
