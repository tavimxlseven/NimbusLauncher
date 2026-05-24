/**
 * UpdateModal — Mandatory update modal that blocks launcher UI
 *
 * Displays a blocking overlay when a mandatory update is required.
 * The modal cannot be closed (no X button, no ESC key) and blocks all
 * interaction with the launcher until the user downloads the update.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10
 */

import React, { CSSProperties } from 'react'
import { Download } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Version information for the update modal.
 */
export interface VersionInfo {
  /** Latest available version (semver format) */
  current: string
  /** Minimum required version (semver format) */
  minimum: string
  /** URL to download page for the update */
  downloadUrl: string
  /** Optional markdown release notes */
  releaseNotes?: string
}

/**
 * Props for the UpdateModal component.
 */
export interface UpdateModalProps {
  /** Version information from the backend */
  versionInfo: VersionInfo
  /** Current launcher version */
  currentVersion: string
  /** Callback when user clicks "Download Update" button */
  onDownload: () => void
  /** Optional data-testid for testing */
  'data-testid'?: string
}

// ---------------------------------------------------------------------------
// Design tokens (matching App.tsx Modrinth style)
// ---------------------------------------------------------------------------

const M = {
  bg: '#080c12',
  cardBg: 'rgba(255,255,255,0.065)',
  border: 'rgba(255,255,255,0.12)',
  accent: '#1bd96a',
  accentHv: '#17c45e',
  text: 'rgba(255,255,255,0.97)',
  textSub: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.38)',
  radius: '14px',
  radiusLg: '18px',
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'clamp(12px, 4vw, 32px)',
  backgroundColor: 'rgba(0,0,0,0.9)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  zIndex: 9999,
  overflow: 'hidden',
}

const modalCardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '500px',
  background: 'rgba(255,255,255,0.055)',
  backdropFilter: 'blur(28px) saturate(180%)',
  WebkitBackdropFilter: 'blur(28px) saturate(180%)',
  border: `1px solid ${M.border}`,
  borderRadius: M.radiusLg,
  padding: '32px',
  boxShadow: '0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.10)',
  animation: 'fadeIn 300ms ease',
}

const titleStyle: CSSProperties = {
  fontSize: 'clamp(20px, 3vw, 24px)',
  fontWeight: 700,
  color: M.text,
  margin: '0 0 12px 0',
  lineHeight: 1.3,
}

const messageStyle: CSSProperties = {
  fontSize: '15px',
  color: M.textSub,
  lineHeight: 1.6,
  margin: '0 0 24px 0',
}

const versionInfoStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${M.border}`,
  borderRadius: M.radius,
  padding: '16px',
  marginBottom: '24px',
}

const versionRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 0',
  fontSize: '14px',
}

const versionLabelStyle: CSSProperties = {
  color: M.textMuted,
  fontWeight: 500,
}

const versionValueStyle: CSSProperties = {
  color: M.text,
  fontWeight: 700,
  fontFamily: 'monospace',
}

const downloadButtonStyle: CSSProperties = {
  width: '100%',
  padding: '14px 24px',
  background: M.accent,
  border: 'none',
  borderRadius: M.radius,
  color: '#fff',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  transition: 'all 200ms ease',
  fontFamily: 'inherit',
  boxShadow: `0 4px 16px ${M.accent}44`,
}

const releaseNotesStyle: CSSProperties = {
  marginTop: '20px',
  padding: '16px',
  background: 'rgba(255,255,255,0.03)',
  border: `1px solid ${M.border}`,
  borderRadius: M.radius,
  fontSize: '13px',
  color: M.textSub,
  lineHeight: 1.6,
  maxHeight: '200px',
  overflowY: 'auto',
}

const releaseNotesTitleStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: M.text,
  marginBottom: '8px',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Mandatory update modal that blocks all launcher interaction.
 *
 * This modal:
 * - Covers the entire launcher UI with a dark overlay (Requirement 8.2)
 * - Displays current version, minimum version, and latest version (Requirements 8.3, 8.4, 8.5)
 * - Includes a "Download Update" button that opens the download URL (Requirement 8.6)
 * - Cannot be closed (no X button, no ESC key) (Requirement 8.8)
 * - Blocks all UI interaction except the modal itself (Requirement 8.7)
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10
 */
const UpdateModal: React.FC<UpdateModalProps> = ({
  versionInfo,
  currentVersion,
  onDownload,
  'data-testid': testId,
}) => {
  // Prevent ESC key from closing the modal (Requirement 8.8)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    // Prevent body scroll while modal is open
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    document.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
      document.body.style.overflow = originalOverflow
    }
  }, [])

  return (
    <div
      style={overlayStyle}
      data-testid={testId || 'update-modal-overlay'}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
      aria-describedby="update-modal-description"
    >
      <div style={modalCardStyle} data-testid={testId ? `${testId}-card` : 'update-modal-card'}>
        {/* Title */}
        <h2 id="update-modal-title" style={titleStyle}>
          Update Required
        </h2>

        {/* Message */}
        <p id="update-modal-description" style={messageStyle}>
          Your launcher version is outdated and must be updated to continue.
          Please download the latest version to access all features.
        </p>

        {/* Version Information */}
        <div style={versionInfoStyle}>
          <div style={versionRowStyle}>
            <span style={versionLabelStyle}>Current Version:</span>
            <span style={versionValueStyle}>{currentVersion}</span>
          </div>
          <div style={{ height: '1px', background: M.border, margin: '4px 0' }} />
          <div style={versionRowStyle}>
            <span style={versionLabelStyle}>Minimum Required:</span>
            <span style={versionValueStyle}>{versionInfo.minimum}</span>
          </div>
          <div style={{ height: '1px', background: M.border, margin: '4px 0' }} />
          <div style={versionRowStyle}>
            <span style={versionLabelStyle}>Latest Version:</span>
            <span style={versionValueStyle}>{versionInfo.current}</span>
          </div>
        </div>

        {/* Download Button */}
        <button
          type="button"
          style={downloadButtonStyle}
          onClick={onDownload}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = M.accentHv
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = `0 6px 24px ${M.accent}66`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = M.accent
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = `0 4px 16px ${M.accent}44`
          }}
          data-testid={testId ? `${testId}-download-button` : 'update-modal-download-button'}
        >
          <Download size={18} aria-hidden="true" />
          Download Update
        </button>

        {/* Release Notes (optional) */}
        {versionInfo.releaseNotes && (
          <div style={releaseNotesStyle}>
            <div style={releaseNotesTitleStyle}>Release Notes</div>
            <div>{versionInfo.releaseNotes}</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UpdateModal
