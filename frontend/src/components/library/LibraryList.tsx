/**
 * LibraryList — list of library items.
 *
 * Renders the user's saved mods and modpacks ordered by `addedAt` descending.
 * When the list is empty, displays the required empty-state message
 * "Nenhum item na sua biblioteca ainda" (Requirement 4.5).
 * When loading, renders skeleton placeholders.
 *
 * Uses exclusively Lucide React icons (Requirement 7.2):
 *  - `BookOpen` — empty-state illustration icon
 *
 * Requirements: 4.4, 4.5
 */

import React, { CSSProperties } from 'react'
import { BookOpen } from 'lucide-react'
import GlassPanel from '../layout/GlassPanel'
import LibraryItem from './LibraryItem'
import type { LibraryItemProps } from './LibraryItem'

export type LibraryListItem = Omit<LibraryItemProps, 'onRemove' | 'className' | 'data-testid'>

export interface LibraryListProps {
  /** Array of library items to display */
  items: LibraryListItem[]
  /** When true, renders skeleton loading state */
  loading?: boolean
  /** Called when the user removes an item; receives the item id */
  onRemove?: (id: string | number) => void
  /** Additional CSS class names */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

const listContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  width: '100%',
}

const emptyStateStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '16px',
  padding: '48px 24px',
  textAlign: 'center',
}

const emptyIconStyle: CSSProperties = {
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.35))',
  opacity: 0.7,
}

const emptyTextStyle: CSSProperties = {
  fontSize: '15px',
  fontWeight: 500,
  color: 'var(--glass-text-secondary, rgba(255,255,255,0.5))',
  margin: 0,
}

const skeletonItemStyle: CSSProperties = {
  height: '64px',
  borderRadius: 'var(--glass-radius, 16px)',
  background: 'var(--glass-bg-hover, rgba(255,255,255,0.08))',
  animation: 'library-skeleton-pulse 1.4s ease-in-out infinite',
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

const SKELETON_COUNT = 4

const SkeletonItem: React.FC<{ index: number }> = ({ index }) => (
  <div
    style={{
      ...skeletonItemStyle,
      animationDelay: `${index * 0.1}s`,
    }}
    aria-hidden="true"
    role="presentation"
  />
)

/* ── Component ───────────────────────────────────────────────────────────── */

/**
 * Sorts items by `addedAt` descending (most recently added first).
 * Items without `addedAt` are placed at the end.
 */
function sortByAddedAtDesc(items: LibraryListItem[]): LibraryListItem[] {
  return [...items].sort((a, b) => {
    if (!a.addedAt && !b.addedAt) return 0
    if (!a.addedAt) return 1
    if (!b.addedAt) return -1
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  })
}

const LibraryList: React.FC<LibraryListProps> = ({
  items,
  loading = false,
  onRemove,
  className = '',
  'data-testid': testId,
}) => {
  return (
    <>
      {/* Skeleton pulse keyframes injected once */}
      <style>{`
        @keyframes library-skeleton-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>

      <div
        className={`library-list${className ? ` ${className}` : ''}`}
        style={listContainerStyle}
        data-testid={testId}
        aria-label="Biblioteca"
        aria-busy={loading}
      >
        {/* ── Loading skeleton ──────────────────────────────────────── */}
        {loading && (
          <div
            role="status"
            aria-label="Carregando biblioteca…"
            style={listContainerStyle}
          >
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <SkeletonItem key={i} index={i} />
            ))}
          </div>
        )}

        {/* ── Empty state (Requirement 4.5) ─────────────────────────── */}
        {!loading && items.length === 0 && (
          <GlassPanel data-testid={testId ? `${testId}-empty` : undefined}>
            <div style={emptyStateStyle}>
              {/* Lucide React icon — BookOpen (Requirement 7.2) */}
              <BookOpen
                size={48}
                style={emptyIconStyle}
                aria-hidden="true"
              />
              <p style={emptyTextStyle}>
                Nenhum item na sua biblioteca ainda
              </p>
            </div>
          </GlassPanel>
        )}

        {/* ── Item list ordered by addedAt desc (Requirement 4.4) ───── */}
        {!loading && items.length > 0 && (
          <ul
            style={{ listStyle: 'none', margin: 0, padding: 0, ...listContainerStyle }}
            aria-label="Itens da biblioteca"
          >
            {sortByAddedAtDesc(items).map((item) => (
              <li key={item.id}>
                <LibraryItem
                  {...item}
                  onRemove={onRemove}
                  data-testid={testId ? `${testId}-item-${item.id}` : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default LibraryList
