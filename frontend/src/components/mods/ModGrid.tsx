/**
 * ModGrid — paginated responsive grid of ModCards.
 *
 * Responsive columns:
 *  - 1 col  on mobile  (< 640px)
 *  - 2 cols on tablet  (640px – 1023px)
 *  - 3 cols on desktop (1024px – 1535px)
 *  - 4 cols on wide    (≥ 1536px)
 *
 * Shows skeleton cards while loading and an empty-state message when the
 * items array is empty.
 *
 * Requirements: 1.3, 1.7, 1.8
 */

import React, { CSSProperties } from 'react'
import GlassPanel from '../layout/GlassPanel'
import ModCard, { ModCardProps } from './ModCard'

export interface ModGridProps {
  /** Array of mod/modpack items to display */
  items: ModCardProps[]
  /** Show skeleton loading state */
  loading?: boolean
  /** Current page (1-indexed) */
  page: number
  /** Total number of pages */
  totalPages: number
  /** Called when the user navigates to a different page */
  onPageChange: (page: number) => void
  /** Message shown when items is empty and not loading */
  emptyMessage?: string
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

/* ── Styles ─────────────────────────────────────────────────────────────── */

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: 'clamp(12px, 2vw, 20px)',
  width: '100%',
}

const emptyStateStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'clamp(32px, 6vw, 64px) clamp(16px, 4vw, 32px)',
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.65))',
  fontSize: 'clamp(14px, 2vw, 16px)',
  textAlign: 'center',
}

const paginationStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  marginTop: 'clamp(16px, 3vw, 24px)',
  flexWrap: 'wrap',
}

const pageButtonBaseStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '36px',
  height: '36px',
  padding: '0 10px',
  borderRadius: 'var(--glass-radius-sm, 12px)',
  border: '1px solid var(--glass-border, rgba(255,255,255,0.2))',
  background: 'var(--glass-bg, rgba(255,255,255,0.15))',
  color: 'var(--glass-text-primary, rgba(255,255,255,0.95))',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500,
  transition: 'background var(--glass-transition, 200ms ease)',
  backdropFilter: 'blur(var(--glass-blur, 16px))',
  WebkitBackdropFilter: 'blur(var(--glass-blur, 16px))',
}

const pageButtonActiveStyle: CSSProperties = {
  ...pageButtonBaseStyle,
  background: 'var(--glass-bg-active, rgba(255,255,255,0.28))',
  borderColor: 'var(--glass-border-hover, rgba(255,255,255,0.35))',
  fontWeight: 700,
}

const pageButtonDisabledStyle: CSSProperties = {
  ...pageButtonBaseStyle,
  opacity: 0.4,
  cursor: 'not-allowed',
}

/* ── Skeleton card ───────────────────────────────────────────────────────── */

const SkeletonCard: React.FC = () => (
  <GlassPanel
    style={{ overflow: 'hidden', padding: 0 }}
    data-testid="mod-card-skeleton"
    aria-hidden="true"
  >
    <div
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        background: 'var(--glass-bg-hover, rgba(255,255,255,0.22))',
        animation: 'mod-grid-pulse 1.5s ease-in-out infinite',
      }}
    />
    <div style={{ padding: 'clamp(12px, 2vw, 16px)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div
        style={{
          height: '16px',
          width: '70%',
          borderRadius: '8px',
          background: 'var(--glass-bg-hover, rgba(255,255,255,0.22))',
          animation: 'mod-grid-pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          height: '12px',
          width: '90%',
          borderRadius: '8px',
          background: 'var(--glass-bg-hover, rgba(255,255,255,0.22))',
          animation: 'mod-grid-pulse 1.5s ease-in-out infinite 0.2s',
        }}
      />
      <div
        style={{
          height: '12px',
          width: '60%',
          borderRadius: '8px',
          background: 'var(--glass-bg-hover, rgba(255,255,255,0.22))',
          animation: 'mod-grid-pulse 1.5s ease-in-out infinite 0.4s',
        }}
      />
    </div>
  </GlassPanel>
)

/* ── Pagination helpers ──────────────────────────────────────────────────── */

/** Returns an array of page numbers and ellipsis markers to render. */
function buildPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')

  pages.push(total)

  return pages
}

/* ── Component ───────────────────────────────────────────────────────────── */

/**
 * Responsive paginated grid of ModCards.
 *
 * - Shows skeleton cards while `loading` is true
 * - Shows `emptyMessage` when `items` is empty and not loading
 * - Responsive grid: 1 → 2 → 3 → 4 columns across breakpoints
 */
const ModGrid: React.FC<ModGridProps> = ({
  items,
  loading = false,
  page,
  totalPages,
  onPageChange,
  emptyMessage = 'Nenhum resultado encontrado',
  className = '',
  'data-testid': testId,
}) => {
  const skeletonCount = 8

  const showEmpty = !loading && items.length === 0

  return (
    <div
      className={`mod-grid${className ? ` ${className}` : ''}`}
      data-testid={testId ?? 'mod-grid'}
    >
      {/* ── Responsive grid CSS ─────────────────────────────────────── */}
      <style>{`
        .mod-grid__items {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .mod-grid__items {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .mod-grid__items {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (min-width: 1536px) {
          .mod-grid__items {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        @keyframes mod-grid-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* ── Loading skeletons ────────────────────────────────────────── */}
      {loading && (
        <div
          className="mod-grid__items"
          style={gridStyle}
          aria-busy="true"
          aria-label="Loading mods"
        >
          {Array.from({ length: skeletonCount }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {showEmpty && (
        <div style={emptyStateStyle} role="status" aria-live="polite">
          {emptyMessage}
        </div>
      )}

      {/* ── Items grid ───────────────────────────────────────────────── */}
      {!loading && items.length > 0 && (
        <div
          className="mod-grid__items"
          style={gridStyle}
          role="list"
          aria-label="Mod list"
        >
          {items.map((item) => (
            <div key={item.id} role="listitem">
              <ModCard {...item} />
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <nav
          style={paginationStyle}
          aria-label="Pagination"
          data-testid="mod-grid-pagination"
        >
          {/* Previous */}
          <button
            type="button"
            style={page <= 1 ? pageButtonDisabledStyle : pageButtonBaseStyle}
            onClick={() => page > 1 && onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            ‹
          </button>

          {/* Page numbers */}
          {buildPageRange(page, totalPages).map((p, idx) =>
            p === '...' ? (
              <span
                key={`ellipsis-${idx}`}
                style={{ color: 'var(--glass-text-muted, rgba(255,255,255,0.4))', padding: '0 4px' }}
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                style={p === page ? pageButtonActiveStyle : pageButtonBaseStyle}
                onClick={() => p !== page && onPageChange(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            ),
          )}

          {/* Next */}
          <button
            type="button"
            style={page >= totalPages ? pageButtonDisabledStyle : pageButtonBaseStyle}
            onClick={() => page < totalPages && onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            ›
          </button>
        </nav>
      )}
    </div>
  )
}

export default ModGrid
