/**
 * Unit tests for ModFilters component.
 *
 * Requirements: 1.3
 *
 * Covers:
 *  - Filters update results without page reload (no window.location change)
 *  - onChange is called on every filter change with the updated filter object
 *  - All four filter fields (source, gameVersion, loader, category) work correctly
 *  - Default filter values are exported and correct
 *  - Component renders all filter controls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModFilters, { DEFAULT_FILTERS, type ModFiltersValue } from './ModFilters'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderFilters(
  overrides: Partial<ModFiltersValue> = {},
  onChange = vi.fn(),
) {
  const filters: ModFiltersValue = { ...DEFAULT_FILTERS, ...overrides }
  return {
    onChange,
    ...render(
      <ModFilters filters={filters} onChange={onChange} data-testid="mod-filters" />,
    ),
  }
}

// ── No page reload (Requirement 1.3) ──────────────────────────────────────────

describe('ModFilters — no page reload on filter change (Requirement 1.3)', () => {
  let originalHref: string

  beforeEach(() => {
    originalHref = window.location.href
  })

  it('does not change window.location.href when source filter changes', async () => {
    const user = userEvent.setup()
    renderFilters()
    const select = screen.getByLabelText('Filtrar por fonte')
    await user.selectOptions(select, 'curseforge')
    expect(window.location.href).toBe(originalHref)
  })

  it('does not change window.location.href when game version changes', async () => {
    const user = userEvent.setup()
    renderFilters()
    const input = screen.getByLabelText('Filtrar por versão do Minecraft')
    await user.type(input, '1.20.1')
    expect(window.location.href).toBe(originalHref)
  })

  it('does not change window.location.href when loader filter changes', async () => {
    const user = userEvent.setup()
    renderFilters()
    const select = screen.getByLabelText('Filtrar por loader')
    await user.selectOptions(select, 'fabric')
    expect(window.location.href).toBe(originalHref)
  })

  it('does not change window.location.href when category changes', async () => {
    const user = userEvent.setup()
    renderFilters()
    const input = screen.getByLabelText('Filtrar por categoria')
    await user.type(input, 'tecnologia')
    expect(window.location.href).toBe(originalHref)
  })
})

// ── onChange called on every change (Requirement 1.3) ─────────────────────────

describe('ModFilters — onChange called on every filter change (Requirement 1.3)', () => {
  it('calls onChange when source is changed to "curseforge"', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters()
    const select = screen.getByLabelText('Filtrar por fonte')
    await user.selectOptions(select, 'curseforge')
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'curseforge' }),
    )
  })

  it('calls onChange when source is changed to "modrinth"', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters()
    const select = screen.getByLabelText('Filtrar por fonte')
    await user.selectOptions(select, 'modrinth')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'modrinth' }),
    )
  })

  it('calls onChange when game version is typed', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters()
    const input = screen.getByLabelText('Filtrar por versão do Minecraft')
    await user.type(input, '1')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ gameVersion: '1' }),
    )
  })

  it('calls onChange when loader is changed to "fabric"', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters()
    const select = screen.getByLabelText('Filtrar por loader')
    await user.selectOptions(select, 'fabric')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ loader: 'fabric' }),
    )
  })

  it('calls onChange when loader is changed to "forge"', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters()
    const select = screen.getByLabelText('Filtrar por loader')
    await user.selectOptions(select, 'forge')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ loader: 'forge' }),
    )
  })

  it('calls onChange when category is typed', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters()
    const input = screen.getByLabelText('Filtrar por categoria')
    await user.type(input, 'm')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'm' }),
    )
  })

  it('preserves other filter values when one filter changes', async () => {
    const user = userEvent.setup()
    const { onChange } = renderFilters({ gameVersion: '1.20.1', loader: 'fabric' })
    const select = screen.getByLabelText('Filtrar por fonte')
    await user.selectOptions(select, 'curseforge')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'curseforge',
        gameVersion: '1.20.1',
        loader: 'fabric',
      }),
    )
  })
})

// ── Default filter values ─────────────────────────────────────────────────────

describe('ModFilters — DEFAULT_FILTERS', () => {
  it('has source: "both" by default', () => {
    expect(DEFAULT_FILTERS.source).toBe('both')
  })

  it('has empty gameVersion by default', () => {
    expect(DEFAULT_FILTERS.gameVersion).toBe('')
  })

  it('has loader: "any" by default', () => {
    expect(DEFAULT_FILTERS.loader).toBe('any')
  })

  it('has empty category by default', () => {
    expect(DEFAULT_FILTERS.category).toBe('')
  })
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('ModFilters — rendering', () => {
  it('renders the source select with all options', () => {
    renderFilters()
    const select = screen.getByLabelText('Filtrar por fonte')
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'CurseForge + Modrinth' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'CurseForge' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Modrinth' })).toBeInTheDocument()
  })

  it('renders the game version input', () => {
    renderFilters()
    expect(screen.getByLabelText('Filtrar por versão do Minecraft')).toBeInTheDocument()
  })

  it('renders the loader select with all options', () => {
    renderFilters()
    const select = screen.getByLabelText('Filtrar por loader')
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Qualquer' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Forge' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fabric' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Quilt' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'NeoForge' })).toBeInTheDocument()
  })

  it('renders the category input', () => {
    renderFilters()
    expect(screen.getByLabelText('Filtrar por categoria')).toBeInTheDocument()
  })

  it('reflects the current filter values in the controls', () => {
    renderFilters({ source: 'modrinth', gameVersion: '1.21', loader: 'quilt', category: 'magia' })
    expect(screen.getByLabelText<HTMLSelectElement>('Filtrar por fonte').value).toBe('modrinth')
    expect(screen.getByLabelText<HTMLInputElement>('Filtrar por versão do Minecraft').value).toBe('1.21')
    expect(screen.getByLabelText<HTMLSelectElement>('Filtrar por loader').value).toBe('quilt')
    expect(screen.getByLabelText<HTMLInputElement>('Filtrar por categoria').value).toBe('magia')
  })

  it('renders with data-testid', () => {
    renderFilters()
    expect(screen.getByTestId('mod-filters')).toBeInTheDocument()
  })

  it('renders the filter group with accessible label', () => {
    renderFilters()
    expect(screen.getByRole('group', { name: 'Filtros de busca' })).toBeInTheDocument()
  })
})
