/**
 * GlassModal — accessible modal dialog built on GlassPanel.
 *
 * Uses exclusively Lucide React icons (Requirement 7.2, 10.5):
 *  - `X` — close button
 *
 * Accessibility:
 *  - role="dialog", aria-modal="true", aria-labelledby
 *  - Closes on Escape key and backdrop click
 *  - Focus is trapped inside the modal while open
 *
 * Requirements: 7.1, 7.2, 7.5, 10.1, 10.5
 */

import React, {
  CSSProperties,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react'
import { X } from 'lucide-react'
import GlassPanel from './GlassPanel'

export type GlassModalSize = 'sm' | 'md' | 'lg'

export interface GlassModalProps {
  /** Controls visibility */
  isOpen: boolean
  /** Called when the modal should close (Escape, backdrop click, close button) */
  onClose: () => void
  /** Optional title rendered in the modal header */
  title?: string
  /** Modal body content */
  children?: React.ReactNode
  /** Size variant — controls max-width */
  size?: GlassModalSize
  /** Additional CSS class names for the modal panel */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

const SIZE_MAX_WIDTH: Record<GlassModalSize, string> = {
  sm: '400px',
  md: '600px',
  lg: '900px',
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'clamp(12px, 4vw, 32px)',
  backgroundColor: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  zIndex: 'var(--z-modal-overlay, 200)' as unknown as number,
  overflowX: 'hidden',
  overflowY: 'auto',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'clamp(16px, 3vw, 24px) clamp(16px, 3vw, 24px) 0',
  gap: '12px',
}

const titleTextStyle: CSSProperties = {
  fontSize: 'clamp(16px, 2.5vw, 20px)',
  fontWeight: 600,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  margin: 0,
  lineHeight: 1.3,
}

const closeButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  flexShrink: 0,
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.22))',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  cursor: 'pointer',
  transition: 'background var(--glass-transition, 200ms ease)',
}

const bodyStyle: CSSProperties = {
  padding: 'clamp(16px, 3vw, 24px)',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
  overflow: 'visible',
}

/**
 * Accessible LiquidGlass modal dialog.
 *
 * - Closes on Escape key press
 * - Closes on backdrop click (but not on panel click)
 * - Traps focus inside while open
 * - Prevents body scroll while open
 */
const GlassModal: React.FC<GlassModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className = '',
  'data-testid': testId,
}) => {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  /* ── Escape key handler ─────────────────────────────────────────────── */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [onClose],
  )

  /* ── Focus trap ─────────────────────────────────────────────────────── */
  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return

    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (!first) return

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    /* Save focus origin so we can restore it on close */
    previousFocusRef.current = document.activeElement as HTMLElement

    /* Prevent body scroll while modal is open */
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keydown', trapFocus)

    /* Move focus into the modal */
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keydown', trapFocus)
      document.body.style.overflow = originalOverflow

      /* Restore focus to the element that opened the modal */
      previousFocusRef.current?.focus()
    }
  }, [isOpen, handleKeyDown, trapFocus])

  if (!isOpen) return null

  /* ── Backdrop click: close only when clicking the overlay itself ─────── */
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const panelStyle: CSSProperties = {
    width: '100%',
    maxWidth: SIZE_MAX_WIDTH[size],
    zIndex: 'var(--z-modal, 201)' as unknown as number,
    position: 'relative',
    maxHeight: '90vh',
    overflowY: 'auto',
    overflowX: 'visible',
  }

  return (
    <div
      style={overlayStyle}
      onClick={handleOverlayClick}
      data-testid={testId ? `${testId}-overlay` : 'glass-modal-overlay'}
    >
      <GlassPanel
        as="div"
        ref={panelRef as React.Ref<HTMLElement>}
        className={`glass-modal${className ? ` ${className}` : ''}`}
        style={panelStyle}
        data-testid={testId}
      >
        {/* Accessible dialog wrapper */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          {(title != null) && (
            <div style={headerStyle}>
              <h2 id={titleId} style={titleTextStyle}>
                {title}
              </h2>
              <button
                type="button"
                style={closeButtonStyle}
                onClick={onClose}
                aria-label="Close modal"
              >
                {/* Lucide React icon — X (Requirement 7.2) */}
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Close button without title */}
          {title == null && (
            <div style={{ ...headerStyle, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={closeButtonStyle}
                onClick={onClose}
                aria-label="Close modal"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* ── Body ────────────────────────────────────────────────── */}
          <div style={bodyStyle}>{children}</div>
        </div>
      </GlassPanel>
    </div>
  )
}

export default GlassModal
