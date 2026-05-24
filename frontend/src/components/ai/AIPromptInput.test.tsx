/**
 * Unit tests for AIPromptInput component.
 *
 * Requirements: 11.1
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AIPromptInput, { MAX_PROMPT_LENGTH } from './AIPromptInput'

const noop = () => {}

describe('AIPromptInput — MAX_PROMPT_LENGTH constant (Requirement 11.1)', () => {
  it('exports MAX_PROMPT_LENGTH as 500', () => {
    expect(MAX_PROMPT_LENGTH).toBe(500)
  })
})

describe('AIPromptInput — rendering', () => {
  it('renders the textarea', () => {
    render(<AIPromptInput value="" onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    render(<AIPromptInput value="" onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('button', { name: /gerar modpack/i })).toBeInTheDocument()
  })

  it('renders the character counter', () => {
    render(
      <AIPromptInput value="hello" onChange={noop} onSubmit={noop} data-testid="ai-prompt" />,
    )
    expect(screen.getByTestId('ai-prompt-counter')).toHaveTextContent('5 / 500')
  })

  it('applies ai-prompt-input class', () => {
    render(<AIPromptInput value="" onChange={noop} onSubmit={noop} data-testid="ai-prompt" />)
    expect(screen.getByTestId('ai-prompt').className).toContain('ai-prompt-input')
  })

  it('merges extra className', () => {
    render(
      <AIPromptInput
        value=""
        onChange={noop}
        onSubmit={noop}
        className="extra"
        data-testid="ai-prompt"
      />,
    )
    expect(screen.getByTestId('ai-prompt').className).toContain('extra')
  })

  it('renders the label "Descreva seu modpack"', () => {
    render(<AIPromptInput value="" onChange={noop} onSubmit={noop} />)
    expect(screen.getByText('Descreva seu modpack')).toBeInTheDocument()
  })

  it('uses custom placeholder when provided', () => {
    render(
      <AIPromptInput value="" onChange={noop} onSubmit={noop} placeholder="Custom placeholder" />,
    )
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Custom placeholder')
  })
})

describe('AIPromptInput — character limit (Requirement 11.1)', () => {
  it('submit button is disabled when value is empty', () => {
    render(<AIPromptInput value="" onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('button', { name: /gerar modpack/i })).toBeDisabled()
  })

  it('submit button is enabled when value is non-empty and within limit', () => {
    render(<AIPromptInput value="modpack de tecnologia" onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('button', { name: /gerar modpack/i })).not.toBeDisabled()
  })

  it('submit button is disabled when value exceeds 500 characters', () => {
    const longValue = 'a'.repeat(501)
    render(<AIPromptInput value={longValue} onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('button', { name: /gerar modpack/i })).toBeDisabled()
  })

  it('submit button is enabled when value is exactly 500 characters', () => {
    const exactValue = 'a'.repeat(500)
    render(<AIPromptInput value={exactValue} onChange={noop} onSubmit={noop} />)
    expect(screen.getByRole('button', { name: /gerar modpack/i })).not.toBeDisabled()
  })

  it('counter shows correct count for 500-char value', () => {
    const exactValue = 'a'.repeat(500)
    render(
      <AIPromptInput value={exactValue} onChange={noop} onSubmit={noop} data-testid="ai-prompt" />,
    )
    expect(screen.getByTestId('ai-prompt-counter')).toHaveTextContent('500 / 500')
  })

  it('counter shows over-limit count for 501-char value', () => {
    const longValue = 'a'.repeat(501)
    render(
      <AIPromptInput value={longValue} onChange={noop} onSubmit={noop} data-testid="ai-prompt" />,
    )
    expect(screen.getByTestId('ai-prompt-counter')).toHaveTextContent('501 / 500')
  })

  it('shows "(limite excedido)" when over limit', () => {
    const longValue = 'a'.repeat(501)
    render(<AIPromptInput value={longValue} onChange={noop} onSubmit={noop} />)
    expect(screen.getByText(/limite excedido/i)).toBeInTheDocument()
  })

  it('does not show "(limite excedido)" when within limit', () => {
    render(<AIPromptInput value="ok" onChange={noop} onSubmit={noop} />)
    expect(screen.queryByText(/limite excedido/i)).not.toBeInTheDocument()
  })

  it('textarea has aria-invalid=true when over limit', () => {
    const longValue = 'a'.repeat(501)
    render(
      <AIPromptInput value={longValue} onChange={noop} onSubmit={noop} data-testid="ai-prompt" />,
    )
    expect(screen.getByTestId('ai-prompt-textarea')).toHaveAttribute('aria-invalid', 'true')
  })

  it('textarea has aria-invalid=false when within limit', () => {
    render(
      <AIPromptInput value="ok" onChange={noop} onSubmit={noop} data-testid="ai-prompt" />,
    )
    expect(screen.getByTestId('ai-prompt-textarea')).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('AIPromptInput — onChange callback', () => {
  it('calls onChange when the user types', () => {
    const onChange = vi.fn()
    render(<AIPromptInput value="" onChange={onChange} onSubmit={noop} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'tech pack' } })
    expect(onChange).toHaveBeenCalledWith('tech pack')
  })
})

describe('AIPromptInput — onSubmit callback', () => {
  it('calls onSubmit with trimmed value when form is submitted', () => {
    const onSubmit = vi.fn()
    render(<AIPromptInput value="  tech pack  " onChange={noop} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /gerar modpack/i }))
    expect(onSubmit).toHaveBeenCalledWith('tech pack')
  })

  it('does not call onSubmit when value is empty', () => {
    const onSubmit = vi.fn()
    render(<AIPromptInput value="" onChange={noop} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /gerar modpack/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not call onSubmit when value exceeds 500 characters', () => {
    const onSubmit = vi.fn()
    const longValue = 'a'.repeat(501)
    render(<AIPromptInput value={longValue} onChange={noop} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /gerar modpack/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit via Ctrl+Enter keyboard shortcut', () => {
    const onSubmit = vi.fn()
    render(<AIPromptInput value="tech pack" onChange={noop} onSubmit={onSubmit} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledWith('tech pack')
  })

  it('calls onSubmit via Cmd+Enter keyboard shortcut', () => {
    const onSubmit = vi.fn()
    render(<AIPromptInput value="tech pack" onChange={noop} onSubmit={onSubmit} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true })
    expect(onSubmit).toHaveBeenCalledWith('tech pack')
  })
})

describe('AIPromptInput — loading state', () => {
  it('shows "Gerando…" text when loading', () => {
    render(<AIPromptInput value="tech" onChange={noop} onSubmit={noop} loading />)
    expect(screen.getByText('Gerando…')).toBeInTheDocument()
  })

  it('disables the submit button when loading', () => {
    render(<AIPromptInput value="tech" onChange={noop} onSubmit={noop} loading />)
    expect(screen.getByRole('button', { name: /gerar modpack/i })).toBeDisabled()
  })

  it('disables the textarea when loading', () => {
    render(
      <AIPromptInput value="tech" onChange={noop} onSubmit={noop} loading data-testid="ai-prompt" />,
    )
    expect(screen.getByTestId('ai-prompt-textarea')).toBeDisabled()
  })

  it('does not call onSubmit when loading and Ctrl+Enter is pressed', () => {
    const onSubmit = vi.fn()
    render(<AIPromptInput value="tech" onChange={noop} onSubmit={onSubmit} loading />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
