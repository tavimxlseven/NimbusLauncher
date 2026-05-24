/**
 * GlassPanel — base LiquidGlass panel component.
 *
 * Applies the LiquidGlass visual style via CSS custom properties defined in
 * src/styles/glass.css so that a single ThemeSwitcher update propagates to
 * every panel without re-rendering.
 *
 * Requirements: 7.1, 7.5, 10.1
 */

import React, { CSSProperties } from 'react'

export interface GlassPanelProps {
  /** Panel content */
  children?: React.ReactNode
  /** Additional CSS class names */
  className?: string
  /** Inline style overrides — merged on top of the glass base styles */
  style?: CSSProperties
  /** HTML element to render as (default: "div") */
  as?: React.ElementType
  /** data-testid for testing */
  'data-testid'?: string
}

/**
 * Base glass panel.
 *
 * CSS guarantees:
 *  - backdrop-filter: blur(var(--glass-blur))  → ≥ 12px (default 16px)
 *  - background-color opacity                  → ≤ 0.8  (default 0.15 / 0.55)
 *  - border-radius: var(--glass-radius)        → ≥ 12px (default 16px)
 *  - width: 100% + overflow: hidden            → no horizontal overflow
 */
const GlassPanel = React.forwardRef<HTMLElement, GlassPanelProps>(
  (
    {
      children,
      className = '',
      style,
      as: Tag = 'div',
      'data-testid': testId,
    },
    ref,
  ) => {
    const baseStyle: CSSProperties = {
      /* ── LiquidGlass core (Requirement 7.1, 10.1) ─────────────────── */
      backdropFilter: 'blur(var(--glass-blur, 16px))',
      WebkitBackdropFilter: 'blur(var(--glass-blur, 16px))',
      backgroundColor: 'var(--glass-bg, rgba(255,255,255,0.15))',
      borderRadius: 'var(--glass-radius, 16px)',
      border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
      boxShadow: 'var(--glass-shadow, 0 8px 32px rgba(0,0,0,0.18))',

      /* ── Responsive layout (Requirement 7.5) ─────────────────────── */
      width: '100%',
      maxWidth: '100%',
      overflowX: 'hidden',

      /* ── Smooth theme transitions (Requirement 7.3) ───────────────── */
      transition:
        'background-color var(--glass-transition, 200ms ease), ' +
        'border-color var(--glass-transition, 200ms ease), ' +
        'box-shadow var(--glass-transition, 200ms ease)',

      ...style,
    }

    return (
      <Tag
        ref={ref}
        className={`glass-panel${className ? ` ${className}` : ''}`}
        style={baseStyle}
        data-testid={testId}
      >
        {children}
      </Tag>
    )
  },
)

GlassPanel.displayName = 'GlassPanel'

export default GlassPanel
