/**
 * Unit tests for GlassModal component.
 * Requirements: 7.1, 7.2, 7.5, 10.1, 10.5
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import GlassModal from './GlassModal'

describe('GlassModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <GlassModal isOpen={false} onClose={vi.fn()}>
        Hidden content
      </GlassModal>,
    )
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument()
  })

  it('renders children when isOpen is true', () => {
    render(
      <GlassModal isOpen onClose={vi.fn()}>
        Modal body
      </GlassModal>,
    )
    expect(screen.getByText('Modal body')).toBeInTheDocument()
  })

  it('renders the title', () => {
    render(
      <GlassModal isOpen onClose={vi.fn()} title="My Modal">
        content
      </GlassModal>,
    )
    expect(screen.getByText('My Modal')).toBeInTheDocument()
  })

  it('has role="dialog" and aria-modal="true"', () => {
    render(
      <GlassModal isOpen onClose={vi.fn()} title="Test">
        x
      </GlassModal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('links aria-labelledby to the title element', () => {
    render(
      <GlassModal isOpen onClose={vi.fn()} title="Accessible Title">
        x
      </GlassModal>,
    )
    const dialog = screen.getByRole('dialog')
    const labelId = dialog.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    const titleEl = document.getElementById(labelId!)
    expect(titleEl?.textContent).toBe('Accessible Title')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <GlassModal isOpen onClose={onClose} title="Close me">
        x
      </GlassModal>,
    )
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(
      <GlassModal isOpen onClose={onClose}>
        x
      </GlassModal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <GlassModal isOpen onClose={onClose} data-testid="modal">
        x
      </GlassModal>,
    )
    fireEvent.click(screen.getByTestId('modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when the panel itself is clicked', () => {
    const onClose = vi.fn()
    render(
      <GlassModal isOpen onClose={onClose} data-testid="modal">
        <span>inner</span>
      </GlassModal>,
    )
    fireEvent.click(screen.getByText('inner'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('applies correct max-width for size="sm"', () => {
    render(
      <GlassModal isOpen onClose={vi.fn()} size="sm" data-testid="modal">
        x
      </GlassModal>,
    )
    const panel = screen.getByTestId('modal') as HTMLElement
    expect(panel.style.maxWidth).toBe('400px')
  })

  it('applies correct max-width for size="lg"', () => {
    render(
      <GlassModal isOpen onClose={vi.fn()} size="lg" data-testid="modal">
        x
      </GlassModal>,
    )
    const panel = screen.getByTestId('modal') as HTMLElement
    expect(panel.style.maxWidth).toBe('900px')
  })

  it('defaults to size="md" (600px)', () => {
    render(
      <GlassModal isOpen onClose={vi.fn()} data-testid="modal">
        x
      </GlassModal>,
    )
    const panel = screen.getByTestId('modal') as HTMLElement
    expect(panel.style.maxWidth).toBe('600px')
  })

  it('renders close button even without a title', () => {
    render(
      <GlassModal isOpen onClose={vi.fn()}>
        no title
      </GlassModal>,
    )
    expect(screen.getByRole('button', { name: /close modal/i })).toBeInTheDocument()
  })
})
