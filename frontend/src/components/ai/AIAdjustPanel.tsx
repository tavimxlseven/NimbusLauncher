/**
 * AIAdjustPanel — panel for submitting incremental adjustments to a
 * previously generated modpack.
 *
 * Sends a PATCH /api/v1/ai/modpacks/:id request with the adjustment
 * instruction (Requirement 11.6). The instruction field also enforces the
 * 500-character limit consistent with the initial prompt (Requirement 11.1).
 *
 * Uses exclusively Lucide React icons (Requirement 7.2):
 *  - `Wand2`   — panel header icon
 *  - `Sparkles` — submit button icon
 *  - `Loader`  — loading spinner
 *  - `X`       — close / cancel button
 *
 * Requirements: 11.1, 11.6
 */

import React, { CSSProperties, useId } from 'react'
import { Wand2, Sparkles, Loader, X } from 'lucide-react'
import GlassPanel from '../layout/GlassPanel'

/* ── Constants ───────────────────────────────────────────────────────────── */

/** Maximum allowed characters for the adjustment instruction (Requirement 11.1) */
export const MAX_ADJUST_LENGTH = 500

/* ── Props ───────────────────────────────────────────────────────────────── */

export interface AIAdjustPanelProps {
  /** ID of the modpack being adjusted */
  modpackId: string
  /** Name of the modpack (shown in the panel header) */
  modpackName?: string
  /** Controlled value of the adjustment instruction textarea */
  value: string
  /** Called on every keystroke with the new value */
  onChange: (value: string) => void
  /**
   * Called when the user submits the adjustment.
   * Receives the modpack ID and the trimmed instruction string.
   */
  onSubmit: (modpackId: string, instruction: string) => void
  /** Called when the user dismisses / closes the panel */
  onClose?: () => void
  /** When true, renders a loading spinner and disables the input */
  loading?: boolean
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  padding: '20px',
  width: '100%',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
}

const headerTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}

const titleStyle: CSSProperties = {
  fontSize: '16px',
  fontWeight: 700,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  margin: 0,
}

const subtitleStyle: CSSProperties = {
  fontSize: '13px',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.6))',
  margin: '2px 0 0',
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
  minHeight: '80px',
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
  padding: '10px 18px',
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

const closeButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'transparent',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.6))',
  cursor: 'pointer',
  padding: 0,
  transition: 'background-color var(--glass-transition, 200ms ease)',
  flexShrink: 0,
}

const spinnerStyle: CSSProperties = {
  animation: 'ai-adjust-spin 0.8s linear infinite',
}

/* ── Component ───────────────────────────────────────────────────────────── */

const AIAdjustPanel: React.FC<AIAdjustPanelProps> = ({
  modpackId,
  modpackName,
  value,
  onChange,
  onSubmit,
  onClose,
  loading = false,
  className = '',
  'data-testid': testId = 'ai-adjust-panel',
}) => {
  const textareaId = useId()

  const charCount = value.length
  const overLimit = charCount > MAX_ADJUST_LENGTH
  const isEmpty = value.trim().length === 0
  const isDisabled = loading || overLimit || isEmpty

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isDisabled) {
      onSubmit(modpackId, value.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!isDisabled) {
        onSubmit(modpackId, value.trim())
      }
    }
  }

  return (
    <>
      <style>{`
        @keyframes ai-adjust-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        #${CSS.escape(textareaId)}:focus {
          border-color: var(--theme-color, rgba(79,142,247,0.7));
          background: var(--glass-bg-hover, rgba(255,255,255,0.12));
        }
      `}</style>

      <GlassPanel
        className={`ai-adjust-panel${className ? ` ${className}` : ''}`}
        data-testid={testId}
      >
        <form onSubmit={handleSubmit} noValidate>
          <div style={containerStyle}>
            {/* ── Header ──────────────────────────────────────────────── */}
            <div style={headerStyle}>
              <div style={headerTitleStyle}>
                <Wand2
                  size={18}
                  style={{ color: 'var(--theme-color, #4F8EF7)', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <div>
                  <h3 style={titleStyle}>Ajustar modpack</h3>
                  {modpackName && (
                    <p style={subtitleStyle}>{modpackName}</p>
                  )}
                </div>
              </div>

              {/* Close button */}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  style={closeButtonStyle}
                  aria-label="Fechar painel de ajuste"
                  data-testid={`${testId}-close`}
                >
                  {/* Lucide React icon — X */}
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* ── Instruction textarea ─────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor={textareaId} style={labelStyle}>
                Instrução de ajuste
              </label>

              <textarea
                id={textareaId}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder='Ex: "remova os mods de magia" ou "adicione mods de exploração"'
                disabled={loading}
                aria-label="Instrução de ajuste do modpack"
                aria-describedby={`${textareaId}-counter`}
                aria-invalid={overLimit}
                data-testid={`${testId}-textarea`}
                style={{
                  ...textareaStyle,
                  ...(overLimit ? textareaErrorStyle : {}),
                  ...(loading ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                }}
              />
            </div>

            {/* ── Footer: counter + submit ─────────────────────────────── */}
            <div style={footerStyle}>
              {/* Character counter */}
              <span
                id={`${textareaId}-counter`}
                style={counterStyle(overLimit)}
                aria-live="polite"
                aria-atomic="true"
                data-testid={`${testId}-counter`}
              >
                {charCount} / {MAX_ADJUST_LENGTH}
                {overLimit && (
                  <span aria-label={`Excede o limite em ${charCount - MAX_ADJUST_LENGTH} caracteres`}>
                    {' '}(limite excedido)
                  </span>
                )}
              </span>

              {/* Submit button */}
              <button
                type="submit"
                disabled={isDisabled}
                aria-label="Aplicar ajuste ao modpack"
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
                <span>{loading ? 'Ajustando…' : 'Aplicar ajuste'}</span>
              </button>
            </div>
          </div>
        </form>
      </GlassPanel>
    </>
  )
}

export default AIAdjustPanel
