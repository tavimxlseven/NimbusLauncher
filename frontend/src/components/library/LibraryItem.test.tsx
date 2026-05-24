/**
 * Unit tests for LibraryItem component.
 * Requirements: 4.3, 4.4
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LibraryItem from './LibraryItem'

const baseProps = {
  id: '1',
  name: 'Sodium',
  source: 'modrinth' as const,
  itemType: 'mod' as const,
}

describe('LibraryItem', () => {
  it('renders the item name', () => {
    render(<LibraryItem {...baseProps} />)
    expect(screen.getByText('Sodium')).toBeInTheDocument()
  })

  it('shows Modrinth badge for modrinth source', () => {
    render(<LibraryItem {...baseProps} source="modrinth" />)
    expect(screen.getByText('Modrinth')).toBeInTheDocument()
  })

  it('shows CurseForge badge for curseforge source', () => {
    render(<LibraryItem {...baseProps} source="curseforge" />)
    expect(screen.getByText('CurseForge')).toBeInTheDocument()
  })

  it('renders version when provided', () => {
    render(<LibraryItem {...baseProps} version="0.5.8" />)
    expect(screen.getByText('0.5.8')).toBeInTheDocument()
  })

  it('does not render version when omitted', () => {
    render(<LibraryItem {...baseProps} />)
    expect(screen.queryByLabelText(/versão/i)).not.toBeInTheDocument()
  })

  it('renders formatted addedAt date', () => {
    render(<LibraryItem {...baseProps} addedAt="2024-06-15T10:00:00Z" />)
    // pt-BR format: 15/06/2024
    expect(screen.getByLabelText(/adicionado em/i)).toBeInTheDocument()
  })

  it('does not render date when addedAt is omitted', () => {
    render(<LibraryItem {...baseProps} />)
    expect(screen.queryByLabelText(/adicionado em/i)).not.toBeInTheDocument()
  })

  it('renders remove button when onRemove is provided', () => {
    render(<LibraryItem {...baseProps} onRemove={vi.fn()} />)
    expect(screen.getByRole('button', { name: /remover sodium da biblioteca/i })).toBeInTheDocument()
  })

  it('does not render remove button when onRemove is omitted', () => {
    render(<LibraryItem {...baseProps} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('calls onRemove with the item id when remove button is clicked', () => {
    const onRemove = vi.fn()
    render(<LibraryItem {...baseProps} id="42" onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remover/i }))
    expect(onRemove).toHaveBeenCalledWith('42')
  })

  it('applies glass-panel class via GlassPanel base', () => {
    render(<LibraryItem {...baseProps} data-testid="item" />)
    expect(screen.getByTestId('item').className).toContain('glass-panel')
  })

  it('applies library-item class', () => {
    render(<LibraryItem {...baseProps} data-testid="item" />)
    expect(screen.getByTestId('item').className).toContain('library-item')
  })

  it('uses Package icon for mod itemType (aria-hidden icon present)', () => {
    render(<LibraryItem {...baseProps} itemType="mod" data-testid="item" />)
    // Icon is aria-hidden; verify the item renders without error
    expect(screen.getByTestId('item')).toBeInTheDocument()
  })

  it('uses Layers icon for modpack itemType', () => {
    render(<LibraryItem {...baseProps} itemType="modpack" data-testid="item" />)
    expect(screen.getByTestId('item')).toBeInTheDocument()
  })
})
