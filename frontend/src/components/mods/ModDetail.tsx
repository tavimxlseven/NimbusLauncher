/**
 * ModDetail — full detail view for a mod or modpack.
 *
 * Sections that are absent (undefined / null / empty) are omitted entirely
 * without displaying an error (Requirement 1.5).
 *
 * Uses exclusively Lucide React icons (Requirement 7.2):
 *  - `Download`     — download count
 *  - `ExternalLink` — source link
 *  - `Tag`          — categories / tags
 *  - `Layers`       — dependencies section header
 *  - `Image`        — screenshots section header
 *  - `Info`         — description section header
 *  - `Package`      — versions section header
 *
 * Requirements: 1.4, 1.5
 */

import React, { CSSProperties } from 'react'
import {
  Download,
  ExternalLink,
  Tag,
  Layers,
  Image,
  Info,
  Package,
} from 'lucide-react'
import GlassPanel from '../layout/GlassPanel'
import { ModSource } from './ModCard'

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface ModVersion {
  /** Version identifier */
  id: string
  /** Human-readable version name */
  name: string
  /** Minecraft game version(s) this release targets */
  gameVersions?: string[]
  /** Mod loader(s) this release supports */
  loaders?: string[]
  /** Release date (ISO string) */
  releaseDate?: string
}

export interface ModDependency {
  /** Dependency mod identifier */
  id: string
  /** Dependency display name */
  name: string
  /** Whether the dependency is required or optional */
  required: boolean
}

export interface ModDetailProps {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Origin platform */
  source: ModSource
  /** Full description (optional — section omitted if absent, Requirement 1.5) */
  description?: string
  /** Total download count (optional — omitted if absent, Requirement 1.5) */
  downloadCount?: number
  /** Available versions (optional — section omitted if absent, Requirement 1.5) */
  versions?: ModVersion[]
  /** Mod dependencies (optional — section omitted if absent, Requirement 1.5) */
  dependencies?: ModDependency[]
  /** Screenshot URLs (optional — section omitted if absent, Requirement 1.5) */
  screenshots?: string[]
  /** Category / tag labels (optional — omitted if absent, Requirement 1.5) */
  categories?: string[]
  /** External URL to the mod page on the source platform */
  externalUrl?: string
  /** Thumbnail / icon URL (optional — omitted if absent, Requirement 1.5) */
  imageUrl?: string
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

/* ── Styles ─────────────────────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'clamp(16px, 3vw, 24px)',
  padding: 'clamp(16px, 3vw, 28px)',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '16px',
  flexWrap: 'wrap',
}

const headerIconStyle: CSSProperties = {
  width: 'clamp(56px, 8vw, 80px)',
  height: 'clamp(56px, 8vw, 80px)',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  objectFit: 'cover',
  flexShrink: 0,
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
}

const headerIconPlaceholderStyle: CSSProperties = {
  ...headerIconStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.12))',
  fontSize: '2rem',
  userSelect: 'none',
}

const headerInfoStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  flex: 1,
  minWidth: 0,
}

const titleStyle: CSSProperties = {
  fontSize: 'clamp(20px, 3vw, 28px)',
  fontWeight: 700,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  margin: 0,
  lineHeight: 1.2,
}

const metaRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
}

const sourceBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 600,
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.12))',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.7))',
  textTransform: 'capitalize',
}

const downloadBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '13px',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
}

const externalLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '13px',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
  textDecoration: 'none',
  borderBottom: '1px solid transparent',
  transition: 'color var(--glass-transition, 200ms ease), border-color var(--glass-transition, 200ms ease)',
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: 'clamp(13px, 1.8vw, 15px)',
  fontWeight: 600,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.9))',
  paddingBottom: '8px',
  borderBottom: '1px solid var(--glass-border, rgba(255,255,255,0.15))',
}

const descriptionTextStyle: CSSProperties = {
  fontSize: 'clamp(13px, 1.8vw, 15px)',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.75))',
  lineHeight: 1.7,
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const tagsContainerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
}

const tagStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 500,
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.1))',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.7))',
}

const versionsListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const versionItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 14px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.15))',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.08))',
  flexWrap: 'wrap',
}

const versionNameStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--glass-text-primary, rgba(255,255,255,0.9))',
}

const versionMetaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

const versionTagStyle: CSSProperties = {
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '999px',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.15))',
  color: 'var(--glass-text-muted, rgba(255,255,255,0.5))',
}

const dependenciesListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const dependencyItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 14px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.15))',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.08))',
}

const dependencyNameStyle: CSSProperties = {
  fontSize: '14px',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.9))',
}

const requiredBadgeStyle: CSSProperties = {
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '999px',
  fontWeight: 600,
  background: 'rgba(255, 100, 80, 0.18)',
  border: '1px solid rgba(255, 100, 80, 0.35)',
  color: 'rgba(255, 150, 130, 0.95)',
}

const optionalBadgeStyle: CSSProperties = {
  fontSize: '11px',
  padding: '2px 8px',
  borderRadius: '999px',
  fontWeight: 600,
  background: 'rgba(100, 200, 255, 0.12)',
  border: '1px solid rgba(100, 200, 255, 0.25)',
  color: 'rgba(140, 210, 255, 0.85)',
}

const screenshotsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(140px, 20vw, 220px), 1fr))',
  gap: '12px',
}

const screenshotStyle: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 9',
  objectFit: 'cover',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.15))',
  display: 'block',
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

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

/**
 * Full detail view for a mod or modpack.
 *
 * Every optional section (description, versions, dependencies, screenshots,
 * categories) is omitted entirely when the corresponding prop is absent or
 * empty — no placeholder text or error is shown (Requirement 1.5).
 */
const ModDetail: React.FC<ModDetailProps> = ({
  id,
  name,
  source,
  description,
  downloadCount,
  versions,
  dependencies,
  screenshots,
  categories,
  externalUrl,
  imageUrl,
  className = '',
  'data-testid': testId,
}) => {
  const hasDescription = description != null && description.length > 0
  const hasVersions = versions != null && versions.length > 0
  const hasDependencies = dependencies != null && dependencies.length > 0
  const hasScreenshots = screenshots != null && screenshots.length > 0
  const hasCategories = categories != null && categories.length > 0

  return (
    <GlassPanel
      className={`mod-detail${className ? ` ${className}` : ''}`}
      data-testid={testId ?? `mod-detail-${id}`}
    >
      <div style={containerStyle}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header style={headerStyle}>
          {/* Thumbnail / icon */}
          {imageUrl != null ? (
            <img
              src={imageUrl}
              alt={`${name} icon`}
              style={headerIconStyle}
            />
          ) : (
            <div style={headerIconPlaceholderStyle} aria-hidden="true">
              🧩
            </div>
          )}

          <div style={headerInfoStyle}>
            <h1 style={titleStyle}>{name}</h1>

            <div style={metaRowStyle}>
              {/* Source badge */}
              <span
                style={sourceBadgeStyle}
                aria-label={`Fonte: ${source}`}
              >
                <ExternalLink size={12} aria-hidden="true" />
                {source}
              </span>

              {/* Download count — omitted if absent (Requirement 1.5) */}
              {downloadCount != null && (
                <span
                  style={downloadBadgeStyle}
                  aria-label={`${downloadCount} downloads`}
                >
                  <Download size={14} aria-hidden="true" />
                  {formatDownloads(downloadCount)} downloads
                </span>
              )}

              {/* External link — omitted if absent (Requirement 1.5) */}
              {externalUrl != null && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={externalLinkStyle}
                  aria-label={`Ver ${name} em ${source}`}
                  className="mod-detail__external-link"
                >
                  <ExternalLink size={13} aria-hidden="true" />
                  Ver na fonte
                </a>
              )}
            </div>

            {/* Categories / tags — omitted if absent (Requirement 1.5) */}
            {hasCategories && (
              <div style={tagsContainerStyle} aria-label="Categorias">
                {categories!.map((cat) => (
                  <span key={cat} style={tagStyle}>
                    <Tag size={11} aria-hidden="true" />
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* ── Description — omitted if absent (Requirement 1.5) ─────── */}
        {hasDescription && (
          <section
            style={sectionStyle}
            aria-label="Descrição"
            data-testid={`${testId ?? `mod-detail-${id}`}-description`}
          >
            <div style={sectionHeaderStyle}>
              <Info size={16} aria-hidden="true" />
              <span>Descrição</span>
            </div>
            <p style={descriptionTextStyle}>{description}</p>
          </section>
        )}

        {/* ── Versions — omitted if absent (Requirement 1.5) ───────── */}
        {hasVersions && (
          <section
            style={sectionStyle}
            aria-label="Versões disponíveis"
            data-testid={`${testId ?? `mod-detail-${id}`}-versions`}
          >
            <div style={sectionHeaderStyle}>
              <Package size={16} aria-hidden="true" />
              <span>Versões disponíveis</span>
            </div>
            <ul style={versionsListStyle} role="list">
              {versions!.map((v) => (
                <li key={v.id} style={versionItemStyle} role="listitem">
                  <span style={versionNameStyle}>{v.name}</span>
                  <div style={versionMetaStyle}>
                    {v.gameVersions?.map((gv) => (
                      <span key={gv} style={versionTagStyle}>
                        {gv}
                      </span>
                    ))}
                    {v.loaders?.map((loader) => (
                      <span key={loader} style={versionTagStyle}>
                        {loader}
                      </span>
                    ))}
                    {v.releaseDate && (
                      <span
                        style={{ ...versionTagStyle, borderColor: 'transparent' }}
                        aria-label={`Lançado em ${formatDate(v.releaseDate)}`}
                      >
                        {formatDate(v.releaseDate)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Dependencies — omitted if absent (Requirement 1.5) ────── */}
        {hasDependencies && (
          <section
            style={sectionStyle}
            aria-label="Dependências"
            data-testid={`${testId ?? `mod-detail-${id}`}-dependencies`}
          >
            <div style={sectionHeaderStyle}>
              <Layers size={16} aria-hidden="true" />
              <span>Dependências</span>
            </div>
            <ul style={dependenciesListStyle} role="list">
              {dependencies!.map((dep) => (
                <li key={dep.id} style={dependencyItemStyle} role="listitem">
                  <span style={dependencyNameStyle}>{dep.name}</span>
                  <span
                    style={dep.required ? requiredBadgeStyle : optionalBadgeStyle}
                    aria-label={dep.required ? 'Obrigatório' : 'Opcional'}
                  >
                    {dep.required ? 'Obrigatório' : 'Opcional'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Screenshots — omitted if absent (Requirement 1.5) ─────── */}
        {hasScreenshots && (
          <section
            style={sectionStyle}
            aria-label="Capturas de tela"
            data-testid={`${testId ?? `mod-detail-${id}`}-screenshots`}
          >
            <div style={sectionHeaderStyle}>
              <Image size={16} aria-hidden="true" />
              <span>Capturas de tela</span>
            </div>
            <div style={screenshotsGridStyle} role="list" aria-label="Capturas de tela">
              {screenshots!.map((url, idx) => (
                <div key={url} role="listitem">
                  <img
                    src={url}
                    alt={`Captura de tela ${idx + 1} de ${name}`}
                    style={screenshotStyle}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Hover style for external link ─────────────────────────────── */}
      <style>{`
        .mod-detail__external-link:hover {
          color: var(--glass-text-primary, rgba(255,255,255,0.95));
          border-bottom-color: var(--glass-border-hover, rgba(255,255,255,0.35));
        }
      `}</style>
    </GlassPanel>
  )
}

export default ModDetail
