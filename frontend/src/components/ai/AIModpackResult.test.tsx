/**
 * Unit tests for AIModpackResult component.
 *
 * Requirements: 11.1, 11.5
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AIModpackResult from './AIModpackResult'
import type { AIModpackResultData } from './AIModpackResult'

const baseMod = {
  id: 'sodium',
  name: 'Sodium',
  source: 'modrinth' as const,
  version: '0.5.8',
  justification: 'Melhora o desempenho de renderização',
}

const baseResult: AIModpackResultData = {
  id: 'pack-1',
  name: 'Tech & Magic Pack',
  minecraftVersion: '1.20.1',
  loader: 'fabric',
  status: 'completed',
  mods: [baseMod],
}

describe('AIModpackResult — rendering', () => {
  it('renders the modpack name', () => {
    render(<AIModpackResult result={baseResult} />)
    expect(screen.getByText('Tech & Magic Pack')).toBeInTheDocument()
  })

  it('renders the Minecraft version', () => {
    render(<AIModpackResult result={baseResult} />)
    expect(screen.getByText(/1\.20\.1/)).toBeInTheDocument()
  })

  it('renders the loader', () => {
    render(<AIModpackResult result={baseResult} />)
    expect(screen.getByText(/fabric/)).toBeInTheDocument()
  })

  it('renders loader version when provided', () => {
    render(<AIModpackResult result={{ ...baseResult, loaderVersion: '0.15.11' }} />)
    expect(screen.getByText(/0\.15\.11/)).toBeInTheDocument()
  })

  it('applies ai-modpack-result class', () => {
    render(<AIModpackResult result={baseResult} data-testid="result" />)
    expect(screen.getByTestId('result').className).toContain('ai-modpack-result')
  })

  it('merges extra className', () => {
    render(<AIModpackResult result={baseResult} className="extra" data-testid="result" />)
    expect(screen.getByTestId('result').className).toContain('extra')
  })
})

describe('AIModpackResult — status badge', () => {
  it('shows "Concluído" badge for completed status', () => {
    render(<AIModpackResult result={{ ...baseResult, status: 'completed' }} />)
    expect(screen.getByLabelText(/status: concluído/i)).toBeInTheDocument()
  })

  it('shows "Gerando…" badge for generating status', () => {
    render(<AIModpackResult result={{ ...baseResult, status: 'generating' }} />)
    expect(screen.getByLabelText(/status: gerando/i)).toBeInTheDocument()
  })

  it('shows "Falhou" badge for failed status', () => {
    render(<AIModpackResult result={{ ...baseResult, status: 'failed' }} />)
    expect(screen.getByLabelText(/status: falhou/i)).toBeInTheDocument()
  })
})

describe('AIModpackResult — mod list (Requirement 11.5)', () => {
  it('renders the mod name', () => {
    render(<AIModpackResult result={baseResult} data-testid="result" />)
    expect(screen.getByText('Sodium')).toBeInTheDocument()
  })

  it('renders the mod justification', () => {
    render(<AIModpackResult result={baseResult} data-testid="result" />)
    expect(screen.getByText('Melhora o desempenho de renderização')).toBeInTheDocument()
  })

  it('renders the mod version', () => {
    render(<AIModpackResult result={baseResult} data-testid="result" />)
    expect(screen.getByText('0.5.8')).toBeInTheDocument()
  })

  it('renders the mods section with correct count', () => {
    const result: AIModpackResultData = {
      ...baseResult,
      mods: [
        { id: 'm1', name: 'Mod A', source: 'modrinth', version: '1.0' },
        { id: 'm2', name: 'Mod B', source: 'curseforge', version: '2.0' },
        { id: 'm3', name: 'Mod C', source: 'modrinth', version: '3.0' },
      ],
    }
    render(<AIModpackResult result={result} data-testid="result" />)
    expect(screen.getByText(/mods selecionados \(3\)/i)).toBeInTheDocument()
  })

  it('does not render mods section when mods list is empty', () => {
    render(<AIModpackResult result={{ ...baseResult, mods: [] }} data-testid="result" />)
    expect(screen.queryByTestId('result-mods')).not.toBeInTheDocument()
  })

  it('does not render optional mods when not provided', () => {
    render(<AIModpackResult result={baseResult} data-testid="result" />)
    expect(screen.queryByTestId('result-optional-mods')).not.toBeInTheDocument()
  })

  it('renders optional mods section when provided', () => {
    const result: AIModpackResultData = {
      ...baseResult,
      optionalMods: [
        { id: 'opt1', name: 'Optional Mod', source: 'modrinth', version: '1.0', isOptional: true },
      ],
    }
    render(<AIModpackResult result={result} data-testid="result" />)
    expect(screen.getByTestId('result-optional-mods')).toBeInTheDocument()
    expect(screen.getByText('Optional Mod')).toBeInTheDocument()
  })

  it('renders at most 10 optional mods (Requirement 11.8)', () => {
    const optionalMods = Array.from({ length: 12 }, (_, i) => ({
      id: `opt${i}`,
      name: `Optional ${i}`,
      source: 'modrinth' as const,
      version: '1.0',
      isOptional: true,
    }))
    render(
      <AIModpackResult result={{ ...baseResult, optionalMods }} data-testid="result" />,
    )
    const list = screen.getByTestId('result-optional-mods')
    expect(list.querySelectorAll('li')).toHaveLength(10)
  })

  it('excludes optional mods from the required mods count', () => {
    const result: AIModpackResultData = {
      ...baseResult,
      mods: [
        { id: 'm1', name: 'Required', source: 'modrinth', version: '1.0', isOptional: false },
        { id: 'm2', name: 'Optional', source: 'modrinth', version: '1.0', isOptional: true },
      ],
    }
    render(<AIModpackResult result={result} data-testid="result" />)
    // Only 1 required mod should appear in the required section
    expect(screen.getByText(/mods selecionados \(1\)/i)).toBeInTheDocument()
  })
})

describe('AIModpackResult — KubeJS scripts', () => {
  it('renders KubeJS script count when provided', () => {
    render(
      <AIModpackResult result={{ ...baseResult, kubeJsScriptCount: 3 }} data-testid="result" />,
    )
    expect(screen.getByTestId('result-kubejs')).toHaveTextContent('3 scripts KubeJS gerados')
  })

  it('renders singular form for 1 script', () => {
    render(
      <AIModpackResult result={{ ...baseResult, kubeJsScriptCount: 1 }} data-testid="result" />,
    )
    expect(screen.getByTestId('result-kubejs')).toHaveTextContent('1 script KubeJS gerado')
  })

  it('does not render KubeJS section when count is 0', () => {
    render(
      <AIModpackResult result={{ ...baseResult, kubeJsScriptCount: 0 }} data-testid="result" />,
    )
    expect(screen.queryByTestId('result-kubejs')).not.toBeInTheDocument()
  })

  it('does not render KubeJS section when count is undefined', () => {
    render(<AIModpackResult result={baseResult} data-testid="result" />)
    expect(screen.queryByTestId('result-kubejs')).not.toBeInTheDocument()
  })
})

describe('AIModpackResult — error / conflict display', () => {
  it('renders error message when status is failed', () => {
    render(
      <AIModpackResult
        result={{
          ...baseResult,
          status: 'failed',
          errorMessage: 'Mods incompatíveis encontrados',
        }}
        data-testid="result"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Mods incompatíveis encontrados')
  })

  it('renders conflicting mods list when provided', () => {
    render(
      <AIModpackResult
        result={{
          ...baseResult,
          status: 'failed',
          conflictingMods: ['Mod A', 'Mod B'],
        }}
        data-testid="result"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Mod A')
    expect(screen.getByRole('alert')).toHaveTextContent('Mod B')
  })

  it('does not render error section when status is completed', () => {
    render(<AIModpackResult result={baseResult} data-testid="result" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('AIModpackResult — adjust button', () => {
  it('renders adjust button when status is completed and onAdjust is provided', () => {
    render(<AIModpackResult result={baseResult} onAdjust={vi.fn()} data-testid="result" />)
    expect(screen.getByTestId('result-adjust-btn')).toBeInTheDocument()
  })

  it('does not render adjust button when status is generating', () => {
    render(
      <AIModpackResult
        result={{ ...baseResult, status: 'generating' }}
        onAdjust={vi.fn()}
        data-testid="result"
      />,
    )
    expect(screen.queryByTestId('result-adjust-btn')).not.toBeInTheDocument()
  })

  it('does not render adjust button when onAdjust is not provided', () => {
    render(<AIModpackResult result={baseResult} data-testid="result" />)
    expect(screen.queryByTestId('result-adjust-btn')).not.toBeInTheDocument()
  })

  it('calls onAdjust with the modpack id when clicked', () => {
    const onAdjust = vi.fn()
    render(<AIModpackResult result={baseResult} onAdjust={onAdjust} data-testid="result" />)
    fireEvent.click(screen.getByTestId('result-adjust-btn'))
    expect(onAdjust).toHaveBeenCalledWith('pack-1')
  })
})
