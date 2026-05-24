/**
 * UpdateModal — Mandatory update modal component
 *
 * Displays a blocking modal when a mandatory launcher update is required.
 * Prevents all UI interaction except the update modal itself.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10
 */

import React from 'react'
import { AlertCircle, Download } from 'lucide-react'

// Design tokens (matching App.tsx)
const M = {
  bg: '#080c12',
  border: 'rgba(255,255,255,0.12)',
  accent: '#1bd96a',
  accentHv: '#17c45e',
  text: 'rgba(255,255,255,0.97)',
  textSub: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.38)',
  red: '#f85149',
  radius: '14px',
  radiusSm: '10px',
  radiusLg: '18px',
}

export interface UpdateModalProps {
  /** Version information from the backend */
  versionInfo: {
    current: string
    minimum: string
    downloadUrl: string
    releaseNotes?: string
  }
  /** Current local version of the launcher */
  currentVersion: string
  /** Callback when user clicks "Download Update" button */
  onDownload: () => void
}

/**
 * UpdateModal component
 *
 * Displays a blocking modal that covers the entire launcher UI when a mandatory
 * update is required. The modal cannot be closed and blocks all interaction
 * with the launcher until the user downloads the update.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10
 */
export const UpdateModal: React.FC<UpdateModalProps> = ({
  versionInfo,
  currentVersion,
  onDownload,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 300ms ease',
      }}
      // Prevent any clicks from propagating through the overlay
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Block ESC key to prevent closing
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      {/* Modal card */}
      <div
        style={{
          width: '480px',
          maxWidth: '90vw',
          padding: '40px',
          background: 'rgba(255,255,255,0.055)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: `1px solid ${M.border}`,
          borderRadius: M.radiusLg,
          boxShadow:
            '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06) inset',
          textAlign: 'center',
        }}
      >
        {/* Alert icon */}
        <div
          style={{
            width: '72px',
            height: '72px',
            margin: '0 auto 24px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${M.accent}22, ${M.accent}11)`,
            border: `2px solid ${M.accent}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 8px 32px ${M.accent}33`,
          }}
        >
          <AlertCircle size={36} color={M.accent} />
        </div>

        {/* Title */}
        <h2
          style={{
            margin: '0 0 12px',
            fontSize: '24px',
            fontWeight: 800,
            color: M.text,
            letterSpacing: '-0.02em',
          }}
        >
          Atualização Obrigatória
        </h2>

        {/* Description */}
        <p
          style={{
            margin: '0 0 28px',
            fontSize: '15px',
            color: M.textSub,
            lineHeight: 1.6,
          }}
        >
          Sua versão do launcher está desatualizada e precisa ser atualizada
          para continuar. Por favor, baixe a versão mais recente.
        </p>

        {/* Version information */}
        <div
          style={{
            padding: '20px',
            borderRadius: M.radius,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${M.border}`,
            marginBottom: '28px',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '12px',
              fontSize: '14px',
            }}
          >
            <span style={{ color: M.textMuted, fontWeight: 500 }}>
              Versão atual:
            </span>
            <span
              style={{
                color: M.red,
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            >
              {currentVersion}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '12px',
              fontSize: '14px',
            }}
          >
            <span style={{ color: M.textMuted, fontWeight: 500 }}>
              Versão mínima:
            </span>
            <span
              style={{
                color: M.accent,
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            >
              {versionInfo.minimum}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
            }}
          >
            <span style={{ color: M.textMuted, fontWeight: 500 }}>
              Versão mais recente:
            </span>
            <span
              style={{
                color: M.accent,
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            >
              {versionInfo.current}
            </span>
          </div>
        </div>

        {/* Release notes (if available) */}
        {versionInfo.releaseNotes && (
          <div
            style={{
              padding: '16px',
              borderRadius: M.radius,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${M.border}`,
              marginBottom: '28px',
              textAlign: 'left',
              maxHeight: '120px',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: M.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Notas da versão
            </div>
            <div
              style={{
                fontSize: '13px',
                color: M.textSub,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {versionInfo.releaseNotes}
            </div>
          </div>
        )}

        {/* Download button */}
        <button
          onClick={onDownload}
          style={{
            width: '100%',
            padding: '14px 24px',
            background: M.accent,
            border: 'none',
            borderRadius: M.radius,
            color: '#fff',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: `0 6px 24px ${M.accent}55`,
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = M.accentHv
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = `0 8px 32px ${M.accent}66`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = M.accent
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = `0 6px 24px ${M.accent}55`
          }}
        >
          <Download size={18} />
          Baixar Atualização
        </button>

        {/* Info text */}
        <p
          style={{
            margin: '16px 0 0',
            fontSize: '12px',
            color: M.textMuted,
            lineHeight: 1.5,
          }}
        >
          O launcher será fechado após o download. Instale a nova versão e
          reinicie o launcher.
        </p>
      </div>
    </div>
  )
}
