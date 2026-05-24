/**
 * AIPromptInput — natural language input for AI modpack generation.
 *
 * Enforces a hard limit of 500 characters on the description field
 * (Requirement 11.1). The submit button is disabled when the input is empty
 * or exceeds the limit.
 *
 * Uses exclusively Lucide React icons (Requirement 7.2):
 *  - `Sparkles` — submit / generate button icon
 *  - `Loader`   — loading spinner while generation is in progress
 *
 * Requirements: 11.1
 */

import React, { CSSProperties, useId } from 'react'
import { Sparkles, Loader } from 'lucide-react'
import GlassPanel from '../layout/GlassPanel'

/* ── Constants ───────────────────────────────────────────────────────────── */

/** Maximum allowed characters for the AI description prompt (Requirement 11.1) */
export const MAX_PROMPT_LENGTH = 500

/* ── Props ───────────────────────────────────────────────────────────────── */

export interface AIPromptInputProps {
  /** Controlled value of the textarea */
  value: string
  /** Called on every keystroke with the new value */
  onChange: (value: string) => void
  /**
   * Called when the user submits the prompt.
   * Only fired when the value is non-empty and within the 500-char limit.
   */
  onSubmit: (prompt: string) => void
  /** When true, renders a loading spinner and disables the input */
  loading?: boolean
  /** Placeholder text for the textarea */
  placeholder?: string
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '20px',
  width: '100%',
}

const labelStyle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: '100px',
  padding: '12px 14px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg, rgba(255,255,255,0.08))',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  fontSize: '15px',
  lineHeight: 1.5,
  resize: 'vertical',
  outline: 'none',
  fontFamily: 'inherit',
  transition:
    'border-color var(--glass-transition, 200ms ease), ' +
    'background-color var(--glass-transition, 200ms ease)',
  boxSizing: 'border-box',
}

const textareaErrorStyle: CSSProperties = {
  borderColor: 'rgba(251, 113, 133, 0.7)',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
}

const counterStyle = (overLimit: boolean): CSSProperties => ({
  fontSize: '13px',
  color: overLimit
    ? 'rgba(251, 113, 133, 0.9)'
    : 'var(--glass-text-muted, rgba(255,255,255,0.4))',
  fontVariantNumeric: 'tabular-nums',
  transition: 'color var(--glass-transition, 200ms ease)',
})

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 20px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: disabled
    ? 'var(--glass-bg, rgba(255,255,255,0.08))'
    : 'var(--glass-bg-active, rgba(255,255,255,0.28))',
  color: disabled
    ? 'var(--glass-text-muted, rgba(255,255,255,0.35))'
    : 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '14px',
  fontWeight: 600,
  transition:
    'background-color var(--glass-transition, 200ms ease), ' +
    'color var(--glass-transition, 200ms ease)',
  flexShrink: 0,
})

const spinnerStyle: CSSProperties = {
  animation: 'ai-prompt-spin 0.8s linear infinite',
}

/* ── Component ───────────────────────────────────────────────────────────── */

const AIPromptInput: React.FC<AIPromptInputProps> = ({
  value,
  onChange,
  onSubmit,
  loading = false,
  placeholder = 'Descreva o modpack que você quer criar… (ex: "quero um modpack de tecnologia com magia")',
  className = '',
  'data-testid': testId = 'ai-prompt-input',
}) => {
  const textareaId = useId()

  const charCount = value.length
  const overLimit = charCount > MAX_PROMPT_LENGTH
  const isEmpty = value.trim().length === 0
  const isDisabled = loading || overLimit || isEmpty

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Allow typing beyond the limit so the user can see the counter turn red
    // and edit back down — but submission is blocked (Requirement 11.1).
    onChange(e.target.value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isDisabled) {
      onSubmit(value.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter / Cmd+Enter submits the form
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!isDisabled) {
        onSubmit(value.trim())
      }
    }
  }

  return (
    <>
      <style>{`
        @keyframes ai-prompt-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        #${CSS.escape(textareaId)}:focus {
          border-color: var(--theme-color, rgba(79,142,247,0.7));
          background: var(--glass-bg-hover, rgba(255,255,255,0.12));
        }
      `}</style>

      <GlassPanel
        className={`ai-prompt-input${className ? ` ${className}` : ''}`}
        data-testid={testId}
      >
        <form onSubmit={handleSubmit} noValidate>
          <div style={containerStyle}>
            {/* ── Label ─────────────────────────────────────────────── */}
            <label htmlFor={textareaId} style={labelStyle}>
              Descreva seu modpack
            </label>

            {/* ── Textarea ──────────────────────────────────────────── */}
            <textarea
              id={textareaId}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={loading}
              aria-label="Descrição do modpack"
              aria-describedby={`${textareaId}-counter`}
              aria-invalid={overLimit}
              data-testid={`${testId}-textarea`}
              style={{
                ...textareaStyle,
                ...(overLimit ? textareaErrorStyle : {}),
                ...(loading ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
              }}
            />

            {/* ── Footer: counter + submit ───────────────────────────── */}
            <div style={footerStyle}>
              {/* Character counter */}
              <span
                id={`${textareaId}-counter`}
                style={counterStyle(overLimit)}
                aria-live="polite"
                aria-atomic="true"
                data-testid={`${testId}-counter`}
              >
                {charCount} / {MAX_PROMPT_LENGTH}
                {overLimit && (
                  <span aria-label={`Excede o limite em ${charCount - MAX_PROMPT_LENGTH} caracteres`}>
                    {' '}(limite excedido)
                  </span>
                )}
              </span>

              {/* Submit button */}
              <button
                type="submit"
                disabled={isDisabled}
                aria-label="Gerar modpack"
                data-testid={`${testId}-submit`}
                style={submitButtonStyle(isDisabled)}
              >
                {loading ? (
                  /* Lucide React icon — Loader (spinner) */
                  <Loader size={16} style={spinnerStyle} aria-hidden="true" />
                ) : (
                  /* Lucide React icon — Sparkles */
                  <Sparkles size={16} aria-hidden="true" />
                )}
                <span>{loading ? 'Gerando…' : 'Gerar modpack'}</span>
              </button>
            </div>
          </div>
        </form>
      </GlassPanel>
    </>
  )
}

export default AIPromptInput
