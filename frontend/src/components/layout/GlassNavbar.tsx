/**
 * GlassNavbar — sticky navigation bar built on GlassPanel.
 *
 * Uses exclusively Lucide React icons (Requirement 7.2, 10.5):
 *  - `Layers`  — logo / brand icon
 *  - `Menu`    — hamburger toggle on mobile (< 768px)
 *
 * Requirements: 7.1, 7.2, 7.5, 10.1, 10.5
 */

import React, { CSSProperties, useState } from 'react'
import { Layers, Menu } from 'lucide-react'
import GlassPanel from './GlassPanel'

export interface GlassNavbarProps {
  /** Brand / page title shown next to the logo */
  title?: string
  /** Extra content rendered in the right section of the navbar */
  children?: React.ReactNode
  /** Called when the hamburger menu button is clicked */
  onMenuClick?: () => void
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

const navbarContainerStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 'var(--z-navbar, 100)' as unknown as number,
  width: '100%',
  maxWidth: '100%',
}

const navbarInnerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 'var(--glass-navbar-height, 64px)',
  padding: '0 clamp(12px, 4vw, 32px)',
  gap: '12px',
  width: '100%',
  maxWidth: '100%',
  overflowX: 'hidden',
}

const brandStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexShrink: 0,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  textDecoration: 'none',
}

const titleStyle: CSSProperties = {
  fontSize: 'clamp(14px, 2.5vw, 18px)',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexShrink: 0,
}

const menuButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  height: '40px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.22))',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  cursor: 'pointer',
  transition: 'background var(--glass-transition, 200ms ease)',
  flexShrink: 0,
}

/**
 * Sticky LiquidGlass navigation bar.
 *
 * On viewports < 768px the `children` slot is hidden and a hamburger button
 * appears. The `onMenuClick` callback lets the parent control a drawer/sidebar.
 * On viewports ≥ 768px the hamburger is hidden and `children` are shown inline.
 *
 * Responsive range: 320px – 2560px without horizontal overflow (Requirement 7.5).
 */
const GlassNavbar: React.FC<GlassNavbarProps> = ({
  title = 'Nimbus Launcher',
  children,
  onMenuClick,
  className = '',
  'data-testid': testId,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleMenuClick = () => {
    setMenuOpen((prev) => !prev)
    onMenuClick?.()
  }

  return (
    <nav
      style={navbarContainerStyle}
      aria-label="Main navigation"
      data-testid={testId}
    >
      <GlassPanel
        as="div"
        className={`glass-navbar${className ? ` ${className}` : ''}`}
        style={{
          borderRadius: 0,
          backgroundColor: 'var(--glass-navbar-bg, rgba(255,255,255,0.12))',
          border: 'none',
          borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
        }}
      >
        <div style={navbarInnerStyle}>
          {/* ── Brand ─────────────────────────────────────────────────── */}
          <div style={brandStyle} aria-label={title}>
            {/* Lucide React icon — Layers (Requirement 7.2) */}
            <Layers
              size={24}
              aria-hidden="true"
              color="var(--glass-text-primary, rgba(255,255,255,0.95))"
            />
            <span style={titleStyle}>{title}</span>
          </div>

          {/* ── Desktop actions (hidden on mobile via CSS) ─────────────── */}
          <div
            style={actionsStyle}
            className="glass-navbar__actions"
            aria-label="Navigation actions"
          >
            {children}
          </div>

          {/* ── Mobile hamburger (hidden on desktop via CSS) ───────────── */}
          <button
            type="button"
            style={menuButtonStyle}
            className="glass-navbar__menu-btn"
            onClick={handleMenuClick}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="glass-navbar-mobile-menu"
          >
            {/* Lucide React icon — Menu (Requirement 7.2) */}
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </GlassPanel>

      {/* ── Responsive CSS injected as a style tag ─────────────────────── */}
      <style>{`
        /* Desktop: show actions, hide hamburger */
        @media (min-width: 768px) {
          .glass-navbar__menu-btn {
            display: none !important;
          }
          .glass-navbar__actions {
            display: flex !important;
          }
        }

        /* Mobile: hide actions, show hamburger */
        @media (max-width: 767px) {
          .glass-navbar__actions {
            display: none !important;
          }
          .glass-navbar__menu-btn {
            display: flex !important;
          }
        }

        /* Ensure navbar height adapts on small screens */
        @media (max-width: 480px) {
          .glass-navbar {
            --glass-navbar-height: var(--glass-navbar-height-mobile, 56px);
          }
        }
      `}</style>
    </nav>
  )
}

export default GlassNavbar
