/**
 * AIModpackResult — displays the result of an AI-generated modpack.
 *
 * Shows:
 *  - Modpack name, Minecraft version, loader
 *  - List of selected mods with individual justifications
 *  - Optional mods suggestions (up to 10)
 *  - KubeJS scripts count
 *  - Status badge (generating / completed / failed)
 *  - Error / conflict messages when generation fails
 *
 * Uses exclusively Lucide React icons (Requirement 7.2):
 *  - `Package`       — mod item icon
 *  - `Sparkles`      — header icon
 *  - `CheckCircle`   — completed status
 *  - `XCircle`       — failed status
 *  - `Loader`        — generating status (spinner)
 *  - `Code`          — KubeJS scripts section
 *  - `PlusCircle`    — optional mods section
 *  - `AlertTriangle` — conflict / warning
 *
 * Requirements: 11.1, 11.5
 */

import React, { CSSProperties } from 'react'
import {
  Package,
  Sparkles,
  CheckCircle,
  XCircle,
  Loader,
  Code,
  PlusCircle,
  AlertTriangle,
} from 'lucide-react'
import GlassPanel from '../layout/GlassPanel'

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface GeneratedMod {
  id: string
  name: string
  source: 'curseforge' | 'modrinth'
  version: string
  justification?: string
  isOptional?: boolean
}

export interface AIModpackResultData {
  id: string
  name: string
  minecraftVersion: string
  loader: 'forge' | 'fabric' | 'quilt' | 'neoforge'
  loaderVersion?: string
  status: 'generating' | 'completed' | 'failed'
  mods: GeneratedMod[]
  optionalMods?: GeneratedMod[]
  kubeJsScriptCount?: number
  /** Error message when status === 'failed' */
  errorMessage?: string
  /** List of conflicting mod names when generation failed due to conflicts */
  conflictingMods?: string[]
}

export interface AIModpackResultProps {
  result: AIModpackResultData
  /** Called when the user clicks "Ajustar modpack" */
  onAdjust?: (id: string) => void
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
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
}

const titleGroupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}

const titleStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  margin: 0,
}

const metaStyle: CSSProperties = {
  fontSize: '13px',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
  margin: '4px 0 0',
}

const sectionTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  margin: '0 0 8px',
}

const modListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const modItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  background: 'var(--glass-bg, rgba(255,255,255,0.06))',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
}

const modNameStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.92))',
  margin: 0,
}

const modJustificationStyle: CSSProperties = {
  fontSize: '13px',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.6))',
  margin: '2px 0 0',
}

const modVersionStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--glass-text-muted, rgba(255,255,255,0.4))',
  marginLeft: 'auto',
  flexShrink: 0,
  alignSelf: 'center',
}

const adjustButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 18px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.18))',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
  transition: 'background-color var(--glass-transition, 200ms ease)',
}

const spinnerStyle: CSSProperties = {
  animation: 'ai-result-spin 0.8s linear infinite',
}

/* ── Status badge ────────────────────────────────────────────────────────── */

const STATUS_CONFIG = {
  generating: {
    color: 'rgba(251, 191, 36, 0.9)',
    label: 'Gerando…',
    Icon: Loader,
    iconStyle: spinnerStyle,
  },
  completed: {
    color: 'rgba(52, 211, 153, 0.9)',
    label: 'Concluído',
    Icon: CheckCircle,
    iconStyle: undefined,
  },
  failed: {
    color: 'rgba(251, 113, 133, 0.9)',
    label: 'Falhou',
    Icon: XCircle,
    iconStyle: undefined,
  },
} as const

const StatusBadge: React.FC<{ status: AIModpackResultData['status'] }> = ({ status }) => {
  const { color, label, Icon, iconStyle } = STATUS_CONFIG[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        border: `1px solid ${color}`,
        color,
        fontSize: '13px',
        fontWeight: 600,
        background: `${color.replace('0.9', '0.12')}`,
        flexShrink: 0,
      }}
      aria-label={`Status: ${label}`}
    >
      <Icon size={14} style={iconStyle} aria-hidden="true" />
      {label}
    </span>
  )
}

/* ── Mod item ────────────────────────────────────────────────────────────── */

const ModListItem: React.FC<{ mod: GeneratedMod }> = ({ mod }) => (
  <li style={modItemStyle}>
    <Package
      size={16}
      style={{ color: 'var(--glass-text-secondary, rgba(255,255,255,0.5))', flexShrink: 0, marginTop: 2 }}
      aria-hidden="true"
    />
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={modNameStyle}>{mod.name}</p>
      {mod.justification && (
        <p style={modJustificationStyle}>{mod.justification}</p>
      )}
    </div>
    <span style={modVersionStyle}>{mod.version}</span>
  </li>
)

/* ── Component ───────────────────────────────────────────────────────────── */

const AIModpackResult: React.FC<AIModpackResultProps> = ({
  result,
  onAdjust,
  className = '',
  'data-testid': testId = 'ai-modpack-result',
}) => {
  const {
    id,
    name,
    minecraftVersion,
    loader,
    loaderVersion,
    status,
    mods,
    optionalMods,
    kubeJsScriptCount,
    errorMessage,
    conflictingMods,
  } = result

  const requiredMods = mods.filter((m) => !m.isOptional)

  return (
    <>
      <style>{`
        @keyframes ai-result-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <GlassPanel
        className={`ai-modpack-result${className ? ` ${className}` : ''}`}
        data-testid={testId}
      >
        <div style={containerStyle}>
          {/* ── Header ──────────────────────────────────────────────── */}
          <div style={headerStyle}>
            <div>
              <div style={titleGroupStyle}>
                <Sparkles
                  size={20}
                  style={{ color: 'var(--theme-color, #4F8EF7)', flexShrink: 0 }}
                  aria-hidden="true"
                />
                <h2 style={titleStyle}>{name}</h2>
              </div>
              <p style={metaStyle}>
                Minecraft {minecraftVersion} · {loader}
                {loaderVersion ? ` ${loaderVersion}` : ''}
                {requiredMods.length > 0 ? ` · ${requiredMods.length} mods` : ''}
              </p>
            </div>
            <StatusBadge status={status} />
          </div>

          {/* ── Error / conflict message ─────────────────────────────── */}
          {status === 'failed' && (errorMessage || (conflictingMods && conflictingMods.length > 0)) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: 'var(--glass-radius-sm, 12px)',
                background: 'rgba(251, 113, 133, 0.1)',
                border: '1px solid rgba(251, 113, 133, 0.3)',
              }}
              role="alert"
              data-testid={`${testId}-error`}
            >
              <AlertTriangle
                size={16}
                style={{ color: 'rgba(251, 113, 133, 0.9)', flexShrink: 0, marginTop: 2 }}
                aria-hidden="true"
              />
              <div>
                {errorMessage && (
                  <p style={{ margin: 0, fontSize: '14px', color: 'rgba(251, 113, 133, 0.9)' }}>
                    {errorMessage}
                  </p>
                )}
                {conflictingMods && conflictingMods.length > 0 && (
                  <p style={{ margin: errorMessage ? '6px 0 0' : 0, fontSize: '13px', color: 'rgba(251, 113, 133, 0.75)' }}>
                    Mods conflitantes: {conflictingMods.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Mod list ─────────────────────────────────────────────── */}
          {requiredMods.length > 0 && (
            <section aria-label="Mods selecionados">
              <p style={sectionTitleStyle}>
                <Package size={14} aria-hidden="true" />
                Mods selecionados ({requiredMods.length})
              </p>
              <ul style={modListStyle} data-testid={`${testId}-mods`}>
                {requiredMods.map((mod) => (
                  <ModListItem key={mod.id} mod={mod} />
                ))}
              </ul>
            </section>
          )}

          {/* ── KubeJS scripts count ─────────────────────────────────── */}
          {kubeJsScriptCount !== undefined && kubeJsScriptCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: 'var(--glass-text-secondary, rgba(255,255,255,0.6))',
              }}
              data-testid={`${testId}-kubejs`}
            >
              <Code size={14} aria-hidden="true" />
              {kubeJsScriptCount} script{kubeJsScriptCount !== 1 ? 's' : ''} KubeJS gerado{kubeJsScriptCount !== 1 ? 's' : ''}
            </div>
          )}

          {/* ── Optional mods (up to 10) ─────────────────────────────── */}
          {optionalMods && optionalMods.length > 0 && (
            <section aria-label="Mods opcionais sugeridos">
              <p style={sectionTitleStyle}>
                <PlusCircle size={14} aria-hidden="true" />
                Mods opcionais sugeridos ({optionalMods.length})
              </p>
              <ul style={modListStyle} data-testid={`${testId}-optional-mods`}>
                {optionalMods.slice(0, 10).map((mod) => (
                  <ModListItem key={mod.id} mod={mod} />
                ))}
              </ul>
            </section>
          )}

          {/* ── Adjust button ─────────────────────────────────────────── */}
          {status === 'completed' && onAdjust && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => onAdjust(id)}
                style={adjustButtonStyle}
                aria-label="Ajustar modpack gerado"
                data-testid={`${testId}-adjust-btn`}
              >
                <Sparkles size={16} aria-hidden="true" />
                Ajustar modpack
              </button>
            </div>
          )}
        </div>
      </GlassPanel>
    </>
  )
}

export default AIModpackResult
