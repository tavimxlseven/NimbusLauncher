/**
 * App.tsx — Nimbus Launcher
 * Modrinth-inspired design: dark, compact, full-width.
 */

import React, {
  CSSProperties, useCallback, useEffect, useRef, useState,
} from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Search, Library, Home, Layers, Settings, LogOut,
  Download, Heart, Clock, ChevronRight, ChevronDown, ChevronUp,
  Package, BookOpen, AlertCircle, Loader, Filter, X,
  Zap, Globe, Map, Sparkles, Archive,
} from 'lucide-react'

import GlassModal from './components/layout/GlassModal'
import GlassSelect from './components/ui/GlassSelect'
import LoginButton from './components/auth/LoginButton'
import ModDetail from './components/mods/ModDetail'
import LibraryList from './components/library/LibraryList'
import ThemeSwitcher from './components/theme/ThemeSwitcher'
import { applyTheme, savePreference, ThemeConfig } from './services/ThemeService'
import type { LibraryListItem } from './components/library/LibraryList'

// ── Types ─────────────────────────────────────────────────────────────────────

interface User { id: number; username: string; avatar_url?: string }

interface ModItem {
  id: string; name: string; description?: string
  downloadCount?: number; source: 'curseforge' | 'modrinth'
  imageUrl?: string; categories?: string[]; author?: string
  follows?: number; updatedAt?: string; itemType?: 'mod' | 'modpack'
}

interface ModDetailData extends ModItem {
  versions?: Array<{ id: string; name: string; gameVersions?: string[]; loaders?: string[] }>
  dependencies?: Array<{ id: string; name: string; required: boolean }>
  screenshots?: string[]
  externalUrl?: string
}

// ── Design tokens (Modrinth + iOS LiquidGlass) ────────────────────────────────

const M = {
  bg:        '#080c12',
  cardBg:    'rgba(255,255,255,0.065)',
  sidebarBg: 'rgba(255,255,255,0.05)',
  border:    'rgba(255,255,255,0.12)',
  borderHv:  'rgba(255,255,255,0.24)',
  accent:    '#1bd96a',
  accentHv:  '#17c45e',
  text:      'rgba(255,255,255,0.97)',
  textSub:   'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.38)',
  red:       '#f85149',
  orange:    '#e3b341',
  blue:      '#58a6ff',
  radius:    '14px',
  radiusSm:  '10px',
  radiusLg:  '18px',
  navH:      '64px',
  sideW:     '272px',
}

// ── Global CSS ────────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: ${M.bg};
    color: ${M.text};
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    font-size: 15px;
  }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 3px; }
  input::placeholder { color: ${M.textMuted}; }
  select option { background: #161b22; color: ${M.text}; }

  .row-item {
    transition: background 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    cursor: pointer;
  }
  .row-item:hover {
    background: rgba(255,255,255,0.09) !important;
    box-shadow: 0 6px 28px rgba(0,0,0,0.45) !important;
    transform: translateY(-1px);
  }

  .sidebar-btn { transition: background 150ms ease, color 150ms ease, border-left 150ms ease; }
  .sidebar-btn:hover { background: rgba(255,255,255,0.10) !important; color: ${M.text} !important; }

  .glass-input:focus {
    border-color: ${M.accent} !important;
    box-shadow: 0 0 0 3px ${M.accent}33 !important;
    outline: none;
  }

  .btn-accent:hover { background: ${M.accentHv} !important; transform: translateY(-1px); box-shadow: 0 6px 20px ${M.accent}55 !important; }
  .btn-ghost:hover { background: rgba(255,255,255,0.12) !important; border-color: rgba(255,255,255,0.22) !important; }

  .nav-link-item { transition: color 150ms ease, background 150ms ease; }
  .nav-link-item:hover { color: ${M.text} !important; background: rgba(255,255,255,0.08) !important; }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @keyframes wordCycle {
    0%, 28%   { opacity: 1; transform: translateY(0); }
    33%, 61%  { opacity: 0; transform: translateY(-8px); }
    66%, 94%  { opacity: 1; transform: translateY(0); }
    99%, 100% { opacity: 0; transform: translateY(-8px); }
  }
  @keyframes glowPulse {
    0%, 100% { opacity: 0.6; }
    50%      { opacity: 1; }
  }

  /* Hero grid pattern */
  .hero-pattern {
    background-image:
      linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px);
    background-size: 44px 44px;
  }

  /* iOS LiquidGlass panel */
  .glass-panel {
    background: rgba(255,255,255,0.055);
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.13);
    box-shadow: 0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10);
  }

  @media (max-width: 960px) {
    .sidebar-col { display: none !important; }
  }
`

// ── Filter config ─────────────────────────────────────────────────────────────

const CATEGORIES_MOD = [
  'Adventure', 'Combat', 'Decoration', 'Equipment', 'Food',
  'Game Mechanics', 'Library', 'Lightweight', 'Magic', 'Management',
  'Minigame', 'Mobs', 'Optimization', 'Social', 'Storage',
  'Technology', 'Transportation', 'Utility', 'World Generation',
]
const CATEGORIES_MODPACK = [
  'Adventure', 'Challenging', 'Combat', 'Kitchen Sink',
  'Lightweight', 'Magic', 'Multiplayer', 'Optimization',
  'Quests', 'Technology',
]

const MC_VERSIONS = [
  '1.21.4','1.21.1','1.21','1.20.6','1.20.4','1.20.1',
  '1.19.4','1.19.2','1.18.2','1.16.5','1.12.2',
]
const LOADERS = ['Fabric','Forge','Quilt','NeoForge']

interface Filters {
  source: 'curseforge' | 'modrinth' | 'both'
  loader: string; gameVersion: string; category: string; sort: string
}
const DEFAULT_FILTERS: Filters = {
  source: 'both', loader: '', gameVersion: '', category: '', sort: 'relevance',
}

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetchItems(
  query: string, filters: Filters, page: number, type: 'mods' | 'modpacks',
): Promise<{ items: ModItem[]; totalPages: number; emptyMsg?: string }> {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (filters.gameVersion) params.set('game_version', filters.gameVersion)
  if (filters.loader) params.set('loader', filters.loader.toLowerCase())
  if (filters.category) params.set('category', filters.category.toLowerCase().replace(/ /g, '-'))
  if (filters.sort && filters.sort !== 'relevance') params.set('sort', filters.sort)
  params.set('page', String(page))
  params.set('per_page', '10')

  const sourcesToTry: Array<'both'|'modrinth'|'curseforge'> =
    filters.source === 'modrinth' ? ['modrinth'] :
    filters.source === 'curseforge' ? ['curseforge'] : ['both']

  const endpoint = type === 'mods' ? 'mods' : 'modpacks'

  for (const src of sourcesToTry) {
    const p = new URLSearchParams(params)
    if (src !== 'both') p.set('source', src)
    const res = await fetch(`/api/v1/${endpoint}?${p}`, { credentials: 'include' })
    if (res.status === 503 && src !== 'modrinth') continue
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    const items: ModItem[] = ((json.data ?? []) as Record<string, unknown>[]).map((m) => ({
      id: String(m.id ?? m.project_id ?? ''),
      name: String(m.name ?? m.title ?? ''),
      description: (m.summary ?? m.description ?? m.body) as string | undefined,
      downloadCount: (m.downloadCount ?? m.downloads) as number | undefined,
      follows: m.follows as number | undefined,
      source: ((m.source ?? (m.project_id ? 'modrinth' : 'curseforge')) as 'curseforge'|'modrinth'),
      imageUrl: (m.logo as Record<string,unknown>)?.thumbnailUrl as string|undefined
        ?? m.icon_url as string|undefined,
      categories: (() => {
        const raw = m.categories ?? m.display_categories
        if (!Array.isArray(raw)) return undefined
        return raw.map((c: unknown) =>
          typeof c === 'string' ? c :
          typeof c === 'object' && c !== null
            ? String((c as Record<string,unknown>).name ?? (c as Record<string,unknown>).slug ?? '')
            : ''
        ).filter(Boolean)
      })(),
      author: (m.author ?? m.team) as string|undefined,
      updatedAt: (m.date_modified ?? m.updated) as string|undefined,
      itemType: type === 'modpacks' ? 'modpack' : 'mod',
    }))

    const total = (json.meta?.total as number) ?? items.length
    const perPage = (json.meta?.per_page as number) ?? 20
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    const emptyMsg = items.length === 0 && query ? `Nenhum resultado para "${query}"` : undefined
    return { items, totalPages, emptyMsg }
  }
  throw new Error('Serviços indisponíveis')
}

async function apiFetchDetail(id: string, source: string): Promise<ModDetailData> {
  const res = await fetch(`/api/v1/mods/${id}?source=${source}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const d = (json.data ?? json) as Record<string,unknown>
  return {
    id: String(d.id ?? d.project_id ?? id),
    name: String(d.name ?? d.title ?? ''),
    source: source as 'curseforge'|'modrinth',
    description: (d.summary ?? d.description) as string|undefined,
    downloadCount: (d.downloadCount ?? d.downloads) as number|undefined,
    imageUrl: (d.logo as Record<string,unknown>)?.thumbnailUrl as string|undefined
      ?? d.icon_url as string|undefined,
    externalUrl: (d.links as Record<string,unknown>)?.websiteUrl as string|undefined,
  }
}

async function apiFetchLibrary(): Promise<LibraryListItem[]> {
  const res = await fetch('/api/v1/library', { credentials: 'include' })
  if (res.status === 401) return []
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return ((json.data ?? []) as Record<string,unknown>[]).map((item) => ({
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    source: item.source as 'curseforge'|'modrinth',
    itemType: (item.item_type ?? 'mod') as 'mod'|'modpack',
    version: item.version as string|undefined,
    loader: item.loader as string|undefined,
    mcVersion: item.mc_version as string|undefined,
    imageUrl: item.image_url as string|undefined,
    description: item.description as string|undefined,
    addedAt: item.added_at as string|undefined,
    externalId: String(item.external_id ?? ''),
  }))
}

async function apiAddToLibrary(
  source: string, externalId: string, name: string, itemType = 'mod',
  extra?: { loader?: string; mcVersion?: string; imageUrl?: string; description?: string }
): Promise<void> {
  const res = await fetch('/api/v1/library', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source, external_id: externalId, name, item_type: itemType,
      loader: extra?.loader,
      mc_version: extra?.mcVersion,
      image_url: extra?.imageUrl,
      description: extra?.description,
    }),
  })
  if (res.status === 409) throw new Error('Item já está na sua biblioteca')
  if (res.status === 401) throw new Error('Faça login para adicionar')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

async function apiRemoveFromLibrary(id: string|number): Promise<void> {
  await fetch(`/api/v1/library/${id}`, { method: 'DELETE', credentials: 'include' })
}

// ── Modpack mods API ──────────────────────────────────────────────────────────
interface ModpackModItem {
  id: number
  external_id: string
  source: 'curseforge' | 'modrinth'
  name: string
  version?: string
  version_name?: string
  image_url?: string
  enabled: boolean
  added_at?: string
}

async function apiFetchModpackMods(modpackId: string|number): Promise<ModpackModItem[]> {
  const res = await fetch(`/api/v1/library/${modpackId}/mods`, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json.data ?? []) as ModpackModItem[]
}

// Fetch the mods included in a modpack from the external API (CurseForge/Modrinth)
async function apiFetchModpackModsFromSource(
  modpackExternalId: string, source: 'curseforge' | 'modrinth'
): Promise<Array<{ id: string; name: string; source: string; version?: string; image_url?: string }>> {
  try {
    const res = await fetch(`/api/v1/modpacks/${encodeURIComponent(modpackExternalId)}/mods?source=${source}`, { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []) as Array<{ id: string; name: string; source: string; version?: string; image_url?: string }>
  } catch { return [] }
}

// Auto-import mods from external API into the library modpack
async function apiImportModpackMods(
  libraryItemId: string|number,
  modpackExternalId: string,
  source: 'curseforge' | 'modrinth'
): Promise<number> {
  const mods = await apiFetchModpackModsFromSource(modpackExternalId, source)
  if (mods.length === 0) return 0
  let imported = 0
  for (const mod of mods.slice(0, 100)) {
    try {
      await apiAddModToModpack(libraryItemId, {
        source: mod.source,
        external_id: mod.id,
        name: mod.name || mod.id,
        version: mod.version,
        image_url: mod.image_url,
      })
      imported++
    } catch { /* skip duplicates */ }
  }
  return imported
}

async function apiAddModToModpack(
  modpackId: string|number,
  mod: { source: string; external_id: string; name: string; version?: string; version_name?: string; image_url?: string }
): Promise<void> {
  const res = await fetch(`/api/v1/library/${modpackId}/mods`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mod),
  })
  if (res.status === 409) throw new Error('Mod já está neste modpack')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

async function apiRemoveModFromModpack(modpackId: string|number, modId: number): Promise<void> {
  await fetch(`/api/v1/library/${modpackId}/mods/${modId}`, { method: 'DELETE', credentials: 'include' })
}

// ── Mod versions API ──────────────────────────────────────────────────────────

interface ModVersion {
  id: string
  name: string
  gameVersions?: string[]
  loaders?: string[]
}

async function apiFetchModVersions(modId: string, source: string): Promise<ModVersion[]> {
  try {
    const res = await fetch(`/api/v1/mods/${encodeURIComponent(modId)}/versions?source=${source}`, { credentials: 'include' })
    if (!res.ok) return []
    const json = await res.json()
    const list = (json.data ?? []) as Array<Record<string, unknown>>
    return list.map(v => ({
      id:         String(v.id ?? ''),
      name:       String(v.name ?? v.version_number ?? v.id ?? ''),
      gameVersions: (v.game_versions as string[] | undefined) ?? [],
      loaders:    (v.loaders as string[] | undefined) ?? [],
    }))
  } catch { return [] }
}

async function apiFetchUser(): Promise<User|null> {
  const res = await fetch('/api/v1/users/me', { credentials: 'include' })
  if (!res.ok) return null
  const json = await res.json()
  return (json.data ?? null) as User|null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n/1_000).toFixed(0)}K`
  return String(n)
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 3600) return `${Math.floor(diff/60)}m atrás`
    if (diff < 86400) return `${Math.floor(diff/3600)}h atrás`
    if (diff < 2592000) return `${Math.floor(diff/86400)}d atrás`
    return `${Math.floor(diff/2592000)} meses atrás`
  } catch { return '' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

const ItemIcon: React.FC<{ url?: string; name: string; size?: number }> = ({ url, name, size = 52 }) => (
  <div style={{
    width: size, height: size, borderRadius: M.radius, flexShrink: 0,
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: `1px solid ${M.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  }}>
    {url ? (
      <img src={url} alt={name}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    ) : (
      <span style={{ fontSize: size * 0.4 }}>🧩</span>
    )}
  </div>
)

const SourceBadge: React.FC<{ source: 'modrinth' | 'curseforge' }> = ({ source }) => (
  <span style={{
    padding: '3px 9px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
    background: source === 'modrinth' ? `${M.accent}22` : `${M.orange}22`,
    color: source === 'modrinth' ? M.accent : M.orange,
    border: `1px solid ${source === 'modrinth' ? `${M.accent}44` : `${M.orange}44`}`,
    flexShrink: 0,
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  }}>
    {source === 'modrinth' ? 'Modrinth' : 'CurseForge'}
  </span>
)

// Tall glass row item — Modrinth + iOS LiquidGlass style
const ResultRow: React.FC<{ item: ModItem; onClick: (item: ModItem) => void }> = ({ item, onClick }) => {
  const cats = (item.categories ?? []).slice(0, 3)

  return (
    <div
      className="row-item"
      style={{
        display: 'flex', alignItems: 'center', gap: '18px',
        padding: '16px 24px', minHeight: '96px',
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        borderBottom: `1px solid ${M.border}`,
        borderRadius: '0',
        cursor: 'pointer',
      }}
      onClick={() => onClick(item)}
      role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick(item)}
    >
      <ItemIcon url={item.imageUrl} name={item.name} size={60} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: M.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px' }}>
            {item.name}
          </span>
          <SourceBadge source={item.source} />
          {cats.map((c) => (
            <span key={c} style={{
              padding: '3px 9px', borderRadius: '7px', fontSize: '12px',
              background: 'rgba(255,255,255,0.09)', color: M.textSub,
              border: `1px solid ${M.border}`,
            }}>{c}</span>
          ))}
        </div>
        {item.description && (
          <p style={{
            margin: 0, fontSize: '13px', color: M.textSub, lineHeight: 1.55,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {item.description}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '18px', fontSize: '13px', color: M.textMuted, flexShrink: 0, alignItems: 'center' }}>
        {item.downloadCount != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Download size={13} aria-hidden="true" />{fmtNum(item.downloadCount)}
          </span>
        )}
        {item.follows != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Heart size={13} aria-hidden="true" />{fmtNum(item.follows)}
          </span>
        )}
        {item.updatedAt && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={13} aria-hidden="true" />{fmtDate(item.updatedAt)}
          </span>
        )}
      </div>
    </div>
  )
}

const Pagination: React.FC<{ page: number; total: number; onChange: (p: number) => void }> = ({ page, total, onChange }) => {
  if (total <= 1) return null
  const range: (number|'...')[] = []
  if (total <= 7) { for (let i = 1; i <= total; i++) range.push(i) }
  else {
    range.push(1)
    if (page > 3) range.push('...')
    for (let i = Math.max(2, page-1); i <= Math.min(total-1, page+1); i++) range.push(i)
    if (page < total-2) range.push('...')
    range.push(total)
  }
  const btn = (active: boolean, disabled: boolean): CSSProperties => ({
    padding: '5px 10px', borderRadius: M.radiusSm,
    border: `1px solid ${active ? M.accent : M.border}`,
    background: active ? M.accent : 'transparent',
    color: active ? '#fff' : disabled ? M.textMuted : M.textSub,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '13px', fontWeight: active ? 700 : 400,
    opacity: disabled ? 0.4 : 1, fontFamily: 'inherit',
    transition: 'all 120ms ease',
  })
  return (
    <nav style={{ display: 'flex', gap: '4px', justifyContent: 'center', padding: '16px 0', flexWrap: 'wrap' }}>
      <button style={btn(false, page<=1)} onClick={() => page>1 && onChange(page-1)} disabled={page<=1}>‹</button>
      {range.map((p, i) => p === '...'
        ? <span key={`e${i}`} style={{ padding: '5px 4px', color: M.textMuted }}>…</span>
        : <button key={p} style={btn(p===page, false)} onClick={() => onChange(p as number)}>{p}</button>
      )}
      <button style={btn(false, page>=total)} onClick={() => page<total && onChange(page+1)} disabled={page>=total}>›</button>
    </nav>
  )
}

// ── Browse page ───────────────────────────────────────────────────────────────

const BrowsePage: React.FC<{ type: 'mods' | 'modpacks'; user: User | null }> = ({ type, user }) => {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<ModItem[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emptyMsg, setEmptyMsg] = useState('Nenhum resultado encontrado')
  const [versionSearch, setVersionSearch] = useState('')
  const [showAllVersions, setShowAllVersions] = useState(false)

  const [detail, setDetail] = useState<ModDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [libMsg, setLibMsg] = useState<string | null>(null)
  const [showAddToModpack, setShowAddToModpack] = useState(false)
  const [showCreateForMod, setShowCreateForMod] = useState(false)
  const [userModpacks, setUserModpacks] = useState<LibraryListItem[]>([])
  const setFilter = <K extends keyof Filters>(key: K, val: Filters[K]) => {
    setFilters(f => ({ ...f, [key]: val })); setPage(1)
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { items: data, totalPages: tp, emptyMsg: em } = await apiFetchItems(query, filters, page, type)
      setItems(data); setTotalPages(tp)
      setEmptyMsg(em ?? 'Nenhum resultado encontrado')
    } catch {
      setError('Não foi possível carregar. Verifique se o servidor Rails está rodando.')
      setItems([])
    } finally { setLoading(false) }
  }, [query, filters, page, type])

  useEffect(() => { load() }, [load])

  const handleCardClick = async (item: ModItem) => {
    setDetail(null); setLibMsg(null); setShowAddToModpack(false)
    setDetailLoading(true)
    try { setDetail(await apiFetchDetail(item.id, item.source)) }
    catch { setDetail({ ...item }) }
    finally { setDetailLoading(false) }
    // Load user modpacks for the "add to modpack" flow
    if (user) {
      apiFetchLibrary().then(data => setUserModpacks(data.filter(i => i.itemType === 'modpack'))).catch(() => {})
    }
  }

  const filteredVersions = MC_VERSIONS.filter(v => v.includes(versionSearch))
  const visibleVersions = showAllVersions ? filteredVersions : filteredVersions.slice(0, 6)
  const hasActiveFilters = filters.category || filters.loader || filters.gameVersion || filters.source !== 'both'

  // Shared glass select style — kept for CreateModpackModal
  const glassSelect: CSSProperties = {
    padding: '9px 32px 9px 14px', borderRadius: M.radiusSm,
    border: `1px solid ${M.border}`,
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: M.text, fontSize: '14px', cursor: 'pointer',
    fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 150ms, box-shadow 150ms',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    minWidth: '130px',
  }

  return (
    <div style={{ display: 'flex', gap: '0', alignItems: 'flex-start', animation: 'fadeIn 200ms ease' }}>

      {/* ── Sidebar: Game Version + Loader ───────────────────────────── */}
      <aside className="sidebar-col" style={{
        width: '230px', flexShrink: 0,
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        borderRight: `1px solid rgba(255,255,255,0.10)`,
        padding: '20px 14px',
        position: 'sticky', top: M.navH,
        maxHeight: `calc(100vh - ${M.navH})`,
        overflowY: 'auto',
      }}>

        {/* ── Game Version ─────────────────────────────────────────── */}
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: M.text }}>Game version</span>
            <ChevronUp size={15} color={M.textMuted} aria-hidden="true" />
          </div>
          <div style={{ position: 'relative', marginBottom: '8px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: M.textMuted, pointerEvents: 'none' }} aria-hidden="true" />
            <input type="text" value={versionSearch}
              onChange={(e) => setVersionSearch(e.target.value)}
              placeholder="Search…" className="glass-input"
              style={{
                width: '100%', padding: '8px 10px 8px 30px', borderRadius: M.radiusSm,
                border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.07)',
                color: M.text, fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>
          {visibleVersions.map((v) => {
            const active = filters.gameVersion === v
            return (
              <button key={v} className="sidebar-btn"
                onClick={() => setFilter('gameVersion', active ? '' : v)}
                style={{
                  display: 'block', width: '100%', padding: '9px 8px', border: 'none',
                  borderRadius: M.radiusSm, cursor: 'pointer', fontSize: '14px', textAlign: 'left',
                  background: active ? `${M.accent}20` : 'transparent',
                  color: active ? M.accent : M.textSub, fontFamily: 'inherit',
                  fontWeight: active ? 700 : 400, transition: 'all 150ms ease',
                }}
              >{v}</button>
            )
          })}
          {filteredVersions.length > 6 && (
            <button onClick={() => setShowAllVersions(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                width: '100%', padding: '8px 8px', border: 'none',
                background: 'transparent', color: M.textMuted, cursor: 'pointer',
                fontSize: '13px', fontFamily: 'inherit', marginTop: '2px',
              }}>
              <ChevronDown size={13} style={{ transform: showAllVersions ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} aria-hidden="true" />
              {showAllVersions ? 'Mostrar menos' : 'Mostrar todas'}
            </button>
          )}
        </div>

        <div style={{ height: '1px', background: M.border, margin: '16px 0' }} />

        {/* ── Loader ───────────────────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: M.text }}>Loader</span>
            <ChevronUp size={15} color={M.textMuted} aria-hidden="true" />
          </div>
          {LOADERS.map((loader) => {
            const val = loader.toLowerCase()
            const active = filters.loader === val
            const lc = loader === 'Fabric' ? '#dbb168' : loader === 'Forge' ? '#5b8dd9' : loader === 'NeoForge' ? '#e07b39' : loader === 'Quilt' ? '#c27adb' : M.textSub
            return (
              <button key={loader} className="sidebar-btn"
                onClick={() => setFilter('loader', active ? '' : val)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '10px 8px', border: 'none',
                  borderRadius: M.radiusSm, cursor: 'pointer', fontSize: '14px',
                  background: active ? `${lc}18` : 'transparent',
                  color: lc, fontFamily: 'inherit',
                  fontWeight: active ? 700 : 500, opacity: active ? 1 : 0.8,
                  transition: 'all 150ms ease',
                }}>
                <Package size={14} aria-hidden="true" style={{ color: lc }} />
                {loader}
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0 }}>

        {/* ── Top toolbar ──────────────────────────────────────────── */}
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${M.border}`,
          background: 'rgba(8,12,18,0.90)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          position: 'sticky', top: M.navH, zIndex: 10,
        }}>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: M.textMuted, pointerEvents: 'none' }} aria-hidden="true" />
            <input
              type="search" value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
              placeholder={`Buscar ${type === 'modpacks' ? 'modpacks' : 'mods'}…`}
              className="glass-input"
              style={{
                width: '100%', padding: '11px 14px 11px 44px', borderRadius: M.radiusSm,
                border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.07)',
                backdropFilter: 'blur(8px)', color: M.text, fontSize: '15px',
                boxSizing: 'border-box', fontFamily: 'inherit',
                transition: 'border-color 150ms, box-shadow 150ms',
              }}
            />
          </div>

          {/* Filter row */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Sort */}
            <GlassSelect
              value={filters.sort}
              onChange={(v) => setFilter('sort', v)}
              aria-label="Ordenar por"
              options={[
                { value: 'relevance', label: 'Relevância' },
                { value: 'downloads', label: 'Downloads' },
                { value: 'follows',   label: 'Seguidores' },
                { value: 'newest',    label: 'Mais recentes' },
              ]}
              minWidth={140}
            />

            {/* Source */}
            <GlassSelect
              value={filters.source}
              onChange={(v) => setFilter('source', v as Filters['source'])}
              aria-label="Fonte"
              options={[
                { value: 'both',       label: 'Todas as fontes' },
                { value: 'modrinth',   label: 'Modrinth' },
                { value: 'curseforge', label: 'CurseForge' },
              ]}
              minWidth={150}
            />

            {/* Category */}
            <GlassSelect
              value={filters.category}
              onChange={(v) => setFilter('category', v)}
              aria-label="Categoria"
              options={[
                { value: '', label: 'Categoria' },
                ...(type === 'modpacks' ? CATEGORIES_MODPACK : CATEGORIES_MOD).map(cat => ({
                  value: cat.toLowerCase().replace(/ /g, '-'),
                  label: cat,
                })),
              ]}
              minWidth={140}
            />

            {hasActiveFilters && (
              <button onClick={() => setFilters(DEFAULT_FILTERS)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '9px 13px', borderRadius: M.radiusSm, fontSize: '13px',
                  cursor: 'pointer', color: M.red,
                  border: `1px solid ${M.red}44`, background: `${M.red}10`,
                  fontFamily: 'inherit', transition: 'all 150ms',
                }}>
                <X size={12} aria-hidden="true" /> Limpar
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: `${M.red}10`, borderBottom: `1px solid ${M.red}33` }}>
            <AlertCircle size={15} color={M.red} aria-hidden="true" />
            <span style={{ fontSize: '13px', color: M.red }}>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', gap: '10px', color: M.textMuted }}>
            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
            Carregando…
          </div>
        )}

        {/* Empty */}
        {!loading && !error && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: M.textMuted }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🔍</div>
            <p style={{ margin: 0, fontSize: '14px' }}>{emptyMsg}</p>
          </div>
        )}

        {/* Results */}
        {!loading && items.length > 0 && (
          <div>
            {items.map((item) => (
              <ResultRow key={`${item.source}-${item.id}`} item={item} onClick={handleCardClick} />
            ))}
            <Pagination page={page} total={totalPages} onChange={setPage} />
          </div>
        )}
      </main>

      {/* Detail modal */}
      <GlassModal
        isOpen={!!detail || detailLoading}
        onClose={() => { setDetail(null); setLibMsg(null); setShowAddToModpack(false) }}
        title={detail?.name ?? 'Carregando…'}
        size="lg"
      >
        {detailLoading && (
          <div style={{ padding: '40px', textAlign: 'center', color: M.textMuted }}>
            <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} aria-hidden="true" />
          </div>
        )}
        {detail && !detailLoading && (
          <>
            <ModDetail {...detail} />
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${M.border}` }}>

              {type === 'modpacks' && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {user ? (
                    <button
                      onClick={async () => {
                        setLibMsg(null)
                        try {
                          await apiAddToLibrary(detail.source, detail.id, detail.name, 'modpack', {
                            imageUrl: detail.imageUrl,
                            description: detail.description,
                          })
                          setLibMsg('✓ Modpack adicionado à biblioteca')
                        } catch (err) {
                          setLibMsg(err instanceof Error ? err.message : 'Erro ao adicionar')
                        }
                      }}
                      className="btn-accent"
                      style={{ padding: '9px 18px', borderRadius: M.radiusSm, border: 'none', background: M.accent, color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit', transition: 'background 120ms', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <BookOpen size={15} aria-hidden="true" />
                      Adicionar à biblioteca
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '13px', color: M.textMuted }}>Faça login para salvar na biblioteca</span>
                      <LoginButton />
                    </div>
                  )}
                  {libMsg && <span style={{ fontSize: '13px', color: libMsg.startsWith('✓') ? M.accent : M.red }}>{libMsg}</span>}
                </div>
              )}

              {type === 'mods' && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {user ? (
                    <button
                      onClick={() => setShowAddToModpack(true)}
                      className="btn-accent"
                      style={{ padding: '9px 18px', borderRadius: M.radiusSm, border: 'none', background: M.accent, color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit', transition: 'background 120ms', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Package size={15} aria-hidden="true" />
                      Adicionar a Modpack
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '13px', color: M.textMuted }}>Faça login para criar modpacks</span>
                      <LoginButton />
                    </div>
                  )}
                  {libMsg && <span style={{ fontSize: '13px', color: libMsg.startsWith('✓') ? M.accent : M.red }}>{libMsg}</span>}
                </div>
              )}

            </div>
          </>
        )}
      </GlassModal>

      {/* Add mod to modpack modal */}
      <AddModToModpackModal
        isOpen={showAddToModpack}
        onClose={() => setShowAddToModpack(false)}
        mod={detail}
        modpacks={userModpacks}
        onAddToExisting={async (modpackId, version, versionName) => {
          if (!detail) return
          await apiAddModToModpack(modpackId, {
            source: detail.source, external_id: detail.id, name: detail.name,
            version, version_name: versionName, image_url: detail.imageUrl,
          })
          setLibMsg(`✓ ${detail.name} adicionado ao modpack`)
          setShowAddToModpack(false)
        }}
        onCreateNew={() => { setShowAddToModpack(false); setShowCreateForMod(true) }}
      />

      {/* Create new modpack from mod */}
      <CreateModpackModal
        isOpen={showCreateForMod}
        onClose={() => setShowCreateForMod(false)}
        initialMod={detail ?? undefined}
        onCreate={async (name, mcVersion, loader, imageUrl) => {
          if (!detail) return
          const uniqueId = `custom-${Date.now()}`
          await apiAddToLibrary('modrinth', uniqueId, name, 'modpack', { loader, mcVersion, imageUrl: imageUrl ?? detail.imageUrl })
          const data = await apiFetchLibrary()
          setUserModpacks(data.filter(i => i.itemType === 'modpack'))
          const created = data.find(i => i.name === name && i.itemType === 'modpack')
          if (created) {
            await apiAddModToModpack(created.id, {
              source: detail.source, external_id: detail.id, name: detail.name,
              image_url: detail.imageUrl,
            })
          }
          setLibMsg(`✓ Modpack "${name}" criado com ${detail.name}`)
        }}
      />
    </div>
  )
}

// ── Animated word cycler ──────────────────────────────────────────────────────

const HERO_WORDS = ['mods', 'modpacks', 'shaders']

const AnimatedWord: React.FC = () => {
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % HERO_WORDS.length)
        setVisible(true)
      }, 300)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  return (
    <span style={{
      color: M.accent,
      display: 'inline-block',
      transition: 'opacity 300ms ease, transform 300ms ease',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(-8px)',
    }}>
      {HERO_WORDS[idx]}
    </span>
  )
}

// ── Home page ─────────────────────────────────────────────────────────────────

const HomePage: React.FC<{ user: User | null }> = ({ user }) => {
  const navigate = useNavigate()
  const [featured, setFeatured] = useState<ModItem[]>([])
  const marqueeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiFetchItems('', DEFAULT_FILTERS, 1, 'mods')
      .then(({ items }) => setFeatured(items.slice(0, 12)))
      .catch(() => {})
  }, [])

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="hero-pattern" style={{
        minHeight: `calc(100vh - ${M.navH})`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '60px 24px',
        position: 'relative',
        overflow: 'hidden',
        background: M.bg,
      }}>
        {/* Glow blobs */}
        <div style={{
          position: 'absolute', top: '10%', left: '20%',
          width: '400px', height: '400px', borderRadius: '50%',
          background: `radial-gradient(circle, ${M.accent}12 0%, transparent 70%)`,
          pointerEvents: 'none', filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '15%', right: '15%',
          width: '300px', height: '300px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(88,166,255,0.10) 0%, transparent 70%)',
          pointerEvents: 'none', filter: 'blur(40px)',
        }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '700px' }}>
          <h1 style={{
            margin: '0 0 16px',
            fontSize: 'clamp(36px, 6vw, 64px)',
            fontWeight: 800,
            color: M.text,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}>
            O lugar para{' '}
            <AnimatedWord />
            {' '}do Minecraft
          </h1>

          <p style={{
            margin: '0 0 36px',
            fontSize: 'clamp(15px, 2vw, 18px)',
            color: M.textSub,
            lineHeight: 1.6,
            maxWidth: '520px',
            marginLeft: 'auto', marginRight: 'auto',
          }}>
            Descubra, instale e gerencie mods e modpacks. Integrado com CurseForge e Modrinth.
          </p>

          {/* Search bar */}
          <div style={{
            position: 'relative',
            maxWidth: '520px',
            margin: '0 auto 32px',
          }}>
            <Search size={18} style={{
              position: 'absolute', left: '16px', top: '50%',
              transform: 'translateY(-50%)', color: M.textMuted, pointerEvents: 'none',
            }} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar mods, modpacks…"
              className="glass-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim()
                  navigate(val ? `/mods?q=${encodeURIComponent(val)}` : '/mods')
                }
              }}
              style={{
                width: '100%', padding: '16px 16px 16px 50px',
                borderRadius: M.radiusLg,
                border: `1px solid ${M.border}`,
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                color: M.text, fontSize: '16px',
                boxSizing: 'border-box', fontFamily: 'inherit',
                transition: 'border-color 150ms, box-shadow 150ms',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }}
            />
          </div>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/mods')}
              className="btn-accent"
              style={{
                padding: '14px 32px', borderRadius: M.radius,
                border: 'none', background: M.accent, color: '#fff',
                fontWeight: 700, cursor: 'pointer', fontSize: '16px',
                fontFamily: 'inherit', transition: 'all 150ms',
                boxShadow: `0 4px 20px ${M.accent}44`,
              }}>
              Explorar Mods
            </button>
            <button onClick={() => navigate('/modpacks')}
              className="btn-ghost"
              style={{
                padding: '14px 32px', borderRadius: M.radius,
                border: `1px solid ${M.border}`,
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: M.text, fontWeight: 600, cursor: 'pointer',
                fontSize: '16px', fontFamily: 'inherit', transition: 'all 150ms',
              }}>
              Ver Modpacks
            </button>
          </div>
        </div>
      </section>

      {/* ── Em destaque ───────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section style={{ padding: '48px 24px', borderTop: `1px solid ${M.border}` }}>
          <h2 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: 700, color: M.text }}>
            Em destaque
          </h2>
          {/* Marquee row */}
          <div style={{ overflow: 'hidden', position: 'relative' }}>
            <div
              ref={marqueeRef}
              style={{
                display: 'flex', gap: '12px',
                animation: 'marquee 30s linear infinite',
                width: 'max-content',
              }}
              onMouseEnter={() => { if (marqueeRef.current) marqueeRef.current.style.animationPlayState = 'paused' }}
              onMouseLeave={() => { if (marqueeRef.current) marqueeRef.current.style.animationPlayState = 'running' }}
            >
              {/* Duplicate for seamless loop */}
              {[...featured, ...featured].map((item, i) => (
                <div key={`${item.id}-${i}`} style={{
                  width: '220px', flexShrink: 0,
                  background: 'rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: `1px solid ${M.border}`,
                  borderRadius: M.radiusLg,
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'border-color 150ms, transform 150ms',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <ItemIcon url={item.imageUrl} name={item.name} size={40} />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                  </div>
                  {item.downloadCount != null && (
                    <span style={{ fontSize: '12px', color: M.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Download size={11} aria-hidden="true" />{fmtNum(item.downloadCount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      <section style={{
        padding: '48px 24px',
        borderTop: `1px solid ${M.border}`,
        display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {[
          { label: 'Mods disponíveis', value: '100K+', icon: <Package size={22} color={M.accent} aria-hidden="true" /> },
          { label: 'Modpacks', value: '10K+', icon: <Layers size={22} color={M.blue} aria-hidden="true" /> },
          { label: 'Fontes integradas', value: '2', icon: <Globe size={22} color={M.orange} aria-hidden="true" /> },
        ].map((stat) => (
          <div key={stat.label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            padding: '28px 40px',
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${M.border}`,
            borderRadius: M.radiusLg,
            minWidth: '180px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          }}>
            {stat.icon}
            <span style={{ fontSize: '32px', fontWeight: 800, color: M.text }}>{stat.value}</span>
            <span style={{ fontSize: '14px', color: M.textSub }}>{stat.label}</span>
          </div>
        ))}
      </section>

      {/* ── Quick links ───────────────────────────────────────────────── */}
      <section style={{ padding: '0 24px 56px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
        {[
          { label: 'Mods', desc: 'Modificações individuais', icon: '🔧', path: '/mods' },
          { label: 'Modpacks', desc: 'Coleções prontas para jogar', icon: '📦', path: '/modpacks' },
          { label: 'Biblioteca', desc: user ? 'Seus itens salvos' : 'Faça login para acessar', icon: '📚', path: '/library' },
        ].map((item) => (
          <button key={item.path} onClick={() => navigate(item.path)}
            className="btn-ghost"
            style={{
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${M.border}`,
              borderRadius: M.radiusLg,
              padding: '24px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              transition: 'all 150ms',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>{item.icon}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: M.text, marginBottom: '6px' }}>{item.label}</div>
            <div style={{ fontSize: '13px', color: M.textSub, marginBottom: '14px' }}>{item.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: M.accent, fontSize: '13px', fontWeight: 700 }}>
              Ver todos <ChevronRight size={14} aria-hidden="true" />
            </div>
          </button>
        ))}
      </section>
    </div>
  )
}

// ── Library page — CurseForge-style modpack manager ──────────────────────────

const LOADER_COLORS: Record<string, string> = {
  fabric:   '#dbb168',
  forge:    '#5b8dd9',
  neoforge: '#e07b39',
  quilt:    '#c27adb',
}

const CreateModpackModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  initialMod?: { id: string; name: string; source: 'curseforge'|'modrinth'; imageUrl?: string; description?: string }
  onCreate: (name: string, mcVersion: string, loader: string, imageUrl?: string) => Promise<void>
}> = ({ isOpen, onClose, onCreate, initialMod }) => {
  const [name, setName] = useState(initialMod ? `Modpack com ${initialMod.name}` : '')
  const [mcVersion, setMcVersion] = useState('1.21.4')
  const [loader, setLoader] = useState('fabric')
  const [imagePreview, setImagePreview] = useState<string | undefined>(initialMod?.imageUrl)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = React.useRef<HTMLInputElement>(null)

  // Reset when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setName(initialMod ? `Modpack com ${initialMod.name}` : '')
      setImagePreview(initialMod?.imageUrl)
      setErr('')
    }
  }, [isOpen, initialMod])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleCreate = async () => {
    if (!name.trim()) { setErr('Nome obrigatório'); return }
    setSaving(true); setErr('')
    try {
      await onCreate(name.trim(), mcVersion, loader, imagePreview)
      onClose()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erro') }
    finally { setSaving(false) }
  }

  const glassInput: CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: M.radiusSm,
    border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.07)',
    color: M.text, fontSize: '14px', fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 150ms, box-shadow 150ms', boxSizing: 'border-box',
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="Criar Modpack" size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Image upload */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: '80px', height: '80px', borderRadius: M.radius, flexShrink: 0,
              border: `2px dashed ${M.border}`, cursor: 'pointer',
              background: imagePreview ? 'transparent' : 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', transition: 'border-color 150ms',
              position: 'relative',
            }}
            title="Clique para adicionar imagem"
          >
            {imagePreview
              ? <img src={imagePreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ textAlign: 'center', color: M.textMuted, fontSize: '11px' }}>
                  <Layers size={20} style={{ marginBottom: '4px', opacity: 0.5 }} />
                  <div>Imagem</div>
                </div>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '13px', color: M.textSub, marginBottom: '6px' }}>Nome do modpack</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Meu Modpack…" className="glass-input" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={glassInput}
            />
          </div>
        </div>

        {/* MC Version + Loader */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: M.textSub, marginBottom: '6px' }}>Versão MC</label>
            <GlassSelect value={mcVersion} onChange={setMcVersion} aria-label="Versão MC"
              options={MC_VERSIONS.map(v => ({ value: v, label: v }))} minWidth="100%" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: M.textSub, marginBottom: '6px' }}>Loader</label>
            <GlassSelect value={loader} onChange={setLoader} aria-label="Loader"
              options={LOADERS.map(l => ({ value: l.toLowerCase(), label: l }))} minWidth="100%" />
          </div>
        </div>

        {/* Initial mod info */}
        {initialMod && (
          <div style={{
            padding: '10px 12px', borderRadius: M.radiusSm,
            background: `${M.accent}10`, border: `1px solid ${M.accent}33`,
            fontSize: '13px', color: M.textSub,
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            {initialMod.imageUrl && <img src={initialMod.imageUrl} alt="" style={{ width: 24, height: 24, borderRadius: '4px', objectFit: 'cover' }} />}
            <span>O mod <strong style={{ color: M.text }}>{initialMod.name}</strong> será adicionado após criar o modpack.</span>
          </div>
        )}

        {err && <p style={{ margin: 0, fontSize: '13px', color: M.red }}>{err}</p>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: M.radiusSm, border: `1px solid ${M.border}`, background: 'transparent', color: M.textSub, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleCreate} disabled={saving} className="btn-accent"
            style={{ padding: '9px 20px', borderRadius: M.radiusSm, border: 'none', background: M.accent, color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? '…' : 'Criar'}
          </button>
        </div>
      </div>
    </GlassModal>
  )
}

// ── Add mod to modpack modal ──────────────────────────────────────────────────

const AddModToModpackModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  mod: ModDetailData | null
  modpacks: LibraryListItem[]
  onAddToExisting: (modpackId: string|number, version?: string, versionName?: string) => Promise<void>
  onCreateNew: () => void
}> = ({ isOpen, onClose, mod, modpacks, onAddToExisting, onCreateNew }) => {
  const [selectedModpack, setSelectedModpack] = useState<string>('')
  const [allVersions, setAllVersions] = useState<ModVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // The currently selected modpack object
  const currentModpack = modpacks.find(mp => String(mp.id) === selectedModpack)
  const modpackLoader = currentModpack?.loader?.toLowerCase()

  // Filter versions by the modpack's loader (if set)
  const filteredVersions = React.useMemo(() => {
    if (!modpackLoader || allVersions.length === 0) return allVersions
    const compatible = allVersions.filter(v =>
      !v.loaders || v.loaders.length === 0 ||
      v.loaders.some(l => l.toLowerCase() === modpackLoader) ||
      // fabric mods often work on quilt
      (modpackLoader === 'quilt' && v.loaders.some(l => l.toLowerCase() === 'fabric'))
    )
    return compatible.length > 0 ? compatible : allVersions // fallback to all if none match
  }, [allVersions, modpackLoader])

  const loaderSupported = React.useMemo(() => {
    if (!modpackLoader || allVersions.length === 0) return true
    return allVersions.some(v =>
      !v.loaders || v.loaders.length === 0 ||
      v.loaders.some(l => l.toLowerCase() === modpackLoader) ||
      (modpackLoader === 'quilt' && v.loaders.some(l => l.toLowerCase() === 'fabric'))
    )
  }, [allVersions, modpackLoader])

  // Unique loaders this mod supports
  const supportedLoaders = React.useMemo(() => {
    const set = new Set<string>()
    allVersions.forEach(v => v.loaders?.forEach(l => set.add(l.toLowerCase())))
    return Array.from(set)
  }, [allVersions])

  React.useEffect(() => {
    if (!isOpen || !mod) return
    setSelectedModpack(modpacks[0]?.id ? String(modpacks[0].id) : '')
    setSelectedVersion('')
    setErr('')
    setAllVersions([])
    setLoadingVersions(true)
    apiFetchModVersions(mod.id, mod.source).then(v => {
      setAllVersions(v)
      if (v.length > 0) setSelectedVersion(v[0].id)
    }).finally(() => setLoadingVersions(false))
  }, [isOpen, mod, modpacks])

  // Auto-select first compatible version when modpack changes
  React.useEffect(() => {
    if (filteredVersions.length > 0) setSelectedVersion(filteredVersions[0].id)
  }, [filteredVersions])

  const handleAdd = async () => {
    if (!selectedModpack) { setErr('Selecione um modpack'); return }
    setSaving(true); setErr('')
    try {
      const ver = filteredVersions.find(v => v.id === selectedVersion) ?? allVersions.find(v => v.id === selectedVersion)
      await onAddToExisting(selectedModpack, selectedVersion || undefined, ver?.name)
      onClose()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erro') }
    finally { setSaving(false) }
  }

  if (!mod) return null

  const LOADER_COLORS_LOCAL: Record<string, string> = {
    fabric: '#dbb168', forge: '#5b8dd9', neoforge: '#e07b39', quilt: '#c27adb',
  }

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title={`Adicionar ${mod.name}`} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Mod info */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: M.radiusSm, border: `1px solid ${M.border}` }}>
          {mod.imageUrl && <img src={mod.imageUrl} alt="" style={{ width: 44, height: 44, borderRadius: M.radiusSm, objectFit: 'cover', flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: M.text }}>{mod.name}</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: M.textMuted }}>{mod.source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</span>
              {/* Loader compatibility badges */}
              {supportedLoaders.length > 0 && supportedLoaders.map(l => (
                <span key={l} style={{
                  fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '5px',
                  color: LOADER_COLORS_LOCAL[l] ?? M.textSub,
                  background: `${LOADER_COLORS_LOCAL[l] ?? M.textSub}18`,
                  border: `1px solid ${LOADER_COLORS_LOCAL[l] ?? M.textSub}33`,
                }}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Loader compatibility warning */}
        {modpackLoader && !loaderSupported && allVersions.length > 0 && (
          <div style={{ padding: '10px 12px', borderRadius: M.radiusSm, background: `${M.orange}12`, border: `1px solid ${M.orange}44`, fontSize: '13px', color: M.orange, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠</span>
            <span>
              Este mod não tem versões para <strong>{modpackLoader}</strong>.
              Loaders suportados: {supportedLoaders.join(', ') || 'nenhum detectado'}.
              Você pode adicionar mesmo assim, mas pode não funcionar.
            </span>
          </div>
        )}

        {/* Modpack select */}
        {modpacks.length > 0 ? (
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: M.textSub, marginBottom: '6px' }}>Adicionar ao modpack</label>
            <GlassSelect
              value={selectedModpack}
              onChange={setSelectedModpack}
              aria-label="Modpack"
              options={modpacks.map(mp => ({
                value: String(mp.id),
                label: `${mp.name}${mp.loader ? ` · ${mp.loader}` : ''}${mp.mcVersion ? ` ${mp.mcVersion}` : ''}`,
              }))}
              minWidth="100%"
            />
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: M.textMuted, padding: '4px 0' }}>Você não tem modpacks ainda.</div>
        )}

        {/* Version select */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', color: M.textSub, marginBottom: '6px' }}>
            Versão do mod
            {loadingVersions && <span style={{ color: M.textMuted }}> (carregando…)</span>}
            {!loadingVersions && modpackLoader && filteredVersions.length < allVersions.length && allVersions.length > 0 && (
              <span style={{ color: M.accent, marginLeft: '6px', fontSize: '12px' }}>
                {filteredVersions.length} compatíveis com {modpackLoader}
              </span>
            )}
          </label>
          {loadingVersions ? (
            <div style={{ fontSize: '13px', color: M.textMuted, padding: '8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Carregando versões…
            </div>
          ) : filteredVersions.length > 0 ? (
            <GlassSelect
              value={selectedVersion}
              onChange={setSelectedVersion}
              aria-label="Versão do mod"
              options={filteredVersions.slice(0, 50).map(v => ({
                value: v.id,
                label: [
                  v.name,
                  v.gameVersions?.[0],
                  v.loaders?.[0] ? `(${v.loaders[0]})` : undefined,
                ].filter(Boolean).join(' · '),
              }))}
              minWidth="100%"
            />
          ) : (
            <div style={{ fontSize: '13px', color: M.textMuted, padding: '8px 0' }}>
              {allVersions.length === 0
                ? 'Versões não disponíveis — será adicionado sem versão específica'
                : `Nenhuma versão para ${modpackLoader} — mostrando todas`
              }
            </div>
          )}
        </div>

        {err && <p style={{ margin: 0, fontSize: '13px', color: M.red }}>{err}</p>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onCreateNew} style={{ padding: '9px 14px', borderRadius: M.radiusSm, border: `1px solid ${M.border}`, background: 'transparent', color: M.textSub, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>+</span> Novo modpack
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: M.radiusSm, border: `1px solid ${M.border}`, background: 'transparent', color: M.textSub, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={saving || modpacks.length === 0} className="btn-accent"
              style={{ padding: '9px 20px', borderRadius: M.radiusSm, border: 'none', background: M.accent, color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit', opacity: (saving || modpacks.length === 0) ? 0.6 : 1 }}>
              {saving ? '…' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </GlassModal>
  )
}

type LibraryTab = 'mods' | 'worlds' | 'shaders' | 'resources'

const LibraryPage: React.FC<{ user: User | null }> = ({ user }) => {
  const [items, setItems] = useState<LibraryListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<LibraryListItem | null>(null)
  const [tab, setTab] = useState<LibraryTab>('mods')
  const [showCreate, setShowCreate] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [modpackMods, setModpackMods] = useState<ModpackModItem[]>([])
  const [modsLoading, setModsLoading] = useState(false)
  const [modsError, setModsError] = useState<string | null>(null)

  const modpacks = items.filter(i => i.itemType === 'modpack')

  const loadMods = useCallback(async (modpackId: string|number, _modpack?: LibraryListItem) => {
    setModsLoading(true); setModsError(null)
    try {
      const existing = await apiFetchModpackMods(modpackId)
      setModpackMods(existing)
    } catch (e) {
      setModpackMods([])
      setModsError(e instanceof Error ? e.message : 'Erro ao carregar mods')
    }
    finally { setModsLoading(false) }
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    apiFetchLibrary().then(data => {
      setItems(data)
      const first = data.find(i => i.itemType === 'modpack') ?? data[0] ?? null
      setSelected(first)
      if (first) loadMods(first.id)
    }).catch(() => setItems([])).finally(() => setLoading(false))
  }, [user, loadMods])

  const selectModpack = (mp: LibraryListItem) => {
    setSelected(mp); setTab('mods'); setShowMenu(false)
    loadMods(mp.id)
  }

  const handleCreate = async (name: string, mcVersion: string, loader: string, imageUrl?: string) => {
    await apiAddToLibrary('modrinth', `custom-${Date.now()}`, name, 'modpack', { loader, mcVersion, imageUrl })
    const data = await apiFetchLibrary()
    setItems(data)
    const created = data.find(i => i.name === name && i.itemType === 'modpack')
    if (created) { setSelected(created); loadMods(created.id) }
  }

  const handleDelete = async () => {
    if (!selected) return
    await apiRemoveFromLibrary(selected.id)
    const data = await apiFetchLibrary()
    setItems(data)
    const next = data.find(i => i.itemType === 'modpack') ?? null
    setSelected(next)
    if (next) loadMods(next.id)
    else setModpackMods([])
    setDeleteConfirm(false); setShowMenu(false)
  }

  const handleRemoveMod = async (modId: number) => {
    if (!selected) return
    await apiRemoveModFromModpack(selected.id, modId)
    setModpackMods(prev => prev.filter(m => m.id !== modId))
  }

  const loaderColor = selected?.loader ? (LOADER_COLORS[selected.loader.toLowerCase()] ?? M.textSub) : M.textSub

  const TABS: { id: LibraryTab; label: string }[] = [
    { id: 'mods', label: 'Mods' },
    { id: 'worlds', label: 'Worlds' },
    { id: 'shaders', label: 'Shaders' },
    { id: 'resources', label: 'Resources' },
  ]

  if (!user) {
    return (
      <div style={{ padding: '32px 24px', animation: 'fadeIn 250ms ease' }}>
        <div style={{
          padding: '56px', textAlign: 'center',
          background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)', border: `1px solid ${M.border}`,
          borderRadius: M.radiusLg, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}>
          <BookOpen size={44} color={M.textMuted} style={{ marginBottom: '16px' }} aria-hidden="true" />
          <p style={{ margin: '0 0 24px', color: M.textSub, fontSize: '16px' }}>Faça login para ver sua biblioteca</p>
          <LoginButton />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: `calc(100vh - ${M.navH})`, overflow: 'hidden', animation: 'fadeIn 250ms ease' }}>

      {/* ── Left panel: modpack grid ──────────────────────────────────── */}
      <div style={{
        width: '280px', flexShrink: 0,
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: `1px solid ${M.border}`,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 14px 12px', borderBottom: `1px solid ${M.border}` }}>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-accent"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: M.radiusSm,
              border: 'none', background: M.accent, color: '#fff',
              cursor: 'pointer', fontSize: '14px', fontWeight: 700,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '8px', transition: 'all 150ms',
              boxShadow: `0 2px 12px ${M.accent}44`,
            }}>
            <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span> Criar Modpack
          </button>
        </div>

        {/* Modpack list */}
        <div style={{ flex: 1, padding: '8px 8px' }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px', color: M.textMuted }}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {!loading && modpacks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: M.textMuted, fontSize: '13px' }}>
              Nenhum modpack ainda.<br />Crie um acima!
            </div>
          )}
          {modpacks.map(mp => {
            const isSelected = selected?.id === mp.id
            const lc = mp.loader ? (LOADER_COLORS[mp.loader.toLowerCase()] ?? M.textSub) : M.textSub
            return (
              <button key={mp.id} onClick={() => { setSelected(mp); setTab('mods'); setShowMenu(false) }}
                style={{
                  width: '100%', padding: '0', border: 'none', cursor: 'pointer',
                  borderRadius: M.radius, marginBottom: '6px', overflow: 'hidden',
                  background: isSelected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                  outline: isSelected ? `2px solid ${M.accent}` : '2px solid transparent',
                  transition: 'all 150ms ease', textAlign: 'left',
                }}>
                {/* Cover image */}
                <div style={{
                  width: '100%', height: '100px', position: 'relative',
                  background: `linear-gradient(135deg, rgba(27,217,106,0.15), rgba(88,166,255,0.10))`,
                  overflow: 'hidden',
                }}>
                  {mp.imageUrl ? (
                    <img src={mp.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Layers size={32} color={`${M.accent}66`} />
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }} />
                </div>
                {/* Info */}
                <div style={{ padding: '8px 10px 10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: M.text, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mp.name}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {mp.mcVersion && (
                      <span style={{ fontSize: '11px', color: M.textMuted, display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Package size={10} /> {mp.mcVersion}
                      </span>
                    )}
                    {mp.loader && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: lc }}>
                        {mp.loader.charAt(0).toUpperCase() + mp.loader.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right panel: selected modpack detail ─────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: M.textMuted, fontSize: '15px' }}>
            Selecione um modpack
          </div>
        ) : (
          <>
            {/* ── Profile header ──────────────────────────────────────── */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderBottom: `1px solid ${M.border}`,
              padding: '20px 24px',
              display: 'flex', alignItems: 'center', gap: '20px',
            }}>
              {/* Cover */}
              <div style={{
                width: '80px', height: '80px', borderRadius: M.radius,
                overflow: 'hidden', flexShrink: 0,
                background: `linear-gradient(135deg, rgba(27,217,106,0.2), rgba(88,166,255,0.15))`,
                border: `1px solid ${M.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected.imageUrl
                  ? <img src={selected.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Layers size={36} color={`${M.accent}88`} />
                }
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 800, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.name}
                </h2>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {selected.mcVersion && (
                    <span style={{ fontSize: '13px', color: M.textSub, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Package size={13} color={M.textMuted} /> {selected.mcVersion}
                    </span>
                  )}
                  {selected.loader && (
                    <span style={{ fontSize: '13px', fontWeight: 600, color: loaderColor, display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Layers size={13} /> {selected.loader.charAt(0).toUpperCase() + selected.loader.slice(1)}
                    </span>
                  )}
                  <span style={{ fontSize: '12px', color: M.textMuted }}>
                    {selected.source === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, position: 'relative' }}>
                {/* Play button — launcher only */}
                <div style={{
                  padding: '9px 20px', borderRadius: M.radiusSm,
                  background: 'rgba(255,255,255,0.08)', border: `1px solid ${M.border}`,
                  color: M.textMuted, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                  cursor: 'not-allowed',
                }} title="Disponível no Launcher">
                  <span>▶</span> Jogar
                </div>

                {/* Menu button */}
                <button
                  onClick={() => setShowMenu(v => !v)}
                  style={{
                    width: '36px', height: '36px', borderRadius: M.radiusSm,
                    border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.07)',
                    color: M.textSub, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                    transition: 'background 150ms',
                  }}>
                  ⋮
                </button>

                {/* Dropdown menu */}
                {showMenu && (
                  <div style={{
                    position: 'absolute', top: '44px', right: 0, zIndex: 50,
                    background: 'rgba(20,24,32,0.96)',
                    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                    border: `1px solid ${M.border}`, borderRadius: M.radius,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    minWidth: '200px', overflow: 'hidden',
                  }}>
                    {[
                      { icon: '▶', label: 'Jogar', disabled: true, note: '(Launcher)' },
                      { icon: '📁', label: 'Abrir Pasta', disabled: true, note: '(Launcher)' },
                      { icon: '⬆', label: 'Export Profile', disabled: true, note: '(Launcher)' },
                      { icon: '🔧', label: 'Repair Profile', disabled: true, note: '(Launcher)' },
                    ].map(item => (
                      <div key={item.label} style={{
                        padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '10px',
                        color: M.textMuted, fontSize: '14px', cursor: 'not-allowed',
                        borderBottom: `1px solid ${M.border}`,
                      }}>
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                        <span style={{ fontSize: '11px', color: M.textMuted, marginLeft: 'auto' }}>{item.note}</span>
                      </div>
                    ))}
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      style={{
                        width: '100%', padding: '11px 16px', border: 'none',
                        background: 'transparent', display: 'flex', alignItems: 'center', gap: '10px',
                        color: M.red, fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'background 150ms',
                      }}>
                      <span>🗑</span> Deletar Modpack
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Tabs ────────────────────────────────────────────────── */}
            <div style={{
              display: 'flex', gap: '0',
              borderBottom: `1px solid ${M.border}`,
              background: 'rgba(255,255,255,0.02)',
              padding: '0 24px',
            }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{
                    padding: '12px 18px', border: 'none', background: 'transparent',
                    color: tab === t.id ? M.text : M.textSub,
                    fontSize: '14px', fontWeight: tab === t.id ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    borderBottom: tab === t.id ? `2px solid ${M.accent}` : '2px solid transparent',
                    transition: 'all 150ms',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Tab content ─────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: '24px' }}>
              {tab === 'mods' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: M.text }}>
                      Mods instalados {modpackMods.length > 0 && <span style={{ fontSize: '13px', fontWeight: 400, color: M.textMuted }}>({modpackMods.length})</span>}
                    </h3>
                  </div>

                  {/* Launcher-only notice */}
                  <div style={{ padding: '12px 16px', borderRadius: M.radiusSm, background: `${M.blue}10`, border: `1px solid ${M.blue}33`, fontSize: '13px', color: M.blue, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🚀</span>
                    <span>A lista de mods é gerenciada pelo <strong>Launcher</strong>. Aqui você pode ver os mods adicionados manualmente.</span>
                  </div>

                  {modsLoading && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px', color: M.textMuted, flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: '13px' }}>
                        {modsError === 'importing' ? 'Importando mods do modpack…' : 'Carregando…'}
                      </span>
                    </div>
                  )}

                  {!modsLoading && modsError && modsError !== 'importing' && (
                    <div style={{ background: `${M.orange}10`, borderRadius: M.radius, border: `1px solid ${M.orange}33`, padding: '16px 20px', fontSize: '13px', color: M.orange, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠</span>
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>Erro ao carregar mods</div>
                        <div style={{ color: M.textSub }}>{modsError}</div>
                      </div>
                    </div>
                  )}

                  {!modsLoading && modpackMods.length === 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: M.radius, border: `1px solid ${M.border}`, padding: '32px', textAlign: 'center', color: M.textMuted, fontSize: '14px' }}>
                      <Package size={32} color={M.textMuted} style={{ marginBottom: '12px', opacity: 0.5 }} />
                      <p style={{ margin: '0 0 8px', fontWeight: 600, color: M.textSub }}>Nenhum mod instalado ainda</p>
                      <p style={{ margin: 0, fontSize: '13px' }}>
                        Vá para a aba de <strong>Mods</strong>, clique em um mod e escolha<br />
                        <strong>"Adicionar a Modpack"</strong> para adicionar mods a este modpack.
                      </p>
                    </div>
                  )}

                  {!modsLoading && modpackMods.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: M.radius, border: `1px solid ${M.border}`, overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px 40px', gap: '12px', padding: '10px 16px', borderBottom: `1px solid ${M.border}`, fontSize: '12px', fontWeight: 700, color: M.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        <span>Nome</span><span>Versão</span><span>Fonte</span><span></span>
                      </div>
                      {modpackMods.map(m => (
                        <div key={m.id} className="row-item" style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px 40px', gap: '12px', padding: '10px 16px', borderBottom: `1px solid ${M.border}`, alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            {m.image_url
                              ? <img src={m.image_url} alt="" style={{ width: 32, height: 32, borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
                              : <div style={{ width: 32, height: 32, borderRadius: '6px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={14} color={M.textMuted} /></div>
                            }
                            <span style={{ fontSize: '14px', fontWeight: 600, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                          </div>
                          <span style={{ fontSize: '12px', color: M.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.version_name ?? m.version ?? '—'}</span>
                          <span style={{ fontSize: '12px', color: m.source === 'modrinth' ? M.accent : M.orange }}>{m.source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</span>
                          <button onClick={() => handleRemoveMod(m.id)} style={{ width: 28, height: 28, borderRadius: '6px', border: `1px solid ${M.border}`, background: 'transparent', color: M.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remover">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {tab === 'worlds' && (
                <div style={{ textAlign: 'center', padding: '48px', color: M.textMuted }}>
                  <Map size={32} color={M.textMuted} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '14px' }}>Mundos do modpack aparecerão aqui.<br /><span style={{ fontSize: '12px' }}>Disponível no Launcher</span></p>
                </div>
              )}
              {tab === 'shaders' && (
                <div style={{ textAlign: 'center', padding: '48px', color: M.textMuted }}>
                  <Sparkles size={32} color={M.textMuted} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '14px' }}>Shaderpacks aparecerão aqui.<br /><span style={{ fontSize: '12px' }}>Em breve</span></p>
                </div>
              )}
              {tab === 'resources' && (
                <div style={{ textAlign: 'center', padding: '48px', color: M.textMuted }}>
                  <Archive size={32} color={M.textMuted} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '14px' }}>Resource packs aparecerão aqui.<br /><span style={{ fontSize: '12px' }}>Em breve</span></p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      <CreateModpackModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />

      {/* Delete confirm modal */}
      <GlassModal isOpen={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="Deletar Modpack" size="sm">
        <p style={{ margin: '0 0 20px', color: M.textSub, fontSize: '14px' }}>
          Tem certeza que deseja deletar <strong style={{ color: M.text }}>{selected?.name}</strong>? Esta ação não pode ser desfeita.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={() => setDeleteConfirm(false)} style={{ padding: '9px 18px', borderRadius: M.radiusSm, border: `1px solid ${M.border}`, background: 'transparent', color: M.textSub, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleDelete} style={{ padding: '9px 18px', borderRadius: M.radiusSm, border: 'none', background: M.red, color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit' }}>
            Deletar
          </button>
        </div>
      </GlassModal>
    </div>
  )
}

// ── Download page ─────────────────────────────────────────────────────────────
// Public landing for the launcher binaries. Auto-detects OS to highlight the
// right download. Falls back to "all platforms" list when detection is
// inconclusive.

interface DownloadAsset {
  os:        'windows' | 'macos' | 'linux'
  label:     string
  /** Public URL served by the backend (Rails serves /downloads/* statically). */
  url:       string
  size?:     string
  format:    'installer' | 'portable'
  /** Disabled placeholders for platforms not yet built. */
  disabled?: boolean
}

const DOWNLOAD_ASSETS: DownloadAsset[] = [
  { os: 'windows', label: 'Windows 10/11 (Instalador)',  url: '/downloads/Nimbus-Launcher-Setup-0.1.3.exe', format: 'installer', size: '~72 MB' },
  { os: 'windows', label: 'Windows (Portable EXE)',      url: '/downloads/Nimbus-Launcher-Portable-0.1.3.exe', format: 'portable',  size: '~71 MB' },
  { os: 'windows', label: 'Windows (Portable ZIP)',      url: '/downloads/Nimbus-Launcher-v0.1.3-win-x64.zip', format: 'portable',  size: '~113 MB' },
  { os: 'macos',   label: 'macOS (em breve)',            url: '#',                                               format: 'installer', disabled: true },
  { os: 'linux',   label: 'Linux (em breve)',            url: '#',                                               format: 'installer', disabled: true },
]

function detectOS(): 'windows' | 'macos' | 'linux' | 'unknown' {
  const ua = (navigator.userAgent || '').toLowerCase()
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac') || ua.includes('darwin')) return 'macos'
  if (ua.includes('linux') || ua.includes('x11')) return 'linux'
  return 'unknown'
}

const DownloadPage: React.FC = () => {
  const detected = detectOS()
  const primary = DOWNLOAD_ASSETS.find(a => a.os === detected && !a.disabled && a.format === 'installer')
                ?? DOWNLOAD_ASSETS.find(a => !a.disabled)

  return (
    <div style={{ padding: '64px 24px 80px', maxWidth: 980, margin: '0 auto', animation: 'fadeIn 250ms ease' }}>
      <div style={{ textAlign: 'center', marginBottom: '52px' }}>
        <img src="/nimbus-logo-full.png" alt="Nimbus Launcher" width={220} height={220}
          style={{
            width: 220, height: 220, objectFit: 'contain', display: 'block', margin: '0 auto 20px',
            filter: `drop-shadow(0 12px 48px ${M.accent}55)`,
          }} />
        <h1 style={{ margin: '0 0 12px', fontSize: '40px', fontWeight: 800, letterSpacing: '-0.02em', color: M.text }}>
          Baixar Nimbus Launcher
        </h1>
        <p style={{ margin: '0 auto', maxWidth: 600, fontSize: '15px', lineHeight: 1.6, color: M.textSub }}>
          Instale modpacks com 1 clique, jogue com sua conta Microsoft, gerencie mods e shaders
          tudo num lugar. Grátis, código aberto, sem propaganda.
        </p>
      </div>

      {/* Primary CTA — auto-detected platform */}
      {primary && !primary.disabled && (
        <div style={{
          background: `linear-gradient(135deg, ${M.accent}18, ${M.accent}08)`,
          border: `1px solid ${M.accent}44`,
          borderRadius: '20px',
          padding: '28px 32px',
          marginBottom: '36px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px',
          boxShadow: `0 12px 40px ${M.accent}22`,
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: M.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              {detected === 'unknown' ? 'Recomendado' : 'Detectamos seu sistema'}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: M.text, marginBottom: '4px' }}>
              {primary.label}
            </div>
            <div style={{ fontSize: '13px', color: M.textMuted }}>
              {primary.format === 'installer' ? 'Instalador' : 'ZIP portável'}{primary.size ? ` · ${primary.size}` : ''}
            </div>
          </div>
          <a href={primary.url} download
            style={{
              padding: '16px 32px', fontSize: '16px', fontWeight: 800,
              background: M.accent, color: '#fff',
              borderRadius: '14px', textDecoration: 'none',
              boxShadow: `0 8px 28px ${M.accent}66, inset 0 1px 0 rgba(255,255,255,0.25)`,
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              transition: 'transform 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <Download size={20} aria-hidden="true" /> Baixar agora
          </a>
        </div>
      )}

      {/* All downloads */}
      <h2 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: M.textSub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Todas as plataformas
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px', marginBottom: '52px' }}>
        {DOWNLOAD_ASSETS.map((a) => {
          const isPrimary = primary && a.url === primary.url
          return (
            <a
              key={a.os + a.format}
              href={a.disabled ? undefined : a.url}
              download={!a.disabled ? '' : undefined}
              aria-disabled={a.disabled}
              style={{
                display: 'flex', flexDirection: 'column', gap: '6px',
                padding: '18px 20px', borderRadius: '14px',
                border: `1px solid ${isPrimary ? M.accent + '66' : M.border}`,
                background: a.disabled ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.045)',
                color: a.disabled ? M.textMuted : M.text,
                textDecoration: 'none',
                cursor: a.disabled ? 'not-allowed' : 'pointer',
                opacity: a.disabled ? 0.55 : 1,
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => { if (!a.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={(e) => { if (!a.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.045)' }}
            >
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{a.label}</div>
              <div style={{ fontSize: '12px', color: M.textMuted, display: 'flex', justifyContent: 'space-between' }}>
                <span>{a.format === 'installer' ? 'Instalador (.exe)' : 'Portable (.zip)'}</span>
                <span>{a.size ?? '—'}</span>
              </div>
            </a>
          )
        })}
      </div>

      {/* Install instructions */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${M.border}`,
        borderRadius: '16px',
        padding: '24px 28px',
      }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 800, color: M.text }}>
          Como instalar
        </h3>
        <ol style={{ margin: 0, paddingLeft: '22px', color: M.textSub, fontSize: '14px', lineHeight: 1.8 }}>
          <li>Baixe o instalador correspondente ao seu sistema operacional.</li>
          <li>Execute o arquivo. O Windows pode mostrar um aviso do SmartScreen — clique em
            <strong style={{ color: M.text }}> Mais informações</strong> e depois <strong style={{ color: M.text }}>Executar mesmo assim</strong>.</li>
          <li>Siga o assistente. O instalador cria atalhos no Menu Iniciar e na Área de Trabalho.</li>
          <li>Abra o launcher e faça login com sua conta Discord (clique em "Abrir site para login").</li>
          <li>Conecte sua conta Microsoft em Configurações para jogar online.</li>
        </ol>
      </div>

      <div style={{ textAlign: 'center', marginTop: '36px', fontSize: '12px', color: M.textMuted }}>
        Versão atual: 0.1.3 — <a href="https://github.com/tavimxlseven/NimbusLauncher" style={{ color: M.accent, textDecoration: 'none' }}>Código fonte</a>
      </div>
    </div>
  )
}

// ── Launcher Connect page ─────────────────────────────────────────────────────
// Legacy path: /launcher-connect. The new flow uses /auth/launcher (server-rendered
// handoff). This page just bounces over so old bookmarks keep working.

const LauncherConnectPage: React.FC<{ user: User | null }> = (_props) => {
  React.useEffect(() => {
    window.location.replace('/auth/launcher')
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: M.bg, padding: '24px' }}>
      <div style={{
        maxWidth: '420px', width: '100%', padding: '32px',
        background: 'rgba(255,255,255,0.055)',
        backdropFilter: 'blur(40px) saturate(200%)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%)',
        border: `1px solid ${M.border}`,
        borderRadius: M.radiusLg,
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        textAlign: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: M.textSub, fontSize: 14 }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
          Redirecionando…
        </div>
      </div>
    </div>
  )
}

// ── App shell ─────────────────────────────────────────────────────────────────

interface AppProps { initialTheme: ThemeConfig }

const App: React.FC<AppProps> = ({ initialTheme }) => {
  const [theme, setTheme] = useState(initialTheme)
  const [showThemeModal, setShowThemeModal] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const location = useLocation()

  useEffect(() => { apiFetchUser().then(setUser).catch(() => null) }, [])

  const handleThemeChange = (t: ThemeConfig) => { setTheme(t); applyTheme(t); savePreference(t) }

  const navLinkStyle = ({ isActive }: { isActive: boolean }): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '0 18px', height: '100%',
    fontSize: '15px', fontWeight: isActive ? 700 : 500,
    color: isActive ? M.text : M.textSub,
    textDecoration: 'none',
    borderBottom: isActive ? `2px solid ${M.accent}` : '2px solid transparent',
    transition: 'color 150ms ease, border-color 150ms ease',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ minHeight: '100vh', background: M.bg }}>
      <style>{GLOBAL_CSS}</style>

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(6,10,16,0.82)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        borderBottom: `1px solid rgba(255,255,255,0.12)`,
        height: M.navH,
        display: 'flex', alignItems: 'stretch',
        boxShadow: '0 2px 32px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.06)',
      }}>
        <div style={{
          width: '100%',
          display: 'flex', alignItems: 'stretch',
          padding: '0 24px', gap: '0',
        }}>
          {/* Logo */}
          <NavLink to="/" style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            textDecoration: 'none', marginRight: '24px', flexShrink: 0,
            padding: '0 4px',
          }}>
            <img
              src="/nimbus-mark.png"
              alt="Nimbus"
              width={36} height={36}
              style={{
                width: 36, height: 36, borderRadius: '10px',
                objectFit: 'cover',
                boxShadow: `0 0 20px ${M.accent}66`,
              }}
            />
            <span style={{ fontSize: '18px', fontWeight: 800, color: M.text, letterSpacing: '-0.02em' }}>
              Nimbus
            </span>
          </NavLink>

          {/* Nav links */}
          <nav style={{ display: 'flex', alignItems: 'stretch', flex: 1 }}>
            <NavLink to="/" end style={navLinkStyle} className="nav-link-item">
              <Home size={17} aria-hidden="true" />
              Início
            </NavLink>
            <NavLink to="/mods" style={navLinkStyle} className="nav-link-item">
              <Package size={17} aria-hidden="true" />
              Mods
            </NavLink>
            <NavLink to="/modpacks" style={navLinkStyle} className="nav-link-item">
              <Layers size={17} aria-hidden="true" />
              Modpacks
            </NavLink>
            <NavLink to="/library" style={navLinkStyle} className="nav-link-item">
              <Library size={17} aria-hidden="true" />
              Biblioteca
            </NavLink>
            <NavLink to="/download" style={navLinkStyle} className="nav-link-item">
              <Download size={17} aria-hidden="true" />
              Download
            </NavLink>
          </nav>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <button onClick={() => setShowThemeModal(true)}
              className="btn-ghost"
              style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(8px)',
                border: `1px solid ${M.border}`,
                borderRadius: M.radiusSm, padding: '8px', cursor: 'pointer',
                color: M.textSub, display: 'flex', alignItems: 'center',
                transition: 'background 150ms ease',
              }}
              aria-label="Tema"
            >
              <Settings size={17} aria-hidden="true" />
            </button>

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {user.avatar_url && (
                  <img src={user.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', border: `2px solid ${M.border}` }} />
                )}
                <span style={{ fontSize: '15px', fontWeight: 700, color: M.text }}>{user.username}</span>
                <button
                  onClick={() => fetch('/auth/logout', { method: 'DELETE', credentials: 'include' }).finally(() => { window.location.href = '/' })}
                  style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${M.border}`, borderRadius: M.radiusSm, cursor: 'pointer', color: M.textMuted, padding: '8px', display: 'flex', alignItems: 'center' }}
                  title="Sair"
                >
                  <LogOut size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <LoginButton />
            )}
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────────── */}
      <div style={{ width: '100%' }}>
        <Routes location={location}>
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="/mods" element={<BrowsePage key="mods" type="mods" user={user} />} />
          <Route path="/modpacks" element={<BrowsePage key="modpacks" type="modpacks" user={user} />} />
          <Route path="/library" element={<LibraryPage user={user} />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/launcher-connect" element={<LauncherConnectPage user={user} />} />
        </Routes>
      </div>

      {/* Theme modal */}
      <GlassModal isOpen={showThemeModal} onClose={() => setShowThemeModal(false)} title="Tema" size="sm">
        <ThemeSwitcher currentTheme={theme} onThemeChange={handleThemeChange} />
      </GlassModal>
    </div>
  )
}

export default App
