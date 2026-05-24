/**
 * Unit tests for ModGrid component.
 * Requirements: 1.3, 1.7, 1.8
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ModGrid from './ModGrid'
import type { ModGridProps } from './ModGrid'
import type { ModCardProps } from './ModCard'

const makeItem = (id: string, name: string): ModCardProps => ({
  id,
  name,
  source: 'modrinth',
})

const baseProps: ModGridProps = {
  items: [],
  page: 1,
  totalPages: 1,
  onPageChange: vi.fn(),
}

describe('ModGrid — empty state (Requirement 1.7)', () => {
  it('shows default empty message when items is empty and not loading', () => {
    render(<ModGrid {...baseProps} />)
    expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument()
  })

  it('shows custom emptyMessage when provided', () => {
    render(
      <ModGrid
        {...baseProps}
        emptyMessage='Nenhum resultado encontrado para "magia"'
      />,
    )
    expect(
      screen.getByText('Nenhum resultado encontrado para "magia"'),
    ).toBeInTheDocument()
  })

  it('does not show empty message while loading', () => {
    render(<ModGrid {...baseProps} loading />)
    expect(
      screen.queryByText('Nenhum resultado encontrado'),
    ).not.toBeInTheDocument()
  })
})

describe('ModGrid — loading state', () => {
  it('renders skeleton cards while loading', () => {
    render(<ModGrid {...baseProps} loading />)
    const skeletons = screen.getAllByTestId('mod-card-skeleton')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('marks the grid as aria-busy while loading', () => {
    render(<ModGrid {...baseProps} loading />)
    // The loading container has aria-busy="true"
    const busyEl = document.querySelector('[aria-busy="true"]')
    expect(busyEl).not.toBeNull()
  })

  it('does not render item cards while loading', () => {
    const items = [makeItem('1', 'Sodium')]
    render(<ModGrid {...baseProps} items={items} loading />)
    expect(screen.queryByText('Sodium')).not.toBeInTheDocument()
  })
})

describe('ModGrid — with items', () => {
  it('renders all provided items', () => {
    const items = [makeItem('1', 'Sodium'), makeItem('2', 'Iris Shaders')]
    render(<ModGrid {...baseProps} items={items} />)
    expect(screen.getByText('Sodium')).toBeInTheDocument()
    expect(screen.getByText('Iris Shaders')).toBeInTheDocument()
  })

  it('renders items in a list role', () => {
    const items = [makeItem('1', 'Sodium')]
    render(<ModGrid {...baseProps} items={items} />)
    expect(screen.getByRole('list', { name: /mod list/i })).toBeInTheDocument()
  })

  it('does not show empty message when items are present', () => {
    const items = [makeItem('1', 'Sodium')]
    render(<ModGrid {...baseProps} items={items} />)
    expect(
      screen.queryByText('Nenhum resultado encontrado'),
    ).not.toBeInTheDocument()
  })

  it('applies mod-grid class', () => {
    render(<ModGrid {...baseProps} data-testid="grid" />)
    expect(screen.getByTestId('grid').className).toContain('mod-grid')
  })
})

describe('ModGrid — pagination (Requirement 1.8)', () => {
  it('does not render pagination when totalPages is 1', () => {
    const items = [makeItem('1', 'Sodium')]
    render(<ModGrid {...baseProps} items={items} totalPages={1} />)
    expect(screen.queryByTestId('mod-grid-pagination')).not.toBeInTheDocument()
  })

  it('renders pagination when totalPages > 1', () => {
    const items = [makeItem('1', 'Sodium')]
    render(<ModGrid {...baseProps} items={items} totalPages={3} />)
    expect(screen.getByTestId('mod-grid-pagination')).toBeInTheDocument()
  })

  it('calls onPageChange with next page when Next is clicked', () => {
    const onPageChange = vi.fn()
    const items = [makeItem('1', 'Sodium')]
    render(
      <ModGrid
        {...baseProps}
        items={items}
        page={1}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    )
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange with previous page when Previous is clicked', () => {
    const onPageChange = vi.fn()
    const items = [makeItem('1', 'Sodium')]
    render(
      <ModGrid
        {...baseProps}
        items={items}
        page={2}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    )
    fireEvent.click(screen.getByLabelText('Previous page'))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('disables Previous button on first page', () => {
    const items = [makeItem('1', 'Sodium')]
    render(<ModGrid {...baseProps} items={items} page={1} totalPages={3} />)
    expect(screen.getByLabelText('Previous page')).toBeDisabled()
  })

  it('disables Next button on last page', () => {
    const items = [makeItem('1', 'Sodium')]
    render(<ModGrid {...baseProps} items={items} page={3} totalPages={3} />)
    expect(screen.getByLabelText('Next page')).toBeDisabled()
  })

  it('marks the current page button with aria-current="page"', () => {
    const items = [makeItem('1', 'Sodium')]
    render(<ModGrid {...baseProps} items={items} page={2} totalPages={3} />)
    expect(screen.getByLabelText('Page 2')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('calls onPageChange when a page number button is clicked', () => {
    const onPageChange = vi.fn()
    const items = [makeItem('1', 'Sodium')]
    render(
      <ModGrid
        {...baseProps}
        items={items}
        page={1}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    )
    fireEvent.click(screen.getByLabelText('Page 3'))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })
})
