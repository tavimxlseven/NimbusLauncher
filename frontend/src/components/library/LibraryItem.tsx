/**
 * LibraryItem — individual library item component.
 *
 * Renders a single mod or modpack saved in the user's library using
 * GlassPanel as the visual base. Uses exclusively Lucide React icons
 * (Requirement 7.2):
 *  - `Package`  — icon for mods
 *  - `Layers`   — icon for modpacks
 *  - `Trash2`   — remove button
 *
 * Requirements: 4.3, 4.4
 */

import React, { CSSProperties } from 'react'
import { Package, Layers, Trash2 } from 'lucide-react'
import GlassPanel from '../layout/GlassPanel'

export type LibraryItemSource = 'curseforge' | 'modrinth'
export type LibraryItemType = 'mod' | 'modpack'

export interface LibraryItemProps {
  /** Unique identifier of the library entry */
  id: string | number
  /** Display name of the mod or modpack */
  name: string
  /** Origin platform */
  source: LibraryItemSource
  /** Whether this entry is a mod or a modpack */
  itemType: LibraryItemType
  /** Version string, if available */
  version?: string
  /** Mod loader (fabric, forge, etc.) */
  loader?: string
  /** Minecraft version */
  mcVersion?: string
  /** Cover image URL */
  imageUrl?: string
  /** Short description */
  description?: string
  /** External ID from the source platform */
  externalId?: string
  /** ISO date string when the item was added */
  addedAt?: string
  /** Called when the user clicks the remove button */
  onRemove?: (id: string | number) => void
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const itemInnerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  width: '100%',
  boxSizing: 'border-box',
}

const iconWrapperStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  height: '40px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.12))',
  flexShrink: 0,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.9))',
}

const contentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flex: 1,
  minWidth: 0,
}

const nameStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const metaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

const badgeBaseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.02em',
  border: '1px solid transparent',
}

const curseforgeBadgeStyle: CSSProperties = {
  ...badgeBaseStyle,
  background: 'rgba(240, 100, 30, 0.18)',
  borderColor: 'rgba(240, 100, 30, 0.4)',
  color: 'rgba(255, 160, 100, 0.95)',
}

const modrinthBadgeStyle: CSSProperties = {
  ...badgeBaseStyle,
  background: 'rgba(30, 200, 100, 0.18)',
  borderColor: 'rgba(30, 200, 100, 0.4)',
  color: 'rgba(80, 220, 140, 0.95)',
}

const versionStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.55))',
}

const dateStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.45))',
}

const removeButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.15))',
  background: 'transparent',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.5))',
  cursor: 'pointer',
  transition: 'background var(--glass-transition, 200ms ease), color var(--glass-transition, 200ms ease)',
  flexShrink: 0,
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function formatDate(isoString: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(isoString))
  } catch {
    return isoString
  }
}

/* ── Component ───────────────────────────────────────────────────────────── */

const LibraryItem: React.FC<LibraryItemProps> = ({
  id,
  name,
  source,
  itemType,
  version,
  addedAt,
  onRemove,
  className = '',
  'data-testid': testId,
}) => {
  const handleRemove = () => {
    onRemove?.(id)
  }

  const sourceBadgeStyle =
    source === 'curseforge' ? curseforgeBadgeStyle : modrinthBadgeStyle
  const sourceLabel = source === 'curseforge' ? 'CurseForge' : 'Modrinth'

  return (
    <GlassPanel
      className={`library-item${className ? ` ${className}` : ''}`}
      data-testid={testId}
    >
      <div style={itemInnerStyle}>
        {/* ── Item type icon ─────────────────────────────────────────── */}
        <div style={iconWrapperStyle} aria-hidden="true">
          {itemType === 'modpack' ? (
            <Layers size={20} />
          ) : (
            <Package size={20} />
          )}
        </div>

        {/* ── Name + metadata ────────────────────────────────────────── */}
        <div style={contentStyle}>
          <span style={nameStyle} title={name}>
            {name}
          </span>
          <div style={metaStyle}>
            {/* Source badge */}
            <span
              style={sourceBadgeStyle}
              aria-label={`Fonte: ${sourceLabel}`}
            >
              {sourceLabel}
            </span>

            {/* Version */}
            {version && (
              <span style={versionStyle} aria-label={`Versão: ${version}`}>
                {version}
              </span>
            )}

            {/* Added date */}
            {addedAt && (
              <span
                style={dateStyle}
                aria-label={`Adicionado em: ${formatDate(addedAt)}`}
              >
                {formatDate(addedAt)}
              </span>
            )}
          </div>
        </div>

        {/* ── Remove button ──────────────────────────────────────────── */}
        {onRemove && (
          <button
            type="button"
            style={removeButtonStyle}
            onClick={handleRemove}
            aria-label={`Remover ${name} da biblioteca`}
            className="library-item__remove-btn"
          >
            {/* Lucide React icon — Trash2 (Requirement 7.2) */}
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </GlassPanel>
  )
}

export default LibraryItem
