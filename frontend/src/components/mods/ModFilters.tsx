/**
 * ModFilters — filter panel that updates results without page reload.
 *
 * Calls `onChange` on every filter change (controlled component).
 * No form submission or page navigation is triggered.
 *
 * Uses exclusively Lucide React icons:
 *  - `Filter` — panel header icon
 *
 * Requirements: 1.3
 */

import React, { CSSProperties } from 'react'
import { Filter } from 'lucide-react'
import GlassPanel from '../layout/GlassPanel'

export type FilterSource = 'curseforge' | 'modrinth' | 'both'
export type FilterLoader = 'forge' | 'fabric' | 'quilt' | 'neoforge' | 'any'

export interface ModFiltersValue {
  /** Platform source filter */
  source: FilterSource
  /** Minecraft game version (free text) */
  gameVersion: string
  /** Mod loader */
  loader: FilterLoader
  /** Category (free text) */
  category: string
}

export interface ModFiltersProps {
  /** Current filter values (controlled) */
  filters: ModFiltersValue
  /**
   * Called on every filter change — no page reload.
   * (Requirement 1.3)
   */
  onChange: (filters: ModFiltersValue) => void
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

/* ── Default filter values ───────────────────────────────────────────────── */

export const DEFAULT_FILTERS: ModFiltersValue = {
  source: 'both',
  gameVersion: '',
  loader: 'any',
  category: '',
}

/* ── Styles ─────────────────────────────────────────────────────────────── */

const panelStyle: CSSProperties = {
  padding: 'clamp(12px, 2vw, 20px)',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '16px',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  fontSize: 'clamp(13px, 1.8vw, 15px)',
  fontWeight: 600,
}

const fieldsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const labelStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const inputBaseStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.22))',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  fontSize: '14px',
  outline: 'none',
  backdropFilter: 'blur(var(--glass-blur, 16px))',
  WebkitBackdropFilter: 'blur(var(--glass-blur, 16px))',
  transition: 'border-color var(--glass-transition, 200ms ease)',
  boxSizing: 'border-box',
}

/* ── Component ───────────────────────────────────────────────────────────── */

/**
 * Controlled filter panel.
 *
 * Every change immediately calls `onChange` with the updated filter object —
 * no form submission, no page reload (Requirement 1.3).
 */
const ModFilters: React.FC<ModFiltersProps> = ({
  filters,
  onChange,
  className = '',
  'data-testid': testId,
}) => {
  /* ── Partial update helper ─────────────────────────────────────────── */
  const update = <K extends keyof ModFiltersValue>(
    key: K,
    value: ModFiltersValue[K],
  ) => {
    onChange({ ...filters, [key]: value })
  }

  return (
    <GlassPanel
      className={`mod-filters${className ? ` ${className}` : ''}`}
      style={panelStyle}
      data-testid={testId ?? 'mod-filters'}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={headerStyle} aria-hidden="true">
        {/* Lucide React icon — Filter (Requirement 7.2) */}
        <Filter size={16} aria-hidden="true" />
        <span>Filtros</span>
      </div>

      <div style={fieldsStyle} role="group" aria-label="Filtros de busca">
        {/* ── Source ────────────────────────────────────────────────── */}
        <div style={fieldStyle}>
          <label htmlFor="mod-filter-source" style={labelStyle}>
            Fonte
          </label>
          <select
            id="mod-filter-source"
            value={filters.source}
            onChange={(e) => update('source', e.target.value as FilterSource)}
            style={inputBaseStyle}
            aria-label="Filtrar por fonte"
          >
            <option value="both">CurseForge + Modrinth</option>
            <option value="curseforge">CurseForge</option>
            <option value="modrinth">Modrinth</option>
          </select>
        </div>

        {/* ── Game version ──────────────────────────────────────────── */}
        <div style={fieldStyle}>
          <label htmlFor="mod-filter-version" style={labelStyle}>
            Versão do Minecraft
          </label>
          <input
            id="mod-filter-version"
            type="text"
            value={filters.gameVersion}
            onChange={(e) => update('gameVersion', e.target.value)}
            placeholder="ex: 1.20.1"
            style={inputBaseStyle}
            aria-label="Filtrar por versão do Minecraft"
          />
        </div>

        {/* ── Loader ────────────────────────────────────────────────── */}
        <div style={fieldStyle}>
          <label htmlFor="mod-filter-loader" style={labelStyle}>
            Loader
          </label>
          <select
            id="mod-filter-loader"
            value={filters.loader}
            onChange={(e) => update('loader', e.target.value as FilterLoader)}
            style={inputBaseStyle}
            aria-label="Filtrar por loader"
          >
            <option value="any">Qualquer</option>
            <option value="forge">Forge</option>
            <option value="fabric">Fabric</option>
            <option value="quilt">Quilt</option>
            <option value="neoforge">NeoForge</option>
          </select>
        </div>

        {/* ── Category ──────────────────────────────────────────────── */}
        <div style={fieldStyle}>
          <label htmlFor="mod-filter-category" style={labelStyle}>
            Categoria
          </label>
          <input
            id="mod-filter-category"
            type="text"
            value={filters.category}
            onChange={(e) => update('category', e.target.value)}
            placeholder="ex: tecnologia, magia"
            style={inputBaseStyle}
            aria-label="Filtrar por categoria"
          />
        </div>
      </div>

      {/* ── Focus ring CSS ──────────────────────────────────────────── */}
      <style>{`
        .mod-filters select:focus,
        .mod-filters input:focus {
          border-color: var(--glass-border-hover, rgba(255,255,255,0.35));
          outline: 2px solid var(--glass-border-hover, rgba(255,255,255,0.35));
          outline-offset: 1px;
        }
        .mod-filters select option {
          background: rgba(20, 20, 30, 0.95);
          color: rgba(255, 255, 255, 0.92);
        }
      `}</style>
    </GlassPanel>
  )
}

export default ModFilters
