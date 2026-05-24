/**
 * Unit tests for AIAdjustPanel component.
 *
 * Requirements: 11.1, 11.6
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AIAdjustPanel, { MAX_ADJUST_LENGTH } from './AIAdjustPanel'

const noop = () => {}

describe('AIAdjustPanel — MAX_ADJUST_LENGTH constant (Requirement 11.1)', () => {
  it('exports MAX_ADJUST_LENGTH as 500', () => {
    expect(MAX_ADJUST_LENGTH).toBe(500)
  })
})

describe('AIAdjustPanel — rendering', () => {
  it('renders the panel header "Ajustar modpack"', () => {
    render(<AIAdjustPanel modpackId="pack-1" value="" onChange={noop} onSubmit={noop} />)
    expect(screen.getByText('Ajustar modpack')).toBeInTheDocument()
  })

  it('renders the modpack name in the subtitle when provided', () => {
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        modpackName="Tech & Magic Pack"
        value=""
        onChange={noop}
        onSubmit={noop}
      />,
    )
    expect(screen.getByText('Tech & Magic Pack')).toBeInTheDocument()
  })

  it('does not render subtitle when modpackName is omitted', () => {
    render(<AIAdjustPanel modpackId="pack-1" value="" onChange={noop} onSubmit={noop} />)
    // Only the title "Ajustar modpack" should be present, no subtitle
    expect(screen.queryByText(/tech/i)).not.toBeInTheDocument()
  })

  it('renders the textarea', () => {
    render(<AIAdjustPanel modpackId="pack-1" value="" onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    render(<AIAdjustPanel modpackId="pack-1" value="" onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('button', { name: /aplicar ajuste/i })).toBeInTheDocument()
  })

  it('renders the character counter', () => {
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        value="remova mods de magia"
        onChange={noop}
        onSubmit={noop}
        data-testid="adjust-panel"
      />,
    )
    expect(screen.getByTestId('adjust-panel-counter')).toHaveTextContent('20 / 500')
  })

  it('applies ai-adjust-panel class', () => {
    render(
      <AIAdjustPanel modpackId="pack-1" value="" onChange={noop} onSubmit={noop} data-testid="adjust-panel" />,
    )
    expect(screen.getByTestId('adjust-panel').className).toContain('ai-adjust-panel')
  })

  it('merges extra className', () => {
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        value=""
        onChange={noop}
        onSubmit={noop}
        className="extra"
        data-testid="adjust-panel"
      />,
    )
    expect(screen.getByTestId('adjust-panel').className).toContain('extra')
  })

  it('renders close button when onClose is provided', () => {
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        value=""
        onChange={noop}
        onSubmit={noop}
        onClose={vi.fn()}
        data-testid="adjust-panel"
      />,
    )
    expect(screen.getByTestId('adjust-panel-close')).toBeInTheDocument()
  })

  it('does not render close button when onClose is omitted', () => {
    render(
      <AIAdjustPanel modpackId="pack-1" value="" onChange={noop} onSubmit={noop} data-testid="adjust-panel" />,
    )
    expect(screen.queryByTestId('adjust-panel-close')).not.toBeInTheDocument()
  })
})

describe('AIAdjustPanel — character limit (Requirement 11.1)', () => {
  it('submit button is disabled when value is empty', () => {
    render(<AIAdjustPanel modpackId="pack-1" value="" onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('button', { name: /aplicar ajuste/i })).toBeDisabled()
  })

  it('submit button is enabled when value is non-empty and within limit', () => {
    render(
      <AIAdjustPanel modpackId="pack-1" value="remova mods de magia" onChange={noop} onSubmit={noop} />,
    )
    expect(screen.getByRole('button', { name: /aplicar ajuste/i })).not.toBeDisabled()
  })

  it('submit button is disabled when value exceeds 500 characters', () => {
    const longValue = 'a'.repeat(501)
    render(<AIAdjustPanel modpackId="pack-1" value={longValue} onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('button', { name: /aplicar ajuste/i })).toBeDisabled()
  })

  it('submit button is enabled when value is exactly 500 characters', () => {
    const exactValue = 'a'.repeat(500)
    render(<AIAdjustPanel modpackId="pack-1" value={exactValue} onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('button', { name: /aplicar ajuste/i })).not.toBeDisabled()
  })

  it('shows "(limite excedido)" when over limit', () => {
    const longValue = 'a'.repeat(501)
    render(<AIAdjustPanel modpackId="pack-1" value={longValue} onChange={noop} onSubmit={noop} />)
    expect(screen.getByText(/limite excedido/i)).toBeInTheDocument()
  })

  it('does not show "(limite excedido)" when within limit', () => {
    render(<AIAdjustPanel modpackId="pack-1" value="ok" onChange={noop} onSubmit={noop} />)
    expect(screen.queryByText(/limite excedido/i)).not.toBeInTheDocument()
  })

  it('textarea has aria-invalid=true when over limit', () => {
    const longValue = 'a'.repeat(501)
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        value={longValue}
        onChange={noop}
        onSubmit={noop}
        data-testid="adjust-panel"
      />,
    )
    expect(screen.getByTestId('adjust-panel-textarea')).toHaveAttribute('aria-invalid', 'true')
  })

  it('textarea has aria-invalid=false when within limit', () => {
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        value="ok"
        onChange={noop}
        onSubmit={noop}
        data-testid="adjust-panel"
      />,
    )
    expect(screen.getByTestId('adjust-panel-textarea')).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('AIAdjustPanel — onChange callback', () => {
  it('calls onChange when the user types', () => {
    const onChange = vi.fn()
    render(<AIAdjustPanel modpackId="pack-1" value="" onChange={onChange} onSubmit={noop} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'remova mods de magia' } })
    expect(onChange).toHaveBeenCalledWith('remova mods de magia')
  })
})

describe('AIAdjustPanel — onSubmit callback (Requirement 11.6)', () => {
  it('calls onSubmit with modpackId and trimmed instruction when form is submitted', () => {
    const onSubmit = vi.fn()
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        value="  remova mods de magia  "
        onChange={noop}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /aplicar ajuste/i }))
    expect(onSubmit).toHaveBeenCalledWith('pack-1', 'remova mods de magia')
  })

  it('does not call onSubmit when value is empty', () => {
    const onSubmit = vi.fn()
    render(<AIAdjustPanel modpackId="pack-1" value="" onChange={noop} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /aplicar ajuste/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not call onSubmit when value exceeds 500 characters', () => {
    const onSubmit = vi.fn()
    const longValue = 'a'.repeat(501)
    render(<AIAdjustPanel modpackId="pack-1" value={longValue} onChange={noop} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /aplicar ajuste/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit via Ctrl+Enter keyboard shortcut', () => {
    const onSubmit = vi.fn()
    render(
      <AIAdjustPanel modpackId="pack-1" value="remova mods" onChange={noop} onSubmit={onSubmit} />,
    )
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledWith('pack-1', 'remova mods')
  })

  it('calls onSubmit via Cmd+Enter keyboard shortcut', () => {
    const onSubmit = vi.fn()
    render(
      <AIAdjustPanel modpackId="pack-1" value="remova mods" onChange={noop} onSubmit={onSubmit} />,
    )
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true })
    expect(onSubmit).toHaveBeenCalledWith('pack-1', 'remova mods')
  })
})

describe('AIAdjustPanel — onClose callback', () => {
  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        value=""
        onChange={noop}
        onSubmit={noop}
        onClose={onClose}
        data-testid="adjust-panel"
      />,
    )
    fireEvent.click(screen.getByTestId('adjust-panel-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('AIAdjustPanel — loading state', () => {
  it('shows "Ajustando…" text when loading', () => {
    render(
      <AIAdjustPanel modpackId="pack-1" value="remova mods" onChange={noop} onSubmit={noop} loading />,
    )
    expect(screen.getByText('Ajustando…')).toBeInTheDocument()
  })

  it('disables the submit button when loading', () => {
    render(
      <AIAdjustPanel modpackId="pack-1" value="remova mods" onChange={noop} onSubmit={noop} loading />,
    )
    expect(screen.getByRole('button', { name: /aplicar ajuste/i })).toBeDisabled()
  })

  it('disables the textarea when loading', () => {
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        value="remova mods"
        onChange={noop}
        onSubmit={noop}
        loading
        data-testid="adjust-panel"
      />,
    )
    expect(screen.getByTestId('adjust-panel-textarea')).toBeDisabled()
  })

  it('does not call onSubmit when loading and Ctrl+Enter is pressed', () => {
    const onSubmit = vi.fn()
    render(
      <AIAdjustPanel
        modpackId="pack-1"
        value="remova mods"
        onChange={noop}
        onSubmit={onSubmit}
        loading
      />,
    )
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
