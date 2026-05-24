/**
 * Unit tests for ModCard component.
 * Requirements: 1.3, 1.4, 1.5
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ModCard from './ModCard'
import type { ModCardProps } from './ModCard'

const baseProps: ModCardProps = {
  id: 'sodium',
  name: 'Sodium',
  source: 'modrinth',
}

describe('ModCard — rendering', () => {
  it('renders the mod name', () => {
    render(<ModCard {...baseProps} />)
    expect(screen.getByText('Sodium')).toBeInTheDocument()
  })

  it('renders the source badge', () => {
    render(<ModCard {...baseProps} />)
    expect(screen.getByLabelText('Source: modrinth')).toBeInTheDocument()
  })

  it('applies mod-card class', () => {
    render(<ModCard {...baseProps} data-testid="card" />)
    expect(screen.getByTestId('card').className).toContain('mod-card')
  })

  it('uses data-testid prop when provided', () => {
    render(<ModCard {...baseProps} data-testid="my-card" />)
    expect(screen.getByTestId('my-card')).toBeInTheDocument()
  })

  it('falls back to mod-card-{id} testid when not provided', () => {
    render(<ModCard {...baseProps} />)
    expect(screen.getByTestId('mod-card-sodium')).toBeInTheDocument()
  })

  it('merges extra className', () => {
    render(<ModCard {...baseProps} data-testid="card" className="extra" />)
    expect(screen.getByTestId('card').className).toContain('extra')
  })
})

describe('ModCard — optional fields (Requirement 1.5)', () => {
  it('omits description when not provided', () => {
    render(<ModCard {...baseProps} />)
    // No description paragraph should be present
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<ModCard {...baseProps} description="A fast rendering engine" />)
    expect(screen.getByText('A fast rendering engine')).toBeInTheDocument()
  })

  it('omits download count when not provided', () => {
    render(<ModCard {...baseProps} />)
    expect(screen.queryByLabelText(/downloads/i)).not.toBeInTheDocument()
  })

  it('renders download count when provided', () => {
    render(<ModCard {...baseProps} downloadCount={1500000} />)
    expect(screen.getByLabelText(/1500000 downloads/i)).toBeInTheDocument()
  })

  it('formats download count in millions', () => {
    render(<ModCard {...baseProps} downloadCount={2500000} />)
    expect(screen.getByLabelText(/downloads/i)).toHaveTextContent('2.5M')
  })

  it('formats download count in thousands', () => {
    render(<ModCard {...baseProps} downloadCount={3500} />)
    expect(screen.getByLabelText(/downloads/i)).toHaveTextContent('3.5K')
  })

  it('renders small download count as-is', () => {
    render(<ModCard {...baseProps} downloadCount={42} />)
    expect(screen.getByLabelText(/downloads/i)).toHaveTextContent('42')
  })

  it('shows placeholder emoji when imageUrl is absent', () => {
    render(<ModCard {...baseProps} />)
    // The placeholder div is aria-hidden, so we check by emoji text
    expect(screen.getByText('🧩')).toBeInTheDocument()
  })

  it('renders img element when imageUrl is provided', () => {
    render(<ModCard {...baseProps} imageUrl="https://example.com/img.png" />)
    const img = screen.getByRole('img', { name: /sodium thumbnail/i })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/img.png')
  })
})

describe('ModCard — interaction', () => {
  it('calls onClick with the mod id when clicked', () => {
    const onClick = vi.fn()
    render(<ModCard {...baseProps} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledWith('sodium')
  })

  it('calls onClick when Enter key is pressed', () => {
    const onClick = vi.fn()
    render(<ModCard {...baseProps} onClick={onClick} />)
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' })
    expect(onClick).toHaveBeenCalledWith('sodium')
  })

  it('calls onClick when Space key is pressed', () => {
    const onClick = vi.fn()
    render(<ModCard {...baseProps} onClick={onClick} />)
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })
    expect(onClick).toHaveBeenCalledWith('sodium')
  })

  it('does not render a button role when onClick is not provided', () => {
    render(<ModCard {...baseProps} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('has accessible aria-label on the button', () => {
    const onClick = vi.fn()
    render(<ModCard {...baseProps} onClick={onClick} />)
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Sodium — modrinth',
    )
  })
})
