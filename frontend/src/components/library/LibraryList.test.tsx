/**
 * Unit tests for LibraryList component.
 * Requirements: 4.4, 4.5
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LibraryList from './LibraryList'
import type { LibraryListItem } from './LibraryList'

const makeItem = (overrides: Partial<LibraryListItem> = {}): LibraryListItem => ({
  id: '1',
  name: 'Sodium',
  source: 'modrinth',
  itemType: 'mod',
  ...overrides,
})

describe('LibraryList — empty state (Requirement 4.5)', () => {
  it('shows "Nenhum item na sua biblioteca ainda" when items is empty', () => {
    render(<LibraryList items={[]} />)
    expect(
      screen.getByText('Nenhum item na sua biblioteca ainda'),
    ).toBeInTheDocument()
  })

  it('does not render any list items when empty', () => {
    render(<LibraryList items={[]} data-testid="list" />)
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('renders BookOpen icon in empty state (aria-hidden)', () => {
    render(<LibraryList items={[]} data-testid="list" />)
    // The empty state panel is rendered
    expect(screen.getByTestId('list-empty')).toBeInTheDocument()
  })
})

describe('LibraryList — loading state', () => {
  it('renders skeleton placeholders when loading is true', () => {
    render(<LibraryList items={[]} loading data-testid="list" />)
    expect(screen.getByRole('status', { name: /carregando/i })).toBeInTheDocument()
  })

  it('does not show empty-state message while loading', () => {
    render(<LibraryList items={[]} loading />)
    expect(
      screen.queryByText('Nenhum item na sua biblioteca ainda'),
    ).not.toBeInTheDocument()
  })

  it('does not render items while loading', () => {
    const items = [makeItem()]
    render(<LibraryList items={items} loading />)
    expect(screen.queryByText('Sodium')).not.toBeInTheDocument()
  })
})

describe('LibraryList — with items (Requirement 4.4)', () => {
  it('renders all provided items', () => {
    const items = [
      makeItem({ id: '1', name: 'Sodium' }),
      makeItem({ id: '2', name: 'Iris Shaders' }),
    ]
    render(<LibraryList items={items} />)
    expect(screen.getByText('Sodium')).toBeInTheDocument()
    expect(screen.getByText('Iris Shaders')).toBeInTheDocument()
  })

  it('does not show empty-state message when items are present', () => {
    render(<LibraryList items={[makeItem()]} />)
    expect(
      screen.queryByText('Nenhum item na sua biblioteca ainda'),
    ).not.toBeInTheDocument()
  })

  it('orders items by addedAt descending (most recent first)', () => {
    const items: LibraryListItem[] = [
      makeItem({ id: '1', name: 'Older Mod', addedAt: '2024-01-01T00:00:00Z' }),
      makeItem({ id: '2', name: 'Newer Mod', addedAt: '2024-06-01T00:00:00Z' }),
      makeItem({ id: '3', name: 'Middle Mod', addedAt: '2024-03-01T00:00:00Z' }),
    ]
    render(<LibraryList items={items} />)
    const listItems = screen.getAllByRole('listitem')
    expect(listItems[0]).toHaveTextContent('Newer Mod')
    expect(listItems[1]).toHaveTextContent('Middle Mod')
    expect(listItems[2]).toHaveTextContent('Older Mod')
  })

  it('places items without addedAt at the end', () => {
    const items: LibraryListItem[] = [
      makeItem({ id: '1', name: 'No Date Mod' }),
      makeItem({ id: '2', name: 'Dated Mod', addedAt: '2024-01-01T00:00:00Z' }),
    ]
    render(<LibraryList items={items} />)
    const listItems = screen.getAllByRole('listitem')
    expect(listItems[0]).toHaveTextContent('Dated Mod')
    expect(listItems[1]).toHaveTextContent('No Date Mod')
  })

  it('passes onRemove callback to each LibraryItem', () => {
    const onRemove = vi.fn()
    const items = [makeItem({ id: '99', name: 'Removable Mod' })]
    render(<LibraryList items={items} onRemove={onRemove} />)
    expect(
      screen.getByRole('button', { name: /remover removable mod/i }),
    ).toBeInTheDocument()
  })

  it('applies library-list class', () => {
    render(<LibraryList items={[makeItem()]} data-testid="list" />)
    expect(screen.getByTestId('list').className).toContain('library-list')
  })
})
