/**
 * LauncherDownloadPrompt — shown when the Launcher is not detected.
 *
 * When the user requests modpack installation but the Launcher is not
 * available or cannot be detected, this component displays a message
 * guiding the user to download and install the Launcher before proceeding.
 *
 * Uses exclusively Lucide React icons (Requirement 7.2):
 *   - `Download` — primary action icon
 *   - `Monitor`  — launcher illustration icon
 *
 * Requirements: 4.7
 */

import React, { CSSProperties } from 'react'
import { Download, Monitor } from 'lucide-react'
import GlassPanel from '../layout/GlassPanel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LauncherDownloadPromptProps {
  /**
   * URL to the Launcher download page.
   * Defaults to '/launcher/download'.
   */
  downloadUrl?: string
  /**
   * When true, renders a loading state while checking Launcher availability.
   */
  checking?: boolean
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '24px',
  padding: '48px 32px',
  textAlign: 'center',
  maxWidth: '480px',
  margin: '0 auto',
}

const iconWrapperStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '72px',
  height: '72px',
  borderRadius: 'var(--glass-radius, 16px)',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.08))',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.15))',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.6))',
}

const titleStyle: CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  margin: 0,
}

const descriptionStyle: CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.6,
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
  margin: 0,
}

const downloadButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px 24px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg, rgba(255,255,255,0.15))',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  cursor: 'pointer',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  backdropFilter: 'blur(var(--glass-blur, 16px))',
  WebkitBackdropFilter: 'blur(var(--glass-blur, 16px))',
  transition:
    'background-color var(--glass-transition, 200ms ease), ' +
    'border-color var(--glass-transition, 200ms ease)',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}

const downloadButtonHoverStyle: CSSProperties = {
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.22))',
  borderColor: 'var(--glass-border-hover, rgba(255,255,255,0.35))',
}

const checkingStyle: CSSProperties = {
  fontSize: '14px',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.5))',
  margin: 0,
}

const skeletonStyle: CSSProperties = {
  height: '48px',
  width: '200px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.08))',
  animation: 'launcher-prompt-pulse 1.4s ease-in-out infinite',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * LauncherDownloadPrompt
 *
 * Displayed when the Launcher is not detected on the user's system.
 * Guides the user to download and install the Launcher before attempting
 * modpack installation.
 *
 * Requirements: 4.7
 */
const LauncherDownloadPrompt: React.FC<LauncherDownloadPromptProps> = ({
  downloadUrl = '/launcher/download',
  checking = false,
  className = '',
  'data-testid': testId,
}) => {
  const [hovered, setHovered] = React.useState(false)

  const buttonStyle: CSSProperties = {
    ...downloadButtonStyle,
    ...(hovered ? downloadButtonHoverStyle : {}),
  }

  return (
    <>
      {/* Skeleton pulse keyframes */}
      <style>{`
        @keyframes launcher-prompt-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>

      <GlassPanel
        className={`launcher-download-prompt${className ? ` ${className}` : ''}`}
        data-testid={testId}
      >
        <div style={containerStyle}>
          {/* Launcher icon */}
          <div style={iconWrapperStyle} aria-hidden="true">
            <Monitor size={36} />
          </div>

          {/* Title */}
          <h2 style={titleStyle}>
            Launcher não detectado
          </h2>

          {/* Description — Requirement 4.7 */}
          <p style={descriptionStyle}>
            Para instalar modpacks, você precisa do Nimbus Launcher instalado no
            seu computador. Baixe e instale o Launcher para continuar.
          </p>

          {/* Action area */}
          {checking ? (
            /* Loading state while checking Launcher availability */
            <div
              role="status"
              aria-label="Verificando disponibilidade do Launcher…"
            >
              <div style={skeletonStyle} aria-hidden="true" />
              <p style={checkingStyle}>Verificando Launcher…</p>
            </div>
          ) : (
            /* Download button */
            <a
              href={downloadUrl}
              role="button"
              aria-label="Baixar o Nimbus Launcher"
              data-testid={testId ? `${testId}-download-btn` : 'launcher-download-btn'}
              style={buttonStyle}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onFocus={() => setHovered(true)}
              onBlur={() => setHovered(false)}
            >
              {/* Lucide React icon — Download (Requirement 7.2) */}
              <Download size={18} aria-hidden="true" />
              <span>Baixar o Launcher</span>
            </a>
          )}
        </div>
      </GlassPanel>
    </>
  )
}

export default LauncherDownloadPrompt
