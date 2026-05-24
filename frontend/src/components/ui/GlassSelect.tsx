/**
 * GlassSelect — iOS-style custom dropdown.
 *
 * Replaces native <select> with a fully custom glass panel dropdown.
 * Uses a React portal so the dropdown renders at document.body level,
 * escaping any overflow:hidden/auto parent (e.g. modals).
 * Features: backdrop-filter blur, smooth open/close animation,
 * keyboard navigation (ArrowUp/Down, Enter, Escape), click-outside close.
 */

import React, {
  CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

export interface GlassSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  minWidth?: number | string
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

// ── Tokens (must stay in sync with App.tsx M tokens) ─────────────────────────
const T = {
  border:    'rgba(255,255,255,0.12)',
  accent:    '#1bd96a',
  text:      'rgba(255,255,255,0.97)',
  textMuted: 'rgba(255,255,255,0.38)',
  radius:    '10px',
}

const DROPDOWN_CSS = `
  @keyframes gs-open {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }
  .gs-option:hover {
    background: rgba(255,255,255,0.10) !important;
  }
  .gs-trigger:hover {
    border-color: rgba(255,255,255,0.22) !important;
    background: rgba(255,255,255,0.12) !important;
  }
  .gs-trigger:focus-visible {
    outline: none;
    border-color: ${T.accent} !important;
    box-shadow: 0 0 0 3px ${T.accent}33 !important;
  }
`

interface DropdownPos { top: number; left: number; width: number; openUp: boolean }

const GlassSelect: React.FC<GlassSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Selecionar…',
  minWidth = 130,
  disabled = false,
  id,
  'aria-label': ariaLabel,
}) => {
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [pos, setPos] = useState<DropdownPos>({ top: 0, left: 0, width: 0, openUp: false })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedOption = options.find(o => o.value === value)
  const displayLabel = selectedOption?.label ?? placeholder

  // Calculate dropdown position relative to viewport
  const calcPos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const dropH = Math.min(options.length * 40 + 8, 260)
    const openUp = spaceBelow < dropH && spaceAbove > spaceBelow
    setPos({
      top: openUp ? rect.top + window.scrollY - dropH - 6 : rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
      width: rect.width,
      openUp,
    })
  }, [options.length])

  const openDropdown = useCallback(() => {
    if (disabled) return
    calcPos()
    setOpen(true)
    setFocusedIdx(options.findIndex(o => o.value === value))
  }, [disabled, calcPos, options, value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Reposition on scroll/resize while open
  useLayoutEffect(() => {
    if (!open) return
    const handler = () => calcPos()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open, calcPos])

  // Scroll focused item into view
  useEffect(() => {
    if (!open || focusedIdx < 0) return
    const item = listRef.current?.children[focusedIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx, open])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (!open) { openDropdown() }
        else if (focusedIdx >= 0) { onChange(options[focusedIdx].value); setOpen(false) }
        break
      case 'Escape':
        setOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!open) { openDropdown() }
        else setFocusedIdx(i => Math.min(i + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) { openDropdown() }
        else setFocusedIdx(i => Math.max(i - 1, 0))
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }, [disabled, open, focusedIdx, options, onChange, openDropdown])

  const triggerStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '9px 12px 9px 14px',
    borderRadius: T.radius,
    border: `1px solid ${T.border}`,
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
    color: T.text,
    fontSize: '14px',
    fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth,
    width: typeof minWidth === 'string' && minWidth === '100%' ? '100%' : undefined,
    userSelect: 'none',
    transition: 'border-color 150ms, background 150ms, box-shadow 150ms',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  }

  const dropdownStyle: CSSProperties = {
    position: 'absolute',
    top: pos.top,
    left: pos.left,
    zIndex: 99999,
    minWidth: pos.width,
    maxHeight: '260px',
    overflowY: 'auto',
    borderRadius: T.radius,
    border: `1px solid rgba(255,255,255,0.16)`,
    background: 'rgba(14,18,26,0.97)',
    backdropFilter: 'blur(28px) saturate(200%)',
    WebkitBackdropFilter: 'blur(28px) saturate(200%)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)',
    animation: 'gs-open 160ms cubic-bezier(0.16,1,0.3,1) forwards',
    padding: '4px',
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(255,255,255,0.15) transparent',
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: typeof minWidth === 'string' && minWidth === '100%' ? '100%' : undefined }}>
      <style>{DROPDOWN_CSS}</style>

      {/* Trigger button */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? displayLabel}
        disabled={disabled}
        className="gs-trigger"
        style={triggerStyle}
        onClick={openDropdown}
        onKeyDown={handleKeyDown}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
          {displayLabel}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            color: T.textMuted,
            flexShrink: 0,
            transition: 'transform 200ms ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Dropdown rendered in a portal at document.body */}
      {open && createPortal(
        <ul
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          style={dropdownStyle}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value
            const isFocused = idx === focusedIdx
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                className="gs-option"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  color: isSelected ? T.accent : T.text,
                  fontWeight: isSelected ? 600 : 400,
                  background: isFocused
                    ? 'rgba(255,255,255,0.10)'
                    : isSelected
                    ? 'rgba(27,217,106,0.10)'
                    : 'transparent',
                  transition: 'background 100ms',
                  listStyle: 'none',
                  userSelect: 'none',
                }}
                onMouseEnter={() => setFocusedIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <Check size={14} color={T.accent} aria-hidden="true" style={{ flexShrink: 0 }} />
                )}
              </li>
            )
          })}
        </ul>,
        document.body
      )}
    </div>
  )
}

export default GlassSelect
