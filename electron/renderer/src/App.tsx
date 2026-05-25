/**
 * Nimbus Launcher — Renderer App
 * iOS LiquidGlass style, same design tokens as the website.
 */

import React, { useEffect, useState, useCallback, type CSSProperties } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Library, Package, Settings,
  Layers, Play, FolderOpen, Loader,
  LogOut, Plus, Trash2, Download, RefreshCw, Globe, X,
} from 'lucide-react'

// ── Brand assets (handled by Vite — emits hashed files in dist/assets/) ──────
import nimbusMark     from './assets/nimbus-mark-128.png'
import nimbusLogoFull from './assets/nimbus-logo-full.png'

// ── Update modal ──────────────────────────────────────────────────────────────
import { UpdateModal } from './components/UpdateModal'

// ── Repair modal ──────────────────────────────────────────────────────────────
import { ModpackRepairModal } from './components/ModpackRepairModal'

// ── Backend URL ───────────────────────────────────────────────────────────────
// In production builds (Electron packaged app), always use nimbusgg.me.
// In dev (Vite dev server), use localhost:3000.
const BACKEND_URL = import.meta.env.PROD
  ? 'https://nimbusgg.me'
  : (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000')

// ── Design tokens (same as website) ──────────────────────────────────────────

const M = {
  bg:       '#080c12',
  border:   'rgba(255,255,255,0.12)',
  accent:   '#1bd96a',
  text:     'rgba(255,255,255,0.97)',
  textSub:  'rgba(255,255,255,0.65)',
  textMuted:'rgba(255,255,255,0.38)',
  red:      '#f85149',
  orange:   '#e3b341',
  blue:     '#58a6ff',
  radius:   '14px',
  radiusSm: '10px',
  radiusLg: '18px',
  sideW:    '240px',
  titleH:   '40px',
}

// ── Global CSS ────────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root {
    margin: 0; padding: 0; height: 100%;
    background: ${M.bg};
    color: ${M.text};
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    font-size: 14px;
    overflow: hidden;
    user-select: none;
  }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 3px; }

  .nav-btn { transition: background 150ms ease, color 150ms ease; }
  .nav-btn:hover { background: rgba(255,255,255,0.10) !important; color: ${M.text} !important; }
  .nav-btn.active { background: rgba(27,217,106,0.15) !important; color: ${M.accent} !important; }

  .mp-card { transition: all 160ms ease; cursor: pointer; }
  .mp-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important; }

  .play-btn { transition: all 150ms ease; }
  .play-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(27,217,106,0.5) !important; }

  .tab-btn { transition: all 150ms ease; }
  .tab-btn:hover { background: rgba(255,255,255,0.08) !important; }
  .tab-btn.active { background: rgba(27,217,106,0.15) !important; color: ${M.accent} !important; border-bottom: 2px solid ${M.accent} !important; }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:0.6; } 50% { opacity:1; } }

  /* Drag region for frameless window */
  .titlebar { -webkit-app-region: drag; }
  .titlebar button { -webkit-app-region: no-drag; }
`

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  id: string
  username: string
  avatar?: string
  email?: string
}

interface Modpack {
  id: string
  external_id: string
  name: string
  source: string
  imageUrl?: string
  loader?: string
  mcVersion?: string
  description?: string
  version?: string
  installed?: boolean
}

interface Mod {
  id: string
  name: string
  version?: string
  source?: string
  icon_url?: string
  enabled?: boolean
}

// ── Nimbus API bridge (from preload) ──────────────────────────────────────────

declare global {
  interface Window {
    nimbus?: {
      window: { minimize(): void; maximize(): void; close(): void }
      openExternal: (url: string) => Promise<void>
      openFolder: (p: string) => Promise<{ ok: boolean; error?: string }>
      instancePath: (modpackId: string) => Promise<string>
      instanceListFolder: (modpackId: string, folder: string) => Promise<{ ok: boolean; files: Array<{ name: string; size: number; enabled: boolean }>; error?: string }>
      instanceToggleFile: (modpackId: string, folder: string, filename: string) => Promise<{ ok: boolean; newName?: string; error?: string }>
      instanceDeleteFile: (modpackId: string, folder: string, filename: string) => Promise<{ ok: boolean; error?: string }>
      onAuthToken: (cb: (token: string) => void) => () => void
      openDiscordLogin: (backendUrl: string) => Promise<{ success: boolean; user?: unknown }>
      session: {
        get(): Promise<string | null>
        set(token: string): Promise<boolean>
        clear(): Promise<boolean>
      }
      backend: {
        fetch(path: string, opts?: { method?: string; body?: unknown }): Promise<{
          ok: boolean; status: number; data?: unknown; error?: string
        }>
      }
      settings: {
        get(): Promise<Record<string, unknown>>
        save(partial: Record<string, unknown>): Promise<Record<string, unknown>>
      }
      game?: {
        launch(req: unknown): Promise<{ ok: boolean; error?: string; exitCode?: number | null; logPath?: string }>
        onProgress(cb: (p: unknown) => void): () => void
        onLog(cb: (entry: unknown) => void): () => void
        openLogFile?: () => Promise<{ ok: boolean; error?: string; path?: string }>
      }
      auth: {
        startDeviceCodeFlow(): Promise<unknown>
        pollForToken(deviceCode: string, interval?: number): Promise<unknown>
        refreshToken(refreshToken: string): Promise<unknown>
        storeTokens(tokens: unknown): Promise<unknown>
        loadTokens(): Promise<unknown>
        deleteTokens(): Promise<unknown>
      }
      java?: {
        detectAll(): Promise<{ success: boolean; data?: unknown[]; error?: string }>
      }
      library: {
        get(): Promise<{ success: boolean; data?: unknown[] }>
      }
      update?: {
        checkForUpdates(): Promise<{
          updateRequired: boolean
          updateAvailable: boolean
          versionInfo: {
            current: string
            minimum: string
            downloadUrl: string
            releaseNotes?: string
          }
        }>
        getCurrentVersion(): Promise<string>
      }
    }
  }
}

const nimbus = window.nimbus

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOADER_COLORS: Record<string, string> = {
  fabric:   '#dbb168',
  forge:    '#5b8dd9',
  neoforge: '#e07b39',
  quilt:    '#c27adb',
}

function isCustomModpack(externalId: string): boolean {
  return externalId.startsWith('custom-')
}

async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  // Prefer main-process fetch (which attaches the Bearer launcher session
  // token from the OS-protected store) when available. Fallback to native
  // fetch for dev/testing in a regular browser.
  if (window.nimbus?.backend?.fetch) {
    const method = (opts?.method ?? 'GET').toUpperCase()
    let body: unknown = undefined
    if (opts?.body) {
      try { body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body }
      catch { body = opts.body }
    }
    const res = await window.nimbus.backend.fetch(path, { method, body }) as
      { ok: boolean; status: number; data?: unknown; error?: string }
    const status = res.status || (res.ok ? 200 : 500)
    // 204 No Content / 205 Reset Content / 1xx must not have a body
    // per the Fetch spec, so build the Response without one.
    const noBodyStatus = status === 204 || status === 205 || (status >= 100 && status < 200)
    const init: ResponseInit = { status, headers: { 'Content-Type': 'application/json' } }
    const responseBody = noBodyStatus
      ? null
      : (res.data !== undefined ? JSON.stringify(res.data) : (res.error ?? ''))
    return new Response(responseBody, init)
  }
  return fetch(`${BACKEND_URL}${path}`, { credentials: 'include', ...opts })
}

// ── TitleBar ──────────────────────────────────────────────────────────────────

interface TitleBarProps {
  user?: User | null
  onLogout?: () => void
}

const TitleBar: React.FC<TitleBarProps> = ({ user, onLogout }) => (
  <div className="titlebar" style={{
    height: M.titleH,
    background: 'rgba(6,10,16,0.90)',
    backdropFilter: 'blur(32px) saturate(200%)',
    WebkitBackdropFilter: 'blur(32px) saturate(200%)',
    borderBottom: `1px solid ${M.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px',
    flexShrink: 0,
    boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
  }}>
    {/* macOS traffic lights + Logo */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {nimbus && (
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { color: '#ff5f57', action: () => nimbus.window.close(), title: 'Fechar' },
            { color: '#ffbd2e', action: () => nimbus.window.minimize(), title: 'Minimizar' },
            { color: '#28c840', action: () => nimbus.window.maximize(), title: 'Maximizar' },
          ].map(btn => (
            <button key={btn.title} onClick={btn.action} title={btn.title}
              style={{
                width: 12, height: 12, borderRadius: '50%',
                background: btn.color, border: 'none', cursor: 'pointer',
                transition: 'opacity 150ms', opacity: 0.85,
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.85')}
            />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: 22, height: 22, borderRadius: '6px',
          background: `linear-gradient(135deg, ${M.accent}, #17c45e)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 12px ${M.accent}66`,
        }}>
          <Layers size={13} color="#fff" />
        </div>
        <span style={{ fontSize: '13px', fontWeight: 800, color: M.text, letterSpacing: '-0.01em' }}>
          Nimbus Launcher
        </span>
      </div>
    </div>

    {/* User info + logout */}
    {user && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '12px', color: M.textSub, fontWeight: 500 }}>
          {user.username}
        </span>
        {user.avatar && (
          <img src={user.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${M.border}` }} />
        )}
        {onLogout && (
          <button onClick={onLogout} title="Sair"
            style={{
              width: 28, height: 28, borderRadius: M.radiusSm,
              border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.06)',
              color: M.textMuted, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `rgba(${M.red},0.15)`; e.currentTarget.style.color = M.red }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = M.textMuted }}
          >
            <LogOut size={13} />
          </button>
        )}
      </div>
    )}
  </div>
)

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/',        icon: Home,    label: 'Início' },
  { to: '/library', icon: Library, label: 'Biblioteca' },
  { to: '/mods',    icon: Package, label: 'Mods' },
  { to: '/settings',icon: Settings,label: 'Configurações' },
]

// ── Microsoft account hook ───────────────────────────────────────────────────
// Centralised state so Sidebar and SettingsPage stay in sync. Anyone that
// updates the account dispatches a `nimbus:ms-account-changed` CustomEvent;
// every consumer listens for it. Lighter than React Context for this single
// piece of cross-cutting state.

interface MsAccount { username: string; uuid?: string }

function useMicrosoftAccount(): [MsAccount | null, (next: MsAccount | null) => void] {
  const [account, setAccount] = useState<MsAccount | null>(null)

  // Load on mount + refresh when expired.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!window.nimbus?.auth?.loadTokens) return
      try {
        const r = await window.nimbus.auth.loadTokens() as {
          success: boolean
          data?: { minecraft?: { name?: string; id?: string }; expiresAt?: number; refreshToken?: string }
        }
        if (cancelled) return
        if (r.success && r.data?.minecraft?.name) {
          setAccount({ username: r.data.minecraft.name, uuid: r.data.minecraft.id })
          // Quietly refresh in background when expired.
          const expired = !r.data.expiresAt || r.data.expiresAt < Date.now()
          if (expired && r.data.refreshToken) {
            void (async () => {
              try {
                const ref = await window.nimbus!.auth!.refreshToken(r.data!.refreshToken!) as {
                  success: boolean
                  data?: { minecraft?: { name?: string; id?: string } }
                }
                if (!cancelled && ref.success && ref.data?.minecraft?.name) {
                  setAccount({ username: ref.data.minecraft.name, uuid: ref.data.minecraft.id })
                }
              } catch { /* ignore */ }
            })()
          }
        }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Listen for cross-component updates.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<MsAccount | null>
      setAccount(ce.detail)
    }
    window.addEventListener('nimbus:ms-account-changed', handler)
    return () => window.removeEventListener('nimbus:ms-account-changed', handler)
  }, [])

  // Setter that broadcasts the change so other components update too.
  const update = useCallback((next: MsAccount | null) => {
    setAccount(next)
    window.dispatchEvent(new CustomEvent('nimbus:ms-account-changed', { detail: next }))
  }, [])

  return [account, update]
}

const Sidebar: React.FC = () => {
  const [msAccount] = useMicrosoftAccount()
  return (
  <aside style={{
    width: M.sideW, flexShrink: 0,
    position: 'relative',
    background: 'linear-gradient(180deg, rgba(27,217,106,0.06) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.025) 100%)',
    backdropFilter: 'blur(40px) saturate(200%)',
    WebkitBackdropFilter: 'blur(40px) saturate(200%)',
    borderRight: `1px solid ${M.border}`,
    boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04), 1px 0 24px rgba(0,0,0,0.35)',
    display: 'flex', flexDirection: 'column',
    padding: '18px 12px 12px',
    overflowY: 'auto',
  }}>
    {/* Brand */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: '11px',
      padding: '4px 8px 18px',
      borderBottom: `1px solid ${M.border}`,
      marginBottom: '14px',
    }}>
      <img
        src={nimbusMark}
        alt="Nimbus"
        width={38} height={38}
        style={{
          width: 38, height: 38, borderRadius: '12px',
          objectFit: 'cover',
          boxShadow: `0 6px 18px ${M.accent}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: M.text, letterSpacing: '-0.02em' }}>
          Nimbus
        </div>
        <div style={{ fontSize: '11px', color: M.textMuted, fontWeight: 500 }}>
          Launcher Beta
        </div>
      </div>
    </div>

    {/* Section label */}
    <div style={{ fontSize: '11px', fontWeight: 700, color: M.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 8px 6px' }}>
      Navegação
    </div>

    {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
      <NavLink key={to} to={to} end={to === '/'}
        className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
        style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: '11px',
          padding: '11px 12px', borderRadius: M.radius,
          textDecoration: 'none', fontSize: '14px',
          fontWeight: isActive ? 700 : 500,
          color: isActive ? M.accent : M.textSub,
          marginBottom: '3px',
          border: '1px solid transparent',
          background: isActive
            ? 'linear-gradient(135deg, rgba(27,217,106,0.18), rgba(27,217,106,0.08))'
            : 'transparent',
          boxShadow: isActive ? `inset 0 0 0 1px rgba(27,217,106,0.30), 0 4px 14px rgba(27,217,106,0.10)` : 'none',
          transition: 'all 180ms ease',
        })}
      >
        <Icon size={18} />
        {label}
      </NavLink>
    ))}

    {/* Footer / spacer */}
    <div style={{ flex: 1 }} />

    {/* Microsoft account card — visible when the user has linked an MS account
        in Settings. Helps surface "logged in as X" without leaving the page. */}
    {msAccount && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 10px',
        borderRadius: M.radius,
        border: `1px solid ${M.border}`,
        background: 'rgba(255,255,255,0.04)',
        marginBottom: '10px',
      }}>
        {msAccount.uuid ? (
          <img
            src={`https://api.mineatar.io/face/${msAccount.uuid}?scale=4&overlay=true`}
            alt={msAccount.username}
            width={32} height={32}
            style={{
              width: 32, height: 32, borderRadius: M.radiusSm,
              imageRendering: 'pixelated' as const,
              background: 'rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: M.radiusSm,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '16px' }}>⛏</span>
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {msAccount.username}
          </div>
          <div style={{ fontSize: '10px', color: M.accent, fontWeight: 500 }}>
            Minecraft
          </div>
        </div>
      </div>
    )}

    <div style={{
      borderTop: `1px solid ${M.border}`,
      padding: '12px 8px 4px',
      fontSize: '10px', color: M.textMuted,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontWeight: 600 }}>v0.1.0</span>
      <a href="https://nimbusgg.me" target="_blank" rel="noreferrer"
        style={{ color: M.textMuted, textDecoration: 'none' }}>
        nimbusgg.me
      </a>
    </div>
  </aside>
  )
}

// ── Login screen ──────────────────────────────────────────────────────────────

interface LoginScreenProps {
  onLogin: (user: User) => void
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [step, setStep] = useState<'idle' | 'waiting' | 'token-entry'>('idle')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Listen for deep link token (nimbus://auth?token=XXX sent by the website)
  useEffect(() => {
    if (!window.nimbus?.onAuthToken) return
    const cleanup = window.nimbus.onAuthToken(async (tok) => {
      setToken(tok)
      // Auto-verify the token received via deep link
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/launcher/poll?token=${encodeURIComponent(tok)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.data?.status === 'ok') {
            const sessionToken = data.data.session_token as string | undefined
            if (sessionToken && window.nimbus?.session?.set) {
              await window.nimbus.session.set(sessionToken)
            }
            onLogin({
              id: String(data.data.id ?? ''),
              username: data.data.username ?? 'Usuário',
              avatar: data.data.avatar_url,
            })
            return
          }
        }
      } catch { /* ignore */ }
      // If auto-verify failed, show token entry with pre-filled token
      setStep('token-entry')
    })
    return cleanup
  }, [onLogin])

  const handleOpenSite = () => {
    const url = `${BACKEND_URL}/auth/launcher`
    if (window.nimbus?.openExternal) {
      window.nimbus.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
    setStep('waiting')
    setError(null)
  }

  const handleSubmitToken = async () => {
    const tok = token.trim()
    if (!tok) { setError('Cole o token gerado no site'); return }
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/launcher/poll?token=${encodeURIComponent(tok)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.data?.status === 'ok') {
          const sessionToken = data.data.session_token as string | undefined
          if (sessionToken && window.nimbus?.session?.set) {
            await window.nimbus.session.set(sessionToken)
          }
          onLogin({
            id: String(data.data.id ?? ''),
            username: data.data.username ?? 'Usuário',
            avatar: data.data.avatar_url,
          })
          return
        }
      }
      setError('Token inválido ou expirado. Gere um novo no site.')
    } catch {
      setError('Erro ao verificar token. Verifique sua conexão.')
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: M.bg, animation: 'fadeIn 300ms ease',
    }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{
        position: 'fixed', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '600px', height: '400px', borderRadius: '50%',
        background: `radial-gradient(ellipse, ${M.accent}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '400px', padding: '44px 40px',
        background: 'rgba(255,255,255,0.055)',
        backdropFilter: 'blur(40px) saturate(200%)',
        WebkitBackdropFilter: 'blur(40px) saturate(200%)',
        border: `1px solid ${M.border}`,
        borderRadius: M.radiusLg,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06) inset',
        textAlign: 'center',
      }}>
        <img
          src={nimbusLogoFull}
          alt="Nimbus Launcher"
          style={{
            width: 168, height: 168, objectFit: 'contain',
            margin: '0 auto 8px', display: 'block',
            filter: `drop-shadow(0 8px 32px ${M.accent}55)`,
          }}
        />

        <h1 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 800, color: M.text }}>
          Nimbus Launcher
        </h1>

        {step === 'idle' && (
          <>
            <p style={{ margin: '0 0 28px', fontSize: '14px', color: M.textSub }}>
              Faça login pelo site para conectar o launcher
            </p>
            <button onClick={handleOpenSite}
              style={{
                width: '100%', padding: '13px 20px',
                background: M.accent, border: 'none', borderRadius: M.radius,
                color: '#fff', fontSize: '15px', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                boxShadow: `0 4px 20px ${M.accent}44`,
                transition: 'all 150ms ease',
              }}>
              <Globe size={18} /> Abrir site para login
            </button>
            {error && <p style={{ margin: '14px 0 0', fontSize: '13px', color: M.red }}>{error}</p>}
          </>
        )}

        {step === 'waiting' && (
          <>
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: M.textSub }}>
              Complete o login em <strong style={{ color: M.accent }}>nimbusgg.me</strong>
            </p>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: M.textMuted }}>
              O launcher abrirá automaticamente após o login.<br />
              Ou cole o token manualmente abaixo:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
              <Loader size={16} color={M.accent} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '13px', color: M.textMuted }}>Aguardando...</span>
            </div>
            <button onClick={() => setStep('token-entry')}
              style={{
                width: '100%', padding: '10px', borderRadius: M.radiusSm,
                border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.06)',
                color: M.textSub, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
                marginBottom: '8px',
              }}>
              Inserir token manualmente
            </button>
            <button onClick={() => setStep('idle')}
              style={{
                width: '100%', padding: '8px', borderRadius: M.radiusSm,
                border: 'none', background: 'transparent',
                color: M.textMuted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
              }}>
              Cancelar
            </button>
          </>
        )}

        {step === 'token-entry' && (
          <>
            <p style={{ margin: '0 0 6px', fontSize: '14px', color: M.textSub }}>
              Cole o token gerado em <strong style={{ color: M.accent }}>nimbusgg.me/auth/launcher</strong>
            </p>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: M.textMuted }}>
              Faça login no site, copie o token e cole abaixo:
            </p>
            <input
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Cole o token aqui..."
              onKeyDown={e => e.key === 'Enter' && handleSubmitToken()}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: M.radiusSm,
                border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.07)',
                color: M.text, fontSize: '13px', fontFamily: 'monospace',
                outline: 'none', marginBottom: '12px', boxSizing: 'border-box',
                letterSpacing: '0.03em',
              }}
              autoFocus
            />
            <button onClick={handleSubmitToken}
              style={{
                width: '100%', padding: '11px', borderRadius: M.radiusSm,
                border: 'none', background: M.accent, color: '#fff',
                cursor: 'pointer', fontSize: '14px', fontWeight: 700,
                fontFamily: 'inherit', marginBottom: '8px',
              }}>
              Conectar
            </button>
            <button onClick={() => { setStep('idle'); setToken('') }}
              style={{
                width: '100%', padding: '9px', borderRadius: M.radiusSm,
                border: `1px solid ${M.border}`, background: 'transparent',
                color: M.textSub, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
              }}>
              Voltar
            </button>
            {error && <p style={{ margin: '12px 0 0', fontSize: '13px', color: M.red }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}

// ── Modpack Detail Panel ──────────────────────────────────────────────────────

type DetailTab = 'mods' | 'worlds' | 'shaders' | 'resources' | 'datapacks'

interface ModpackDetailProps {
  modpack: Modpack
  user?: User | null
  onUpdated?: (mp: Modpack) => void
  onDeleted?: (id: string) => void
}

// ── Modpack edit modal ───────────────────────────────────────────────────────

interface ModpackEditModalProps {
  modpack: Modpack
  onClose:   () => void
  onSaved:   (m: Modpack) => void
  onDeleted: (id: string) => void
}

const ModpackEditModal: React.FC<ModpackEditModalProps> = ({ modpack, onClose, onSaved, onDeleted }) => {
  const [name, setName]         = useState(modpack.name)
  const [imageUrl, setImageUrl] = useState(modpack.imageUrl ?? '')
  const [description, setDesc]  = useState(modpack.description ?? '')
  const [saving, setSaving]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      const res = await apiFetch(`/api/v1/library/${modpack.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          library_item: {
            name,
            image_url:   imageUrl || null,
            description: description || null,
          },
        }),
      })
      if (!res.ok) {
        setError(`Erro ao salvar (HTTP ${res.status})`)
        return
      }
      const json = await res.json()
      const d = json.data as Record<string, unknown>
      onSaved({
        ...modpack,
        name:        String(d['name'] ?? name),
        imageUrl:    (d['image_url'] as string | null | undefined) ?? undefined,
        description: (d['description'] as string | null | undefined) ?? undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true); setError(null)
    try {
      const res = await apiFetch(`/api/v1/library/${modpack.id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        onDeleted(modpack.id)
        return
      }
      setError(`Erro ao excluir (HTTP ${res.status})`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div onClick={() => !saving && !deleting && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 180ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '480px', maxWidth: '92vw', padding: '24px',
        background: 'rgba(20,25,35,0.96)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: `1px solid ${M.border}`,
        borderRadius: '20px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: M.text, flex: 1 }}>
            Editar modpack
          </h3>
          <button onClick={onClose} disabled={saving || deleting}
            style={{
              width: 28, height: 28, borderRadius: '8px',
              background: 'transparent', border: 'none',
              color: M.textMuted, cursor: (saving || deleting) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X size={15} />
          </button>
        </div>

        {/* Image preview */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '14px',
            overflow: 'hidden', flexShrink: 0,
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${M.border}`,
          }}>
            {imageUrl ? (
              <img src={imageUrl} alt="" onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={28} color={M.textMuted} />
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: M.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>
              URL da imagem
            </label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
              placeholder="https://…"
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)', border: `1px solid ${M.border}`,
                color: M.text, fontSize: '12px', fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: M.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>
            Nome
          </label>
          <input value={name} onChange={e => setName(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${M.border}`,
              color: M.text, fontSize: '13px', fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: M.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>
            Descrição
          </label>
          <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3}
            placeholder="Opcional"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${M.border}`,
              color: M.text, fontSize: '13px', fontFamily: 'inherit', outline: 'none',
              resize: 'vertical', minHeight: '64px',
            }}
          />
        </div>

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: '10px', background: `${M.red}15`, border: `1px solid ${M.red}33`, color: M.red, fontSize: '12px', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                style={{
                  padding: '9px 14px', borderRadius: '10px',
                  background: 'transparent', border: `1px solid ${M.border}`,
                  color: M.textSub, cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  fontFamily: 'inherit',
                }}>
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{
                  flex: 1, padding: '9px 14px', borderRadius: '10px',
                  background: M.red, border: 'none', color: '#fff',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  opacity: deleting ? 0.7 : 1,
                }}>
                {deleting ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                Confirmar exclusão
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setConfirmDelete(true)} disabled={saving}
                style={{
                  padding: '9px 14px', borderRadius: '10px',
                  background: 'transparent', border: `1px solid ${M.red}55`,
                  color: M.red, cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                <Trash2 size={13} /> Excluir modpack
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onClose} disabled={saving}
                  style={{
                    padding: '9px 16px', borderRadius: '10px',
                    background: 'transparent', border: `1px solid ${M.border}`,
                    color: M.textSub, cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                    fontFamily: 'inherit',
                  }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{
                    padding: '9px 18px', borderRadius: '10px',
                    background: M.accent, border: 'none', color: '#fff',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    opacity: saving ? 0.7 : 1,
                  }}>
                  {saving && <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                  Salvar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const ModpackDetail: React.FC<ModpackDetailProps> = ({ modpack, user, onUpdated, onDeleted }) => {
  const [tab, setTab] = useState<DetailTab>('mods')
  const [mods, setMods] = useState<Mod[]>([])
  const [modsLoading, setModsLoading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(modpack.installed ?? false)
  const [editing, setEditing] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState<{ phase: string; message: string; percent?: number } | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [launchLog, setLaunchLog] = useState<string>('')
  const [showLog, setShowLog] = useState(false)
  const [modSearch, setModSearch] = useState('')

  // Reset local state whenever a new modpack is selected
  useEffect(() => {
    setInstalled(modpack.installed ?? false)
    setTab('mods')
    setMods([])
    setEditing(false)
    setProgress(null)
    setLaunchError(null)
  }, [modpack.id, modpack.installed])

  // Subscribe once to game progress events
  useEffect(() => {
    if (!window.nimbus?.game?.onProgress) return
    const offProg = window.nimbus.game.onProgress((p) => {
      const prog = p as { phase: string; message: string; percent?: number }
      setProgress(prog)
      if (prog.phase === 'error') {
        setLaunchError(prog.message)
        setPlaying(false)
      }
      if (prog.phase === 'done') {
        setTimeout(() => {
          setPlaying(false)
          setProgress(null)
        }, 1500)
      }
    })
    const offLog = window.nimbus.game.onLog?.((entry) => {
      const e = entry as { stream: 'stdout' | 'stderr'; data: string }
      // Keep up to 200 KB of log so we capture the actual crash cause,
      // which is usually near the beginning ("Caused by: ...") rather than the end.
      setLaunchLog(prev => {
        const next = prev + (e.data || '')
        return next.length > 200_000 ? next.slice(-200_000) : next
      })
    })
    return () => { offProg(); offLog?.() }
  }, [])

  const isCustom = isCustomModpack(modpack.external_id)
  const loaderColor = modpack.loader ? (LOADER_COLORS[modpack.loader.toLowerCase()] ?? M.textSub) : M.textSub

  const fetchMods = useCallback(async () => {
    setModsLoading(true)
    try {
      const res = await apiFetch(`/api/v1/library/${modpack.id}/mods`)
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data.data ?? [])
        setMods(list.map((m: Record<string, unknown>) => ({
          id: String(m.id ?? m.mod_id ?? ''),
          name: String(m.name ?? m.mod_name ?? ''),
          version: m.version as string | undefined,
          source: m.source as string | undefined,
          icon_url: m.icon_url as string | undefined,
          enabled: m.enabled !== false,
        })))
      }
    } catch {
      // ignore
    } finally {
      setModsLoading(false)
    }
  }, [modpack.id])

  useEffect(() => {
    if ((isCustom || installed) && tab === 'mods') {
      fetchMods()
    }
  }, [tab, isCustom, installed, fetchMods])

  // Mark modpack as installed: for external modpacks, this triggers the
  // server-side importer that downloads the modpack archive, parses the
  // manifest and inserts mod rows. For custom modpacks it just flips the flag.
  const handleInstall = async () => {
    setInstalling(true)
    try {
      const res = await apiFetch(`/api/v1/library/${modpack.id}/install`, { method: 'POST' })
      if (res.ok) {
        setInstalled(true)
        onUpdated?.({ ...modpack, installed: true })
      } else {
        const json = await res.json().catch(() => null)
        const msg = json?.errors?.[0]?.message ?? `Erro HTTP ${res.status}`
        setLaunchError(msg)
      }
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setInstalling(false)
    }
  }

  // Launch Minecraft for this modpack — resolve mods from backend, install
  // vanilla + loader, download mods, then spawn java.
  const handlePlay = async () => {
    if (!window.nimbus?.game?.launch) {
      setLaunchError('Disponível apenas no launcher instalado.')
      return
    }
    if (!user) {
      setLaunchError('Faça login antes de jogar.')
      return
    }
    setLaunchError(null); setPlaying(true)
    setLaunchLog('')
    setProgress({ phase: 'preparing', message: 'Preparando…', percent: 0 })

    try {
      // Read launcher settings (memory limits + optional Java override).
      const settings = (await window.nimbus.settings.get()) as {
        javaPath?: string; maxMemoryMb?: number; autoJava?: boolean;
      }
      // Default behaviour: launcher manages Java automatically per modpack.
      const autoJava = settings.autoJava !== false

      // Re-fetch the library item RIGHT BEFORE launching so we always use
      // the freshest loader/mc_version from the backend. The `modpack` prop
      // can be stale (e.g. user reinstalled a modpack and the React state
      // wasn't refreshed yet), which used to cause us to launch Fabric
      // for a NeoForge pack and explode with "Incompatible mods".
      let freshLoader     = modpack.loader
      let freshMcVersion  = modpack.mcVersion
      try {
        const itemRes = await apiFetch(`/api/v1/library/${modpack.id}`)
        if (itemRes.ok) {
          const itemJson = await itemRes.json() as { data?: Record<string, unknown> }
          const d = itemJson.data ?? {}
          freshLoader    = (d['loader']     as string | undefined) ?? freshLoader
          freshMcVersion = (d['mc_version'] as string | undefined) ?? freshMcVersion
          // Update parent state so subsequent reads see the corrected values.
          if (freshLoader !== modpack.loader || freshMcVersion !== modpack.mcVersion) {
            onUpdated?.({ ...modpack, loader: freshLoader, mcVersion: freshMcVersion })
          }
        }
      } catch {
        // Network error → fall back to whatever's in the prop; better than nothing.
      }

      // Pull the modpack's mods (with version_id stored when the user added them).
      const modsRes = await apiFetch(`/api/v1/library/${modpack.id}/mods`)
      const modsJson = modsRes.ok ? await modsRes.json() : { data: [] }
      const list = (Array.isArray(modsJson) ? modsJson : (modsJson.data ?? [])) as Array<Record<string, unknown>>
      const modSpecs = list
        .filter(m => m['enabled'] !== false && m['version'])
        .map(m => ({
          id:         m['id'],
          source:     m['source'] as 'modrinth' | 'curseforge',
          externalId: String(m['external_id'] ?? ''),
          versionId:  String(m['version'] ?? ''),
          name:       m['name'] as string | undefined,
        }))

      // Fetch the modpack archive URL so the launcher can extract overrides/
      // (configs, KubeJS scripts, default options.txt, etc.). For custom
      // modpacks this endpoint returns 422 — we just skip overrides then.
      let archiveUrl:  string | null = null
      let archiveSha1: string | null = null
      try {
        const archRes = await apiFetch(`/api/v1/library/${modpack.id}/archive`)
        if (archRes.ok) {
          const archJson = await archRes.json() as { data?: Record<string, unknown> }
          archiveUrl  = (archJson.data?.['download_url'] as string | undefined) ?? null
          archiveSha1 = (archJson.data?.['sha1']         as string | undefined) ?? null
        }
      } catch { /* non-fatal */ }

      const result = await window.nimbus.game.launch({
        modpackId:          String(modpack.id),
        modpackName:        modpack.name,
        mcVersion:          freshMcVersion ?? '1.20.1',
        loader:             (freshLoader as 'fabric' | 'forge' | 'neoforge' | 'quilt') ?? 'fabric',
        mods:               modSpecs,
        offlineUsername:    user.username,
        javaPath:           settings.javaPath ?? '',
        autoJava,
        maxMemoryMb:        settings.maxMemoryMb ?? 8192,
        modpackArchiveUrl:  archiveUrl,
        modpackArchiveSha1: archiveSha1,
      } as never) as { ok: boolean; error?: string; exitCode?: number | null }

      if (!result.ok) {
        setLaunchError(result.error ?? 'Erro ao iniciar Minecraft')
        setPlaying(false)
        setProgress(null)
      }
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : 'Erro')
      setPlaying(false)
      setProgress(null)
    }
  }

  const handleRemoveMod = async (modId: string) => {
    try {
      await apiFetch(`/api/v1/library/${modpack.id}/mods/${modId}`, { method: 'DELETE' })
      setMods(prev => prev.filter(m => m.id !== modId))
    } catch {
      // ignore
    }
  }

  const toggleMod = async (mod: Mod) => {
    const next = !(mod.enabled ?? true)
    // Optimistic update
    setMods(prev => prev.map(m => m.id === mod.id ? { ...m, enabled: next } : m))
    try {
      await apiFetch(`/api/v1/library/${modpack.id}/mods/${mod.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: next }),
      })
    } catch {
      // Revert on error
      setMods(prev => prev.map(m => m.id === mod.id ? { ...m, enabled: !next } : m))
    }
  }

  // Reset mod search when modpack changes
  useEffect(() => { setModSearch('') }, [modpack.id])

  // ── Local folder state (shaders, resourcepacks, datapacks) ──────────────────
  type LocalFile = { name: string; size: number; enabled: boolean }
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([])
  const [localLoading, setLocalLoading] = useState(false)

  const FOLDER_MAP: Partial<Record<DetailTab, string>> = {
    shaders:   'shaderpacks',
    resources: 'resourcepacks',
    datapacks: 'datapacks',
  }

  const loadLocalFolder = useCallback(async (t: DetailTab) => {
    const folder = FOLDER_MAP[t]
    if (!folder || !window.nimbus?.instanceListFolder) return
    setLocalLoading(true)
    try {
      const res = await window.nimbus.instanceListFolder(String(modpack.id), folder) as { ok: boolean; files: LocalFile[] }
      if (res.ok) setLocalFiles(res.files)
    } catch { /* ignore */ }
    finally { setLocalLoading(false) }
  }, [modpack.id])

  useEffect(() => {
    if (tab === 'shaders' || tab === 'resources' || tab === 'datapacks') {
      loadLocalFolder(tab)
    }
  }, [tab, loadLocalFolder])

  const handleToggleLocalFile = async (file: LocalFile) => {
    const folder = FOLDER_MAP[tab]
    if (!folder || !window.nimbus?.instanceToggleFile) return
    const res = await window.nimbus.instanceToggleFile(String(modpack.id), folder, file.name) as { ok: boolean; newName?: string }
    if (res.ok && res.newName) {
      setLocalFiles(prev => prev.map(f => f.name === file.name
        ? { ...f, name: res.newName!, enabled: !res.newName!.endsWith('.disabled') }
        : f
      ))
    }
  }

  const handleDeleteLocalFile = async (file: LocalFile) => {
    const folder = FOLDER_MAP[tab]
    if (!folder || !window.nimbus?.instanceDeleteFile) return
    const res = await window.nimbus.instanceDeleteFile(String(modpack.id), folder, file.name) as { ok: boolean }
    if (res.ok) setLocalFiles(prev => prev.filter(f => f.name !== file.name))
  }

  const handleOpenLocalFolder = async () => {
    const folder = FOLDER_MAP[tab]
    if (!folder || !window.nimbus?.instancePath || !window.nimbus?.openFolder) return
    const base = await window.nimbus.instancePath(String(modpack.id)) as string
    const dir = `${base}/${folder}`
    await window.nimbus.openFolder(dir)
  }

  const TABS: { key: DetailTab; label: string; icon: string }[] = [
    { key: 'mods',       label: 'Mods',       icon: '📦' },
    { key: 'shaders',    label: 'Shaders',    icon: '✨' },
    { key: 'resources',  label: 'Texturas',   icon: '🎨' },
    { key: 'datapacks',  label: 'Datapacks',  icon: '📂' },
    { key: 'worlds',     label: 'Worlds',     icon: '🌍' },
  ]

  const showTabs = isCustom || installed

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${M.border}`,
        padding: '20px 24px',
        display: 'flex', alignItems: 'center', gap: '18px',
        flexShrink: 0,
      }}>
        {/* Cover */}
        <div style={{
          width: '72px', height: '72px', borderRadius: M.radius,
          overflow: 'hidden', flexShrink: 0,
          background: `linear-gradient(135deg, rgba(27,217,106,0.2), rgba(88,166,255,0.15))`,
          border: `1px solid ${M.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {modpack.imageUrl
            ? <img src={modpack.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Layers size={32} color={`${M.accent}88`} />
          }
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: '0 0 5px', fontSize: '18px', fontWeight: 800, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {modpack.name}
          </h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {modpack.version && (
              <span style={{ fontSize: '12px', color: M.textMuted, background: 'rgba(255,255,255,0.07)', padding: '2px 8px', borderRadius: '6px' }}>
                v{modpack.version}
              </span>
            )}
            {modpack.mcVersion && (
              <span style={{ fontSize: '12px', color: M.textSub }}>MC {modpack.mcVersion}</span>
            )}
            {modpack.loader && (
              <span style={{ fontSize: '12px', fontWeight: 700, color: loaderColor }}>
                {modpack.loader.charAt(0).toUpperCase() + modpack.loader.slice(1)}
              </span>
            )}
            <span style={{ fontSize: '11px', color: M.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Globe size={11} />
              {modpack.source === 'modrinth' ? 'Modrinth' : modpack.source === 'curseforge' ? 'CurseForge' : modpack.source}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button className="play-btn" onClick={handlePlay} disabled={playing || !user || (!isCustom && !installed)}
            title={!user ? 'Faça login para jogar' : ((!isCustom && !installed) ? 'Instale o modpack primeiro' : '')}
            style={{
              padding: '10px 24px', borderRadius: M.radiusSm,
              border: 'none', background: M.accent, color: '#fff',
              cursor: (playing || !user || (!isCustom && !installed)) ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 700,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px',
              boxShadow: `0 4px 16px ${M.accent}44`,
              opacity: (playing || !user || (!isCustom && !installed)) ? 0.6 : 1,
            }}>
            {playing
              ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Play size={15} fill="#fff" />
            }
            {playing ? 'Iniciando…' : 'Jogar'}
          </button>
          <button onClick={() => setEditing(true)}
            style={{
              width: 36, height: 36, borderRadius: M.radiusSm,
              border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.07)',
              color: M.textSub, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }} title="Editar modpack">
            <Settings size={15} />
          </button>
          {installed && (
            <button onClick={() => setRepairing(true)}
              style={{
                width: 36, height: 36, borderRadius: M.radiusSm,
                border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.07)',
                color: M.textSub, cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }} title="Reparar modpack">
              <RefreshCw size={15} />
            </button>
          )}
          <button onClick={async () => {
              if (!window.nimbus?.instancePath || !window.nimbus?.openFolder) return
              const p = await window.nimbus.instancePath(String(modpack.id))
              await window.nimbus.openFolder(p)
            }}
            style={{
              width: 36, height: 36, borderRadius: M.radiusSm,
              border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.07)',
              color: M.textSub, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }} title="Abrir pasta">
            <FolderOpen size={15} />
          </button>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <ModpackEditModal
          modpack={{ ...modpack, installed }}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setEditing(false)
            onUpdated?.(updated)
          }}
          onDeleted={(id) => {
            setEditing(false)
            onDeleted?.(id)
          }}
        />
      )}

      {/* Repair modal */}
      {repairing && (
        <ModpackRepairModal
          modpack={{ ...modpack, installed }}
          onClose={() => setRepairing(false)}
          onRepaired={(updated) => {
            setRepairing(false)
            setInstalled(true)
            onUpdated?.(updated)
          }}
        />
      )}

      {/* Launch progress / error */}
      {(progress || launchError) && (
        <div style={{
          margin: '14px 24px 0',
          padding: '12px 16px',
          background: launchError ? `${M.red}15` : 'rgba(27,217,106,0.08)',
          border: launchError ? `1px solid ${M.red}33` : '1px solid rgba(27,217,106,0.25)',
          borderRadius: M.radius,
          fontSize: '13px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: launchError ? M.red : M.text }}>
            {!launchError && playing && <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {launchError ?? progress?.message ?? 'Trabalhando…'}
              </div>
              {!launchError && progress?.percent != null && (
                <div style={{
                  marginTop: '6px', height: '4px', borderRadius: '4px',
                  background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${Math.max(0, Math.min(100, progress.percent))}%`,
                    background: `linear-gradient(90deg, ${M.accent}, #17c45e)`,
                    transition: 'width 250ms ease',
                  }} />
                </div>
              )}
            </div>
            {launchLog && (
              <button onClick={() => setShowLog(v => !v)}
                style={{
                  padding: '4px 10px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${M.border}`,
                  color: M.textSub, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit',
                }}>
                {showLog ? 'Ocultar log' : 'Ver log'}
              </button>
            )}
            {(launchError || launchLog) && window.nimbus?.game?.openLogFile && (
              <button onClick={() => window.nimbus!.game!.openLogFile!()}
                style={{
                  padding: '4px 10px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${M.border}`,
                  color: M.textSub, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit',
                }}>
                Abrir arquivo
              </button>
            )}
            {launchError && (
              <button onClick={() => { setLaunchError(null); setProgress(null) }}
                style={{
                  padding: '4px 10px', borderRadius: '6px',
                  background: 'transparent', border: `1px solid ${M.red}55`,
                  color: M.red, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
                }}>
                Fechar
              </button>
            )}
          </div>
          {showLog && launchLog && (
            <pre style={{
              margin: '12px 0 0',
              padding: '10px 12px', borderRadius: '8px',
              background: 'rgba(0,0,0,0.4)', border: `1px solid ${M.border}`,
              color: M.textSub, fontSize: '11px', fontFamily: 'SF Mono, Menlo, monospace',
              maxHeight: '180px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {launchLog}
            </pre>
          )}
        </div>
      )}

      {/* Install banner for external modpacks not yet installed */}
      {!isCustom && !installed && (
        <div style={{
          margin: '16px 24px 0',
          padding: '14px 18px',
          background: 'rgba(88,166,255,0.08)',
          border: '1px solid rgba(88,166,255,0.25)',
          borderRadius: M.radius,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Download size={16} color={M.blue} />
            <span style={{ fontSize: '13px', color: M.textSub }}>
              Este modpack precisa ser instalado antes de ser personalizado
            </span>
          </div>
          <button onClick={handleInstall} disabled={installing}
            style={{
              padding: '7px 18px', borderRadius: M.radiusSm,
              border: 'none', background: M.blue, color: '#fff',
              cursor: installing ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '6px',
              opacity: installing ? 0.7 : 1, flexShrink: 0,
            }}>
            {installing
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Instalando...</>
              : <><Download size={13} /> Instalar</>
            }
          </button>
        </div>
      )}

      {/* Tabs */}
      {showTabs && (
        <>
          <div style={{
            display: 'flex', gap: '2px', padding: '12px 24px 0',
            borderBottom: `1px solid ${M.border}`, flexShrink: 0,
          }}>
            {TABS.map(t => (
              <button key={t.key}
                className={`tab-btn${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '8px 14px', border: 'none', background: 'transparent',
                  color: tab === t.key ? M.accent : M.textSub,
                  cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  fontFamily: 'inherit', borderRadius: `${M.radiusSm} ${M.radiusSm} 0 0`,
                  borderBottom: tab === t.key ? `2px solid ${M.accent}` : '2px solid transparent',
                  marginBottom: '-1px',
                  display: 'flex', alignItems: 'center', gap: '5px',
                }}>
                <span style={{ fontSize: '13px' }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
            {tab === 'mods' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      value={modSearch}
                      onChange={e => setModSearch(e.target.value)}
                      placeholder="Buscar mod neste modpack…"
                      style={{
                        width: '100%', padding: '8px 12px 8px 32px', borderRadius: M.radiusSm,
                        border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.05)',
                        color: M.text, fontSize: '12px', fontFamily: 'inherit', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <Package size={13} color={M.textMuted}
                      style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                  <a href="https://nimbusgg.me/mods" target="_blank" rel="noreferrer"
                    style={{
                      padding: '8px 14px', borderRadius: M.radiusSm,
                      background: 'rgba(27,217,106,0.12)', border: '1px solid rgba(27,217,106,0.3)',
                      color: M.accent, textDecoration: 'none', fontSize: '12px', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: '6px',
                      flexShrink: 0,
                    }}>
                    <Plus size={13} /> Adicionar
                  </a>
                </div>

                {modsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '32px', color: M.textMuted }}>
                    <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : mods.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '40px 20px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: M.radius,
                    border: `1px solid ${M.border}`, color: M.textMuted, fontSize: '13px',
                  }}>
                    <Package size={28} color={M.textMuted} style={{ marginBottom: '10px', opacity: 0.4 }} />
                    <p style={{ margin: 0 }}>Nenhum mod adicionado ainda.</p>
                    <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
                      Use a aba <strong style={{ color: M.accent }}>Mods</strong> ou o site em <strong style={{ color: M.accent }}>nimbusgg.me/mods</strong>
                    </p>
                  </div>
                ) : (() => {
                  const filteredMods = mods.filter(m =>
                    !modSearch.trim() || m.name.toLowerCase().includes(modSearch.toLowerCase())
                  )
                  if (filteredMods.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '32px', color: M.textMuted, fontSize: '13px' }}>
                        Nenhum mod encontrado para "{modSearch}".
                      </div>
                    )
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {filteredMods.map(mod => {
                        const enabled = mod.enabled !== false
                        return (
                          <div key={mod.id} style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '10px 14px', borderRadius: M.radiusSm,
                            background: enabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)',
                            border: `1px solid ${M.border}`,
                            opacity: enabled ? 1 : 0.55,
                            transition: 'all 150ms',
                          }}>
                            {mod.icon_url
                              ? <img src={mod.icon_url} alt="" style={{ width: 28, height: 28, borderRadius: '6px', flexShrink: 0, filter: enabled ? 'none' : 'grayscale(100%)' }} />
                              : <div style={{ width: 28, height: 28, borderRadius: '6px', background: 'rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Package size={14} color={M.textMuted} />
                                </div>
                            }
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: enabled ? M.text : M.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: enabled ? 'none' : 'line-through' }}>
                                {mod.name}
                              </div>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                                {mod.version && <span style={{ fontSize: '11px', color: M.textMuted }}>v{mod.version}</span>}
                                {mod.source && <span style={{ fontSize: '11px', color: M.textMuted }}>{mod.source}</span>}
                                {!enabled && <span style={{ fontSize: '10px', color: M.orange, fontWeight: 700, background: `${M.orange}18`, padding: '0 6px', borderRadius: '4px' }}>DESATIVADO</span>}
                              </div>
                            </div>
                            {/* Toggle switch */}
                            <button onClick={() => toggleMod(mod)}
                              title={enabled ? 'Desativar mod' : 'Ativar mod'}
                              style={{
                                width: 38, height: 22, borderRadius: '11px', border: 'none',
                                background: enabled ? M.accent : 'rgba(255,255,255,0.12)',
                                cursor: 'pointer', position: 'relative', flexShrink: 0,
                                transition: 'background 180ms',
                              }}>
                              <div style={{
                                position: 'absolute', top: '2px',
                                left: enabled ? '18px' : '2px',
                                width: 18, height: 18, borderRadius: '50%',
                                background: '#fff',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                transition: 'left 180ms',
                              }} />
                            </button>
                            <button onClick={() => handleRemoveMod(mod.id)}
                              style={{
                            width: 28, height: 28, borderRadius: M.radiusSm,
                            border: '1px solid transparent', background: 'transparent',
                            color: M.textMuted, cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            transition: 'all 150ms',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,81,73,0.15)'; e.currentTarget.style.color = M.red }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = M.textMuted }}
                          title="Remover mod">
                          <Trash2 size={13} />
                        </button>
                      </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}

            {tab === 'worlds' && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: M.textMuted, fontSize: '13px' }}>
                <FolderOpen size={28} color={M.textMuted} style={{ marginBottom: '10px', opacity: 0.4 }} />
                <p style={{ margin: 0 }}>Gerenciamento de worlds em breve.</p>
              </div>
            )}

            {(tab === 'shaders' || tab === 'resources' || tab === 'datapacks') && (() => {
              const tabInfo = {
                shaders:   { icon: '✨', label: 'shaders',      empty: 'Nenhum shader instalado.' },
                resources: { icon: '🎨', label: 'texture packs', empty: 'Nenhum texture pack instalado.' },
                datapacks: { icon: '📂', label: 'datapacks',    empty: 'Nenhum datapack instalado.' },
              }[tab as 'shaders' | 'resources' | 'datapacks']!
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: M.textMuted }}>
                      {localFiles.length} {tabInfo.label}
                    </span>
                    <button onClick={handleOpenLocalFolder}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '8px', border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.05)', color: M.textSub, cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
                      <FolderOpen size={12} /> Abrir pasta
                    </button>
                  </div>

                  {localLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                      <Loader size={20} color={M.accent} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : localFiles.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: M.textMuted, fontSize: '13px' }}>
                      <div style={{ fontSize: '28px', marginBottom: '10px', opacity: 0.4 }}>{tabInfo.icon}</div>
                      <p style={{ margin: '0 0 8px' }}>{tabInfo.empty}</p>
                      <p style={{ margin: 0, fontSize: '12px' }}>Copie arquivos para a pasta ou adicione pela aba <strong style={{ color: M.accent }}>Mods</strong>.</p>
                    </div>
                  ) : (
                    localFiles.map(file => {
                      const enabled = file.enabled
                      const displayName = file.name.replace(/\.disabled$/, '')
                      const sizeMb = (file.size / 1024 / 1024).toFixed(1)
                      return (
                        <div key={file.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: enabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${enabled ? M.border : 'rgba(255,255,255,0.06)'}`, opacity: enabled ? 1 : 0.55 }}>
                          <div style={{ fontSize: '18px', flexShrink: 0 }}>{tabInfo.icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {displayName}
                            </div>
                            <div style={{ fontSize: '11px', color: M.textMuted }}>{sizeMb} MB</div>
                          </div>
                          <button onClick={() => handleToggleLocalFile(file)} title={enabled ? 'Desativar' : 'Ativar'}
                            style={{ width: 38, height: 22, borderRadius: '11px', border: 'none', background: enabled ? M.accent : 'rgba(255,255,255,0.12)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 180ms' }}>
                            <div style={{ position: 'absolute', top: '2px', left: enabled ? '18px' : '2px', width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.3)', transition: 'left 180ms' }} />
                          </button>
                          <button onClick={() => handleDeleteLocalFile(file)}
                            style={{ width: 28, height: 28, borderRadius: M.radiusSm, border: '1px solid transparent', background: 'transparent', color: M.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 150ms' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,81,73,0.15)'; e.currentTarget.style.color = M.red }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = M.textMuted }}
                            title="Remover">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              )
            })()}
          </div>
        </>
      )}

      {!showTabs && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: M.textMuted, fontSize: '13px', flexDirection: 'column', gap: '8px' }}>
          <Download size={28} color={M.textMuted} style={{ opacity: 0.3 }} />
          <span>Instale o modpack para gerenciar mods, shaders e datapacks.</span>
        </div>
      )}
    </div>
  )
}

// ── Library page ──────────────────────────────────────────────────────────────

// ── Create custom modpack modal ──────────────────────────────────────────────

interface CreateModpackModalProps {
  onClose:   () => void
  onCreated: (m: Modpack) => void
}

const MC_VERSIONS = [
  '1.21.4', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1',
  '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2',
]
const LOADERS_LIST = [
  { id: 'fabric',   label: 'Fabric'   },
  { id: 'forge',    label: 'Forge'    },
  { id: 'neoforge', label: 'NeoForge' },
  { id: 'quilt',    label: 'Quilt'    },
]

const CreateModpackModal: React.FC<CreateModpackModalProps> = ({ onClose, onCreated }) => {
  const [name, setName]         = useState('')
  const [mcVersion, setMcVer]   = useState('1.20.1')
  const [loader, setLoader]     = useState('fabric')
  const [imageUrl, setImageUrl] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) { setError('Dê um nome ao modpack'); return }
    setCreating(true); setError(null)
    try {
      const externalId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const res = await apiFetch('/api/v1/library', {
        method: 'POST',
        body: JSON.stringify({
          library_item: {
            source:      'modrinth', // placeholder; backend just needs a valid value
            external_id: externalId,
            item_type:   'modpack',
            name:        name.trim(),
            mc_version:  mcVersion,
            loader:      loader,
            image_url:   imageUrl || null,
            installed:   true,
          },
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setError(json?.errors?.[0]?.message ?? `Erro HTTP ${res.status}`)
        return
      }
      const json = await res.json()
      const d = json.data as Record<string, unknown>
      onCreated({
        id:          String(d['id'] ?? ''),
        external_id: String(d['external_id'] ?? externalId),
        name:        String(d['name'] ?? name),
        source:      String(d['source'] ?? 'modrinth'),
        imageUrl:    d['image_url'] as string | undefined,
        loader:      d['loader']     as string | undefined,
        mcVersion:   d['mc_version'] as string | undefined,
        installed:   true,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setCreating(false)
    }
  }

  return (
    <ModalShell title="Criar modpack customizado" onClose={onClose} disabled={creating}>
      <div style={{ marginBottom: '14px' }}>
        <label style={modalLabel}>Nome</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Meu modpack mágico"
          style={modalInput}
        />
      </div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <div style={{ flex: 1 }}>
          <label style={modalLabel}>Versão Minecraft</label>
          <select value={mcVersion} onChange={e => setMcVer(e.target.value)} style={modalSelect}>
            {MC_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={modalLabel}>Loader</label>
          <select value={loader} onChange={e => setLoader(e.target.value)} style={modalSelect}>
            {LOADERS_LIST.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: '18px' }}>
        <label style={modalLabel}>Imagem (URL, opcional)</label>
        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
          placeholder="https://…"
          style={modalInput}
        />
      </div>
      {error && <div style={modalErr}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button onClick={onClose} disabled={creating} style={modalBtnGhost}>Cancelar</button>
        <button onClick={handleCreate} disabled={creating || !name.trim()} style={modalBtnPrimary}>
          {creating && <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />}
          Criar
        </button>
      </div>
    </ModalShell>
  )
}

// ── Browse external modpacks ────────────────────────────────────────────────

interface BrowseModpacksModalProps {
  onClose: () => void
  onAdded: (m: Modpack) => void
}

interface BrowsedModpack {
  id:          string
  name:        string
  description?:string
  source:      'modrinth' | 'curseforge'
  imageUrl?:   string
  downloads?:  number
  author?:     string
  mcVersion?:  string
  loader?:     string
}

const BrowseModpacksModal: React.FC<BrowseModpacksModalProps> = ({ onClose, onAdded }) => {
  const [query, setQuery]     = useState('')
  const [loader, setLoader]   = useState('')
  const [results, setResults] = useState<BrowsedModpack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [adding, setAdding]   = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const search = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      params.set('per_page', '20')
      if (loader) params.set('loader', loader)
      const res = await apiFetch(`/api/v1/modpacks?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const items = (json.data ?? []) as Record<string, unknown>[]
      setResults(items.map(m => {
        const versions = (m['versions'] ?? m['game_versions']) as string[] | undefined
        const loaders  = (m['loaders'] ?? m['display_categories']) as string[] | undefined
        return {
          id:          String(m['id'] ?? m['project_id'] ?? ''),
          name:        String(m['name'] ?? m['title'] ?? ''),
          description: (m['summary'] ?? m['description']) as string | undefined,
          source:      ((m['source'] ?? (m['project_id'] ? 'modrinth' : 'curseforge')) as 'modrinth' | 'curseforge'),
          imageUrl:    (m['logo'] as Record<string, unknown> | undefined)?.['thumbnailUrl'] as string | undefined ?? m['icon_url'] as string | undefined,
          downloads:   (m['downloadCount'] ?? m['downloads']) as number | undefined,
          author:      (m['author'] ?? m['team']) as string | undefined,
          mcVersion:   versions?.find(v => /^1\.\d+/.test(v)),
          loader:      loaders?.find(l => ['forge','fabric','quilt','neoforge'].includes(l.toLowerCase()))?.toLowerCase(),
        }
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [query, loader])

  useEffect(() => { search() }, [search])

  const addModpack = async (mp: BrowsedModpack) => {
    setAdding(mp.id); setFeedback(null)
    try {
      const res = await apiFetch('/api/v1/library', {
        method: 'POST',
        body: JSON.stringify({
          library_item: {
            source:      mp.source,
            external_id: mp.id,
            item_type:   'modpack',
            name:        mp.name,
            image_url:   mp.imageUrl ?? null,
            description: mp.description ?? null,
            mc_version:  mp.mcVersion,
            loader:      mp.loader,
          },
        }),
      })
      if (res.status === 409) {
        setFeedback('Esse modpack já está na sua biblioteca')
        return
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setFeedback(j?.errors?.[0]?.message ?? `Erro HTTP ${res.status}`)
        return
      }
      const json = await res.json()
      const d = json.data as Record<string, unknown>
      onAdded({
        id:          String(d['id'] ?? ''),
        external_id: String(d['external_id'] ?? mp.id),
        name:        String(d['name'] ?? mp.name),
        source:      String(d['source'] ?? mp.source),
        imageUrl:    d['image_url']  as string | undefined ?? mp.imageUrl,
        loader:      d['loader']     as string | undefined ?? mp.loader,
        mcVersion:   d['mc_version'] as string | undefined ?? mp.mcVersion,
        installed:   Boolean(d['installed']),
      })
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Erro')
    } finally {
      setAdding(null)
    }
  }

  return (
    <ModalShell title="Adicionar modpack pronto" onClose={onClose} wide>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar modpacks…"
            style={{ ...modalInput, paddingLeft: '34px' }}
          />
          <Globe size={14} color={M.textMuted}
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>
        <select value={loader} onChange={e => setLoader(e.target.value)} style={{ ...modalSelect, width: '140px' }}>
          <option value="">Todos loaders</option>
          {LOADERS_LIST.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>

      {error && <div style={modalErr}>{error}</div>}

      <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', minHeight: '300px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: M.textMuted }}>
            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : results.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: M.textMuted, fontSize: '13px' }}>
            Nenhum resultado.
          </div>
        ) : (
          results.map(mp => (
            <div key={`${mp.source}-${mp.id}`} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 12px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${M.border}`,
            }}>
              {mp.imageUrl
                ? <img src={mp.imageUrl} alt="" style={{ width: 44, height: 44, borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 44, height: 44, borderRadius: '10px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Layers size={20} color={M.textMuted} />
                  </div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mp.name}
                  </span>
                  <span style={{
                    padding: '1px 6px', borderRadius: '5px', fontSize: '10px', fontWeight: 700,
                    background: mp.source === 'modrinth' ? `${M.accent}22` : `${M.orange}22`,
                    color:      mp.source === 'modrinth' ? M.accent : M.orange,
                  }}>
                    {mp.source === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                  </span>
                </div>
                {mp.description && (
                  <div style={{ fontSize: '12px', color: M.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {mp.description}
                  </div>
                )}
              </div>
              <button onClick={() => addModpack(mp)} disabled={adding === mp.id}
                style={{
                  padding: '7px 14px', borderRadius: '9px',
                  border: 'none', background: M.accent, color: '#fff',
                  cursor: adding === mp.id ? 'not-allowed' : 'pointer',
                  fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  flexShrink: 0,
                }}>
                {adding === mp.id
                  ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Plus size={12} />
                }
                Adicionar
              </button>
            </div>
          ))
        )}
      </div>

      {feedback && <div style={{ ...modalErr, marginTop: '10px' }}>{feedback}</div>}
    </ModalShell>
  )
}

// ── Reusable modal shell ────────────────────────────────────────────────────

interface ModalShellProps {
  title:    string
  onClose:  () => void
  disabled?: boolean
  wide?:    boolean
  children: React.ReactNode
}

const ModalShell: React.FC<ModalShellProps> = ({ title, onClose, disabled, wide, children }) => (
  <div onClick={() => !disabled && onClose()} style={{
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: 'fadeIn 180ms ease',
  }}>
    <div onClick={e => e.stopPropagation()} style={{
      width: wide ? '640px' : '480px', maxWidth: '94vw', padding: '24px',
      background: 'rgba(20,25,35,0.96)',
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      border: `1px solid ${M.border}`,
      borderRadius: '20px',
      boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: M.text, flex: 1 }}>
          {title}
        </h3>
        <button onClick={onClose} disabled={disabled}
          style={{
            width: 28, height: 28, borderRadius: '8px',
            background: 'transparent', border: 'none',
            color: M.textMuted, cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <X size={15} />
        </button>
      </div>
      {children}
    </div>
  </div>
)

const modalLabel: CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: M.textMuted, textTransform: 'uppercase',
  letterSpacing: '0.06em', display: 'block', marginBottom: '5px',
}
const modalInput: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px',
  background: 'rgba(255,255,255,0.06)', border: `1px solid ${M.border}`,
  color: M.text, fontSize: '13px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}
const modalSelect: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px',
  background: 'rgba(255,255,255,0.06)', border: `1px solid ${M.border}`,
  color: M.text, fontSize: '13px', fontFamily: 'inherit', outline: 'none',
  appearance: 'none', boxSizing: 'border-box',
}
const modalErr: CSSProperties = {
  padding: '10px 12px', borderRadius: '10px', marginBottom: '12px',
  background: `${M.red}15`, border: `1px solid ${M.red}33`, color: M.red,
  fontSize: '12px',
}
const modalBtnPrimary: CSSProperties = {
  padding: '9px 18px', borderRadius: '10px',
  background: M.accent, border: 'none', color: '#fff',
  cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: '6px',
}
const modalBtnGhost: CSSProperties = {
  padding: '9px 16px', borderRadius: '10px',
  background: 'transparent', border: `1px solid ${M.border}`,
  color: M.textSub, cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
}

const LibraryPage: React.FC<{ user?: User | null }> = ({ user }) => {
  const [modpacks, setModpacks] = useState<Modpack[]>([])
  const [selected, setSelected] = useState<Modpack | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState<'custom' | 'browse' | null>(null)

  const loadLibrary = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const res = await apiFetch('/api/v1/library')
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data.data ?? [])
        const packs: Modpack[] = (list as Record<string, unknown>[])
          .filter(i => !i['item_type'] || i['item_type'] === 'modpack')
          .map(i => ({
            id: String(i['id'] ?? ''),
            external_id: String(i['external_id'] ?? i['id'] ?? ''),
            name: String(i['name'] ?? ''),
            source: String(i['source'] ?? 'modrinth'),
            imageUrl: i['image_url'] as string | undefined,
            loader: i['loader'] as string | undefined,
            mcVersion: i['mc_version'] as string | undefined,
            description: i['description'] as string | undefined,
            version: i['version'] as string | undefined,
            installed: Boolean(i['installed']),
          }))
        setModpacks(packs)
        if (packs.length > 0) setSelected(prev => prev ?? packs[0])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  const filtered = modpacks.filter(mp =>
    !search.trim() ||
    mp.name.toLowerCase().includes(search.toLowerCase()) ||
    (mp.loader ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (mp.mcVersion ?? '').includes(search)
  )

  return (
    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 200ms ease' }}>

      {/* Left: modpack list */}
      <div style={{
        width: '260px', flexShrink: 0,
        borderRight: `1px solid ${M.border}`,
        overflowY: 'auto', padding: '8px',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 8px', flexShrink: 0 }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: M.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Biblioteca
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => setShowCreate('custom')}
              style={{
                width: 26, height: 26, borderRadius: M.radiusSm,
                border: `1px solid ${M.border}`, background: 'rgba(27,217,106,0.10)',
                color: M.accent, cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }} title="Criar modpack customizado">
              <Plus size={13} />
            </button>
            <button onClick={() => setShowCreate('browse')}
              style={{
                width: 26, height: 26, borderRadius: M.radiusSm,
                border: `1px solid ${M.border}`, background: 'rgba(88,166,255,0.10)',
                color: M.blue, cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }} title="Adicionar modpack pronto">
              <Globe size={13} />
            </button>
            <button onClick={() => loadLibrary(true)} disabled={refreshing}
              style={{
                width: 26, height: 26, borderRadius: M.radiusSm,
                border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.05)',
                color: M.textMuted, cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }} title="Atualizar">
              <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', padding: '0 4px 8px', flexShrink: 0 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar…"
            style={{
              width: '100%', padding: '7px 10px 7px 28px', borderRadius: M.radiusSm,
              border: `1px solid ${M.border}`, background: 'rgba(255,255,255,0.05)',
              color: M.text, fontSize: '12px', fontFamily: 'inherit', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <Package size={12} color={M.textMuted}
            style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px', color: M.textMuted }}>
            <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: M.textMuted, fontSize: '13px' }}>
            {search.trim()
              ? 'Nenhum modpack encontrado.'
              : <>Nenhum modpack ainda.<br />Use os botões acima.</>}
          </div>
        )}
        {filtered.map(mp => {
          const isSelected = selected?.id === mp.id
          const lc = mp.loader ? (LOADER_COLORS[mp.loader.toLowerCase()] ?? M.textSub) : M.textSub
          return (
            <button key={mp.id} className="mp-card"
              onClick={() => setSelected(mp)}
              style={{
                width: '100%', padding: 0, border: 'none', cursor: 'pointer',
                borderRadius: M.radius, marginBottom: '6px', overflow: 'hidden',
                background: isSelected ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                outline: isSelected ? `2px solid ${M.accent}` : '2px solid transparent',
                textAlign: 'left',
                boxShadow: isSelected ? '0 4px 20px rgba(0,0,0,0.4)' : 'none',
              }}>
              <div style={{
                width: '100%', height: '80px', position: 'relative',
                background: 'linear-gradient(135deg, rgba(27,217,106,0.15), rgba(88,166,255,0.10))',
                overflow: 'hidden',
              }}>
                {mp.imageUrl
                  ? <img src={mp.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Layers size={24} color={`${M.accent}66`} />
                    </div>
                }
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))' }} />
              </div>
              <div style={{ padding: '7px 10px 9px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: M.text, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mp.name}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {mp.mcVersion && <span style={{ fontSize: '11px', color: M.textMuted }}>{mp.mcVersion}</span>}
                  {mp.loader && <span style={{ fontSize: '11px', fontWeight: 600, color: lc }}>{mp.loader.charAt(0).toUpperCase() + mp.loader.slice(1)}</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Create / browse modal */}
      {showCreate === 'custom' && (
        <CreateModpackModal
          onClose={() => setShowCreate(null)}
          onCreated={(mp) => {
            setShowCreate(null)
            setModpacks(prev => [mp, ...prev])
            setSelected(mp)
          }}
        />
      )}
      {showCreate === 'browse' && (
        <BrowseModpacksModal
          onClose={() => setShowCreate(null)}
          onAdded={(mp) => {
            setShowCreate(null)
            setModpacks(prev => [mp, ...prev])
            setSelected(mp)
          }}
        />
      )}

      {/* Right: selected modpack detail */}
      {!selected ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: M.textMuted }}>
          Selecione um modpack
        </div>
      ) : (
        <ModpackDetail
          key={selected.id}
          modpack={selected}
          user={user}
          onUpdated={(updated) => {
            setSelected(updated)
            setModpacks(prev => prev.map(p => p.id === updated.id ? updated : p))
          }}
          onDeleted={(id) => {
            setModpacks(prev => {
              const next = prev.filter(p => p.id !== id)
              setSelected(next[0] ?? null)
              return next
            })
          }}
        />
      )}
    </div>
  )
}

// ── Home page ─────────────────────────────────────────────────────────────────

interface HomePageProps {
  user: User | null
}

// Default banner gradients available for the user to pick.
const BANNER_PRESETS: Array<{ id: string; label: string; gradient: string }> = [
  { id: 'aurora',  label: 'Aurora',     gradient: 'radial-gradient(ellipse at 20% 0%, rgba(27,217,106,0.45) 0%, transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(88,166,255,0.40) 0%, transparent 60%), linear-gradient(135deg, #0d2014, #0a1320)' },
  { id: 'sunset',  label: 'Pôr do sol', gradient: 'radial-gradient(ellipse at 0% 0%, rgba(255,140,80,0.45) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(220,80,160,0.40) 0%, transparent 60%), linear-gradient(135deg, #1a0c12, #11081a)' },
  { id: 'ocean',   label: 'Oceano',     gradient: 'radial-gradient(ellipse at 30% 20%, rgba(88,166,255,0.50) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(120,90,255,0.35) 0%, transparent 60%), linear-gradient(135deg, #061625, #0a0a18)' },
  { id: 'forest',  label: 'Floresta',   gradient: 'radial-gradient(ellipse at 50% 0%, rgba(80,180,100,0.40) 0%, transparent 60%), radial-gradient(ellipse at 0% 100%, rgba(20,120,80,0.45) 0%, transparent 60%), linear-gradient(135deg, #0a1d12, #08130d)' },
  { id: 'midnight',label: 'Meia-noite', gradient: 'radial-gradient(ellipse at 80% 30%, rgba(120,90,255,0.45) 0%, transparent 60%), radial-gradient(ellipse at 10% 90%, rgba(60,40,140,0.50) 0%, transparent 60%), linear-gradient(135deg, #0a0820, #060418)' },
]
const DEFAULT_BANNER_ID = 'aurora'

function getBannerById(id: string | undefined): string {
  return (BANNER_PRESETS.find(b => b.id === id) ?? BANNER_PRESETS[0]!).gradient
}

const HomePage: React.FC<HomePageProps> = ({ user }) => {
  const navigate = useNavigate()
  const [modpacks, setModpacks] = useState<Modpack[]>([])
  const [totalMods, setTotalMods] = useState(0)
  const [loading, setLoading] = useState(true)
  const [bannerId, setBannerId] = useState<string>(DEFAULT_BANNER_ID)

  useEffect(() => {
    (async () => {
      if (window.nimbus?.settings?.get) {
        const s = await window.nimbus.settings.get() as { bannerId?: string }
        if (s.bannerId) setBannerId(s.bannerId)
      }
    })()
  }, [])

  useEffect(() => {
    apiFetch('/api/v1/library')
      .then(async res => {
        if (res.ok) {
          const data = await res.json()
          const list = Array.isArray(data) ? data : (data.data ?? [])
          const packs: Modpack[] = (list as Record<string, unknown>[]).map(i => ({
            id: String(i['id'] ?? ''),
            external_id: String(i['external_id'] ?? i['id'] ?? ''),
            name: String(i['name'] ?? ''),
            source: String(i['source'] ?? 'modrinth'),
            imageUrl: i['image_url'] as string | undefined,
            loader: i['loader'] as string | undefined,
            mcVersion: i['mc_version'] as string | undefined,
            version: i['version'] as string | undefined,
            installed: Boolean(i['installed']),
          }))
          setModpacks(packs)
          const modsCount = (list as Record<string, unknown>[]).reduce((acc, i) => acc + (Number(i['mods_count']) || 0), 0)
          setTotalMods(modsCount)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const recent = modpacks.slice(-3).reverse()
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 5)  return 'Boa madrugada'
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  return (
    <div style={{ animation: 'fadeIn 240ms ease', overflowY: 'auto', height: '100%' }}>
      {/* ── Hero banner ────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        margin: '20px 24px 0',
        height: '200px',
        borderRadius: '22px',
        overflow: 'hidden',
        background: getBannerById(bannerId),
        border: `1px solid ${M.border}`,
        boxShadow: '0 14px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}>
        {/* Subtle grid overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }} />

        {/* Content */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', gap: '20px',
          padding: '0 32px',
        }}>
          {/* Avatar */}
          <div style={{
            position: 'relative', flexShrink: 0,
            width: 88, height: 88, borderRadius: '24px',
            background: 'rgba(0,0,0,0.4)',
            border: '2px solid rgba(255,255,255,0.20)',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}>
            {user?.avatar ? (
              <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: `linear-gradient(135deg, ${M.accent}, #17c45e)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '36px', fontWeight: 800, color: '#fff',
              }}>
                {(user?.username ?? 'N')[0].toUpperCase()}
              </div>
            )}
            {/* Online dot */}
            <div style={{
              position: 'absolute', right: 4, bottom: 4,
              width: 16, height: 16, borderRadius: '50%',
              background: M.accent,
              border: '3px solid rgba(8,12,18,0.95)',
              boxShadow: `0 0 10px ${M.accent}aa`,
            }} />
          </div>

          {/* Greeting */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>
              {greeting}
            </div>
            <h1 style={{ margin: '0 0 6px', fontSize: '30px', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}>
              Olá, {user?.username ?? 'Jogador'}!
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.78)' }}>
              {loading
                ? 'Carregando sua biblioteca…'
                : modpacks.length === 0
                  ? 'Pronto pra começar a aventura?'
                  : `Você tem ${modpacks.length} ${modpacks.length === 1 ? 'modpack' : 'modpacks'} na biblioteca.`
              }
            </p>
          </div>

          {/* Banner picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Banner
            </span>
            <div style={{ display: 'flex', gap: '5px' }}>
              {BANNER_PRESETS.map(b => {
                const active = b.id === bannerId
                return (
                  <button key={b.id}
                    onClick={async () => {
                      setBannerId(b.id)
                      if (window.nimbus?.settings?.save) {
                        await window.nimbus.settings.save({ bannerId: b.id })
                      }
                    }}
                    title={b.label}
                    style={{
                      width: 24, height: 24, borderRadius: '8px',
                      border: active ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)',
                      cursor: 'pointer', padding: 0,
                      background: b.gradient,
                      boxShadow: active ? '0 0 0 1px rgba(255,255,255,0.4), 0 4px 10px rgba(0,0,0,0.3)' : 'none',
                      transition: 'all 150ms',
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '28px 24px 24px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'Modpacks',     value: loading ? '...' : String(modpacks.length), color: M.accent, icon: Library },
            { label: 'Mods totais',  value: loading ? '...' : String(totalMods),       color: M.blue,   icon: Package },
            { label: 'Sessões',      value: '0',                                       color: M.orange, icon: Play    },
          ].map(stat => (
            <div key={stat.label} style={{
              padding: '16px 18px', borderRadius: M.radiusLg,
              background: 'rgba(255,255,255,0.045)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: `1px solid ${M.border}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '10px',
                background: `${stat.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '10px',
              }}>
                <stat.icon size={16} color={stat.color} />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: M.text, letterSpacing: '-0.02em' }}>{stat.value}</div>
              <div style={{ fontSize: '12px', color: M.textSub, marginTop: '2px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Recent modpacks */}
        {recent.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: M.text, letterSpacing: '-0.01em' }}>Recentes</h2>
              <button onClick={() => navigate('/library')}
                style={{
                  padding: '4px 10px', borderRadius: '8px',
                  background: 'transparent', border: 'none',
                  color: M.textSub, cursor: 'pointer',
                  fontSize: '12px', fontFamily: 'inherit',
                }}>
                Ver tudo →
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '28px' }}>
              {recent.map(mp => {
                const lc = mp.loader ? (LOADER_COLORS[mp.loader.toLowerCase()] ?? M.textSub) : M.textSub
                return (
                  <button key={mp.id} className="mp-card"
                    onClick={() => navigate('/library')}
                    style={{
                      padding: 0, cursor: 'pointer',
                      borderRadius: M.radius, overflow: 'hidden',
                      background: 'rgba(255,255,255,0.045)',
                      border: `1px solid ${M.border}`,
                      textAlign: 'left',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                    }}>
                    <div style={{
                      width: '100%', height: '90px',
                      background: 'linear-gradient(135deg, rgba(27,217,106,0.15), rgba(88,166,255,0.10))',
                      overflow: 'hidden', position: 'relative',
                    }}>
                      {mp.imageUrl
                        ? <img src={mp.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Layers size={24} color={`${M.accent}66`} />
                          </div>
                      }
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
                        {mp.name}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {mp.mcVersion && <span style={{ fontSize: '11px', color: M.textMuted }}>{mp.mcVersion}</span>}
                        {mp.loader && <span style={{ fontSize: '11px', fontWeight: 600, color: lc }}>{mp.loader.charAt(0).toUpperCase() + mp.loader.slice(1)}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Quick actions */}
        <h2 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: M.text, letterSpacing: '-0.01em' }}>Ações rápidas</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/library')}
            style={{
              padding: '10px 18px', borderRadius: '12px',
              background: `linear-gradient(135deg, rgba(27,217,106,0.18), rgba(27,217,106,0.10))`,
              border: `1px solid rgba(27,217,106,0.30)`,
              color: M.accent, cursor: 'pointer', fontSize: '13px', fontWeight: 700,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>
            <Library size={15} /> Ir para Biblioteca
          </button>
          <button onClick={() => navigate('/mods')}
            style={{
              padding: '10px 18px', borderRadius: '12px',
              background: `linear-gradient(135deg, rgba(88,166,255,0.18), rgba(88,166,255,0.08))`,
              border: `1px solid rgba(88,166,255,0.28)`,
              color: M.blue, cursor: 'pointer', fontSize: '13px', fontWeight: 700,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>
            <Package size={15} /> Explorar Mods
          </button>
          <button onClick={() => navigate('/settings')}
            style={{
              padding: '10px 18px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${M.border}`,
              color: M.textSub, cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px',
            }}>
            <Settings size={15} /> Configurações
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Settings page ─────────────────────────────────────────────────────────────

interface JavaInstall { executablePath: string; versionString: string; majorVersion: number; vendor?: string; isJdk?: boolean }

// Error boundary component for Settings page
class SettingsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[SettingsErrorBoundary] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', animation: 'fadeIn 200ms ease' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: M.text }}>
            Erro nas Configurações
          </h2>
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: M.radius,
            padding: '20px',
          }}>
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: M.text }}>
              Ocorreu um erro ao carregar as configurações:
            </p>
            <pre style={{
              margin: 0,
              fontSize: '12px',
              color: '#ef4444',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {this.state.error?.message || 'Erro desconhecido'}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                marginTop: '16px',
                padding: '9px 18px',
                borderRadius: M.radiusSm,
                border: 'none',
                background: M.accent,
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                fontFamily: 'inherit',
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const SettingsPageInner: React.FC = () => {
  const [msAccount, setMsAccount] = useMicrosoftAccount()
  const [msLoading, setMsLoading] = useState(false)
  const [msError, setMsError] = useState<string | null>(null)
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUri: string; deviceCode: string; interval: number } | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  // Java + memory
  const [javas, setJavas] = useState<JavaInstall[]>([])
  const [javaPath, setJavaPath] = useState<string>('')
  const [autoJava, setAutoJava] = useState<boolean>(true)
  const [maxMemoryMb, setMaxMemoryMb] = useState<number>(8192)
  const [savingSettings, setSavingSettings] = useState(false)

  // Update check
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateCheckResult, setUpdateCheckResult] = useState<{ updateRequired: boolean; updateAvailable: boolean; versionInfo: { current: string; minimum: string; downloadUrl: string } } | null>(null)
  const [updateCheckError, setUpdateCheckError] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string>('')

  // Load settings on mount
  useEffect(() => {
    (async () => {
      try {
        if (window.nimbus?.settings?.get) {
          const s = await window.nimbus.settings.get() as { javaPath?: string; maxMemoryMb?: number; autoJava?: boolean }
          if (s.javaPath) setJavaPath(s.javaPath)
          if (typeof s.maxMemoryMb === 'number') setMaxMemoryMb(s.maxMemoryMb)
          if (typeof s.autoJava === 'boolean') setAutoJava(s.autoJava)
        }
        if (window.nimbus?.java?.detectAll) {
          const r = await window.nimbus.java.detectAll() as { success: boolean; data?: JavaInstall[] }
          if (r.success && Array.isArray(r.data)) {
            setJavas(r.data)
            // Default to the highest major version if no path is saved yet
            if (!javaPath && r.data.length > 0) {
              const best = [...r.data].sort((a, b) => (b.majorVersion ?? 0) - (a.majorVersion ?? 0))[0]
              if (best) setJavaPath(best.executablePath)
            }
          }
        }
        // Get current launcher version
        if (window.nimbus?.update?.getCurrentVersion) {
          try {
            const raw = await window.nimbus.update.getCurrentVersion()
            // _wrapSync returns { success, data } — unwrap if needed
            const version = raw && typeof raw === 'object' && 'data' in (raw as object)
              ? String((raw as { data?: unknown }).data ?? '')
              : String(raw ?? '')
            setCurrentVersion(version)
          } catch (err) {
            console.error('[Settings] Failed to get current version:', err)
          }
        }
      } catch (err) {
        console.error('[Settings] Failed to load settings:', err)
        throw err // Re-throw to be caught by error boundary
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveSettings = async () => {
    if (!window.nimbus?.settings?.save) return
    setSavingSettings(true)
    try {
      await window.nimbus.settings.save({ javaPath, maxMemoryMb, autoJava })
    } finally {
      setSavingSettings(false)
    }
  }

  /**
   * Handles manual update check triggered by user in Settings.
   * 
   * This function:
   * - Calls the UpdateService via IPC to check for updates
   * - Displays the result (required, optional, or up-to-date)
   * - Logs errors for debugging (Requirement 13.4)
   * - Uses safe defaults on network failure (Requirement 13.1)
   * - Handles timeout gracefully (Requirement 13.3)
   * 
   * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
   */
  const handleManualUpdateCheck = async () => {
    if (!window.nimbus?.update?.checkForUpdates) {
      setUpdateCheckError('Verificação de atualização disponível apenas no launcher instalado.')
      return
    }
    
    setCheckingUpdate(true)
    setUpdateCheckError(null)
    setUpdateCheckResult(null)
    
    try {
      const result = await window.nimbus.update.checkForUpdates() as {
        updateRequired: boolean
        updateAvailable: boolean
        versionInfo: {
          current: string
          minimum: string
          downloadUrl: string
          releaseNotes?: string
        }
      }
      
      setUpdateCheckResult(result)
      
      // Log the result for debugging (Requirement 13.4)
      console.log('[Settings] Update check result:', result)
    } catch (err) {
      // Log error for debugging (Requirement 13.4)
      console.error('[Settings] Update check failed:', err)
      setUpdateCheckError(err instanceof Error ? err.message : 'Erro ao verificar atualizações')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleAddMicrosoft = async () => {
    if (!window.nimbus?.auth) {
      setMsError('Disponível apenas no launcher instalado.')
      return
    }
    setMsLoading(true); setMsError(null); setCodeCopied(false)
    try {
      const res = await window.nimbus.auth.startDeviceCodeFlow() as { success: boolean; data?: { userCode: string; verificationUri: string; deviceCode: string; interval: number }; error?: string }
      if (!res.success || !res.data) {
        setMsError(res.error ?? 'Erro ao iniciar login Microsoft')
        setMsLoading(false)
        return
      }
      // Show the code IMMEDIATELY so the user can copy/paste it. The poll
      // runs in the background — `msLoading` stays true (with the device
      // code panel visible), but we don't block the await chain on it.
      setDeviceCode({
        userCode:        res.data.userCode,
        verificationUri: res.data.verificationUri,
        deviceCode:      res.data.deviceCode,
        interval:        res.data.interval,
      })
      // Open the verification URL in the system browser as a courtesy.
      try {
        if (window.nimbus?.openExternal) await window.nimbus.openExternal(res.data.verificationUri)
      } catch { /* ignore */ }

      // Poll in background — UI stays responsive, code stays visible.
      void (async () => {
        try {
          const pollRes = await window.nimbus!.auth!.pollForToken(res.data!.deviceCode, res.data!.interval) as {
            success: boolean
            data?: {
              account?:    { username?: string }
              minecraft?:  { name?: string; id?: string }
              accessToken?: string
              refreshToken?: string
              expiresAt?:    number
              userId?:       string
              minecraftAccessToken?: string
            }
            error?: string
          }
          if (pollRes.success && pollRes.data) {
            const username = pollRes.data.minecraft?.name ?? pollRes.data.account?.username ?? 'Conta Microsoft'
            const uuid     = pollRes.data.minecraft?.id
            setMsAccount({ username, uuid })
            setDeviceCode(null)
          } else {
            setMsError(pollRes.error ?? 'Login cancelado ou expirado')
            setDeviceCode(null)
          }
        } catch (e) {
          setMsError(e instanceof Error ? e.message : 'Erro')
          setDeviceCode(null)
        } finally {
          setMsLoading(false)
        }
      })()
    } catch (e) {
      setMsError(e instanceof Error ? e.message : 'Erro')
      setMsLoading(false)
    }
  }

  const handleCopyCode = async () => {
    if (!deviceCode) return
    try {
      await navigator.clipboard.writeText(deviceCode.userCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API: use execCommand.
      try {
        const ta = document.createElement('textarea')
        ta.value = deviceCode.userCode
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCodeCopied(true)
        setTimeout(() => setCodeCopied(false), 2000)
      } catch { /* ignore */ }
    }
  }

  return (
    <div style={{ padding: '32px', animation: 'fadeIn 200ms ease', overflowY: 'auto', height: '100%' }}>
      <h2 style={{ margin: '0 0 24px', fontSize: '18px', fontWeight: 700, color: M.text }}>Configurações</h2>

      {/* Microsoft Account */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: M.textSub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Conta Minecraft (Microsoft)
        </h3>
        <div style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: M.radius,
          border: `1px solid ${M.border}`, padding: '20px',
        }}>
          {msAccount ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {/* Avatar from mineatar.io — public, no auth required, follows
                    UUID changes. Falls back to a generic block icon if the
                    UUID is missing or the request fails. */}
                {msAccount.uuid ? (
                  <img
                    src={`https://api.mineatar.io/face/${msAccount.uuid}?scale=8&overlay=true`}
                    alt={msAccount.username}
                    width={48} height={48}
                    style={{
                      width: 48, height: 48, borderRadius: M.radiusSm,
                      imageRendering: 'pixelated' as const,
                      background: 'rgba(255,255,255,0.06)',
                    }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: M.radiusSm,
                    background: 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: '22px' }}>⛏</span>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: M.text }}>{msAccount.username}</div>
                  <div style={{ fontSize: '12px', color: M.accent }}>Conta Microsoft conectada</div>
                  {msAccount.uuid && (
                    <div style={{ fontSize: '11px', color: M.textMuted, fontFamily: 'monospace', marginTop: '2px' }}>
                      {msAccount.uuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.+)$/, '$1-$2-$3-$4-$5')}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={async () => {
                if (window.nimbus?.auth?.deleteTokens) {
                  try { await window.nimbus.auth.deleteTokens() } catch { /* ignore */ }
                }
                setMsAccount(null)
              }}
                style={{
                  padding: '7px 14px', borderRadius: M.radiusSm,
                  border: `1px solid ${M.red}44`, background: `${M.red}10`,
                  color: M.red, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
                }}>
                Remover
              </button>
            </div>
          ) : deviceCode ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 12px', fontSize: '14px', color: M.textSub }}>
                Acesse <strong style={{ color: M.accent }}>{deviceCode.verificationUri}</strong> e insira o código:
              </p>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: 'rgba(255,255,255,0.08)',
                padding: '10px 14px', borderRadius: M.radiusSm,
                marginBottom: '12px',
              }}>
                <span style={{
                  fontSize: '28px', fontWeight: 800, letterSpacing: '0.15em',
                  color: M.text, fontFamily: 'monospace',
                }}>
                  {deviceCode.userCode}
                </span>
                <button onClick={handleCopyCode}
                  style={{
                    padding: '8px 12px', borderRadius: M.radiusSm,
                    border: `1px solid ${codeCopied ? M.accent : M.border}`,
                    background: codeCopied ? `${M.accent}22` : 'rgba(255,255,255,0.06)',
                    color: codeCopied ? M.accent : M.text,
                    cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    fontFamily: 'inherit', transition: 'all 150ms ease',
                  }}>
                  {codeCopied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: M.textMuted }}>
                Aguardando confirmação...
                <Loader size={12} style={{ animation: 'spin 1s linear infinite', marginLeft: '6px', verticalAlign: 'middle' }} />
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: M.text, marginBottom: '4px' }}>
                  Nenhuma conta conectada
                </div>
                <div style={{ fontSize: '12px', color: M.textMuted }}>
                  Necessário para jogar Minecraft
                </div>
              </div>
              <button onClick={handleAddMicrosoft} disabled={msLoading}
                style={{
                  padding: '9px 18px', borderRadius: M.radiusSm,
                  border: 'none', background: '#107C10', color: '#fff',
                  cursor: msLoading ? 'not-allowed' : 'pointer',
                  fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: '7px',
                  opacity: msLoading ? 0.7 : 1,
                }}>
                {msLoading
                  ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Conectando...</>
                  : '⊞ Adicionar conta Microsoft'
                }
              </button>
            </div>
          )}
          {msError && <p style={{ margin: '12px 0 0', fontSize: '13px', color: M.red }}>{msError}</p>}
        </div>
      </div>

      {/* Java / Memory */}
      <div>
        <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: M.textSub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Java & Memória
        </h3>
        <div style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: M.radius,
          border: `1px solid ${M.border}`, padding: '20px',
          display: 'flex', flexDirection: 'column', gap: '18px',
        }}>
          {/* Java path */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, color: M.text, marginBottom: '8px' }}>
              <span>Java automático <span style={{ color: M.textMuted, fontWeight: 500 }}>(recomendado)</span></span>
              {/* iOS-style toggle */}
              <button
                type="button"
                onClick={() => setAutoJava(v => !v)}
                aria-pressed={autoJava}
                style={{
                  width: 42, height: 24, borderRadius: 999,
                  border: 'none', cursor: 'pointer', position: 'relative',
                  background: autoJava ? M.accent : 'rgba(255,255,255,0.15)',
                  transition: 'background 160ms ease',
                  padding: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 2,
                  left: autoJava ? 20 : 2,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  transition: 'left 160ms ease',
                }} />
              </button>
            </label>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: M.textMuted, lineHeight: 1.5 }}>
              {autoJava
                ? 'O launcher baixa o Java oficial da Mojang correspondente a cada modpack (Java 8, 17 ou 21 conforme a versão do Minecraft).'
                : 'Você escolhe o Java manualmente abaixo. Se a versão não bater com o Minecraft do modpack, o launcher faz o download automático mesmo assim.'}
            </p>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: M.text, marginBottom: '6px', opacity: autoJava ? 0.5 : 1 }}>
              Java do sistema
            </label>
            {javas.length === 0 ? (
              <p style={{ margin: 0, fontSize: '13px', color: M.textMuted }}>
                Nenhuma instalação local detectada. Sem problema, o launcher vai baixar o Java certo na primeira vez que você jogar.
              </p>
            ) : (
              <select
                value={javaPath}
                onChange={(e) => setJavaPath(e.target.value)}
                disabled={autoJava}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: M.radiusSm,
                  border: `1px solid ${M.border}`,
                  background: 'rgba(255,255,255,0.06)',
                  color: M.text, fontSize: '13px', fontFamily: 'inherit',
                  outline: 'none', appearance: 'none',
                  opacity: autoJava ? 0.5 : 1,
                  cursor: autoJava ? 'not-allowed' : 'pointer',
                }}
              >
                {javas.map(j => (
                  <option key={j.executablePath} value={j.executablePath}>
                    Java {j.majorVersion}{j.vendor ? ` (${j.vendor})` : ''}{j.isJdk === false ? ' JRE' : ''} — {j.executablePath}
                  </option>
                ))}
              </select>
            )}
            {!autoJava && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: M.textMuted, wordBreak: 'break-all' }}>
                {javaPath || 'nenhum selecionado'}
              </p>
            )}
          </div>

          {/* Memory */}
          <div>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, color: M.text, marginBottom: '6px' }}>
              <span>Memória RAM máxima</span>
              <span style={{ color: M.accent }}>{(maxMemoryMb / 1024).toFixed(1)} GB</span>
            </label>
            <input
              type="range"
              min={1024}
              max={16384}
              step={512}
              value={maxMemoryMb}
              onChange={(e) => setMaxMemoryMb(Number(e.target.value))}
              style={{ width: '100%', accentColor: M.accent }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: M.textMuted, marginTop: '4px' }}>
              <span>1 GB</span>
              <span>16 GB</span>
            </div>
          </div>

          {/* Save */}
          <div>
            <button onClick={saveSettings} disabled={savingSettings || (!autoJava && !javaPath)}
              style={{
                padding: '9px 18px', borderRadius: M.radiusSm,
                border: 'none', background: M.accent, color: '#fff',
                cursor: savingSettings || (!autoJava && !javaPath) ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
                opacity: savingSettings || (!autoJava && !javaPath) ? 0.7 : 1,
              }}>
              {savingSettings ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        </div>
      </div>

      {/* Launcher Updates */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: M.textSub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Atualizações do Launcher
        </h3>
        <div style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: M.radius,
          border: `1px solid ${M.border}`, padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: M.text, marginBottom: '4px' }}>
                Versão atual: {currentVersion || 'Carregando...'}
              </div>
              <div style={{ fontSize: '12px', color: M.textMuted }}>
                Verifique se há atualizações disponíveis
              </div>
            </div>
            <button onClick={handleManualUpdateCheck} disabled={checkingUpdate}
              style={{
                padding: '9px 18px', borderRadius: M.radiusSm,
                border: 'none', background: M.accent, color: '#fff',
                cursor: checkingUpdate ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '7px',
                opacity: checkingUpdate ? 0.7 : 1,
              }}>
              {checkingUpdate
                ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Verificando...</>
                : <><RefreshCw size={13} /> Verificar atualizações</>
              }
            </button>
          </div>

          {/* Update check result */}
          {updateCheckResult && (
            <div style={{
              marginTop: '16px',
              padding: '14px',
              borderRadius: M.radiusSm,
              background: updateCheckResult.updateRequired
                ? 'rgba(239, 68, 68, 0.1)'
                : updateCheckResult.updateAvailable
                ? 'rgba(59, 130, 246, 0.1)'
                : 'rgba(34, 197, 94, 0.1)',
              border: `1px solid ${
                updateCheckResult.updateRequired
                  ? 'rgba(239, 68, 68, 0.3)'
                  : updateCheckResult.updateAvailable
                  ? 'rgba(59, 130, 246, 0.3)'
                  : 'rgba(34, 197, 94, 0.3)'
              }`,
            }}>
              {updateCheckResult.updateRequired ? (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444', marginBottom: '8px' }}>
                    ⚠️ Atualização obrigatória disponível
                  </div>
                  <div style={{ fontSize: '13px', color: M.text, marginBottom: '8px' }}>
                    Versão mínima requerida: <strong>{updateCheckResult.versionInfo.minimum}</strong>
                    <br />
                    Versão mais recente: <strong>{updateCheckResult.versionInfo.current}</strong>
                  </div>
                  <button onClick={() => {
                    if (window.nimbus?.openExternal) {
                      window.nimbus.openExternal(updateCheckResult.versionInfo.downloadUrl)
                    }
                  }}
                    style={{
                      padding: '8px 16px', borderRadius: M.radiusSm,
                      border: 'none', background: '#ef4444', color: '#fff',
                      cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                      fontFamily: 'inherit',
                    }}>
                    Baixar atualização
                  </button>
                </>
              ) : updateCheckResult.updateAvailable ? (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#3b82f6', marginBottom: '8px' }}>
                    ℹ️ Atualização opcional disponível
                  </div>
                  <div style={{ fontSize: '13px', color: M.text, marginBottom: '8px' }}>
                    Versão mais recente: <strong>{updateCheckResult.versionInfo.current}</strong>
                  </div>
                  <button onClick={() => {
                    if (window.nimbus?.openExternal) {
                      window.nimbus.openExternal(updateCheckResult.versionInfo.downloadUrl)
                    }
                  }}
                    style={{
                      padding: '8px 16px', borderRadius: M.radiusSm,
                      border: 'none', background: '#3b82f6', color: '#fff',
                      cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                      fontFamily: 'inherit',
                    }}>
                    Baixar atualização
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e', marginBottom: '4px' }}>
                    ✓ Launcher atualizado
                  </div>
                  <div style={{ fontSize: '13px', color: M.text }}>
                    Você está usando a versão mais recente
                  </div>
                </>
              )}
            </div>
          )}

          {/* Error message */}
          {updateCheckError && (
            <div style={{
              marginTop: '16px',
              padding: '14px',
              borderRadius: M.radiusSm,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}>
              <div style={{ fontSize: '13px', color: '#ef4444' }}>
                {updateCheckError}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Wrap SettingsPageInner with error boundary
const SettingsPage: React.FC = () => {
  return (
    <SettingsErrorBoundary>
      <SettingsPageInner />
    </SettingsErrorBoundary>
  )
}

// ── Mods page ─────────────────────────────────────────────────────────────────

// ── Mods page — browse + install to a modpack ───────────────────────────────

interface ModVersion {
  id:             string
  name:           string
  version_number?: string
  game_versions?:  string[]
  loaders?:        string[]
  date_published?: string
}

interface BrowsedMod {
  id: string
  name: string
  description?: string
  source: 'modrinth' | 'curseforge'
  imageUrl?: string
  downloads?: number
  author?: string
  categories?: string[]
}

// Content type for the Mods page tabs
type ContentType = 'mods' | 'shaders' | 'resourcepacks'

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  mods: 'Mods',
  shaders: 'Shaders',
  resourcepacks: 'Texturas',
}

const ModsPage: React.FC = () => {
  const [contentType, setContentType] = useState<ContentType>('mods')
  const [view, setView] = useState<'browse' | 'installed'>('browse')

  // Browse state
  const [browseQuery, setBrowseQuery] = useState('')
  const [browseResults, setBrowseResults] = useState<BrowsedMod[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [source, setSource] = useState<'both' | 'modrinth' | 'curseforge'>('both')

  // Reset search when switching content type
  useEffect(() => { setBrowseQuery(''); setBrowseResults([]) }, [contentType])

  // Modpack picker for adding to
  const [modpacks, setModpacks] = useState<Modpack[]>([])
  const [pickerMod, setPickerMod] = useState<BrowsedMod | null>(null)
  const [pickerStep, setPickerStep] = useState<'modpack' | 'version'>('modpack')
  const [pickerModpack, setPickerModpack] = useState<Modpack | null>(null)
  const [versions, setVersions] = useState<ModVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // Installed view state
  const [installedMods, setInstalledMods] = useState<(Mod & { modpack_name?: string; modpack_id?: string })[]>([])
  const [installedLoading, setInstalledLoading] = useState(false)
  const [installedSearch, setInstalledSearch] = useState('')

  // Load modpacks once for the picker
  useEffect(() => {
    apiFetch('/api/v1/library')
      .then(async res => {
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data.data ?? [])
        setModpacks((list as Record<string, unknown>[]).map(i => ({
          id: String(i['id'] ?? ''),
          external_id: String(i['external_id'] ?? i['id'] ?? ''),
          name: String(i['name'] ?? ''),
          source: String(i['source'] ?? 'modrinth'),
          imageUrl: i['image_url'] as string | undefined,
          loader: i['loader'] as string | undefined,
          mcVersion: i['mc_version'] as string | undefined,
          installed: Boolean(i['installed']),
        })))
      })
      .catch(() => {})
  }, [])

  // Browse search
  const doSearch = useCallback(async () => {
    setBrowseLoading(true); setBrowseError(null)
    try {
      const params = new URLSearchParams()
      if (browseQuery.trim()) params.set('q', browseQuery.trim())
      params.set('per_page', '20')
      if (source !== 'both') params.set('source', source)
      // Pass content type so the backend filters by project_type / classId
      if (contentType === 'shaders') { params.set('project_type', 'shader'); params.set('class_id', '6552') }
      else if (contentType === 'resourcepacks') { params.set('project_type', 'resourcepack'); params.set('class_id', '12') }
      const res = await apiFetch(`/api/v1/mods?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const items = (json.data ?? []) as Record<string, unknown>[]
      setBrowseResults(items.map(m => ({
        id: String(m['id'] ?? m['project_id'] ?? ''),
        name: String(m['name'] ?? m['title'] ?? ''),
        description: (m['summary'] ?? m['description']) as string | undefined,
        source: ((m['source'] ?? (m['project_id'] ? 'modrinth' : 'curseforge')) as 'modrinth' | 'curseforge'),
        imageUrl: (m['logo'] as Record<string, unknown> | undefined)?.['thumbnailUrl'] as string | undefined ?? m['icon_url'] as string | undefined,
        downloads: (m['downloadCount'] ?? m['downloads']) as number | undefined,
        author: (m['author'] ?? m['team']) as string | undefined,
        categories: ((m['categories'] ?? m['display_categories']) as unknown[] | undefined)
          ?.map((c) => typeof c === 'string' ? c : String((c as { name?: string; slug?: string }).name ?? (c as { slug?: string }).slug ?? ''))
          .filter(Boolean) as string[] | undefined,
      })))
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setBrowseLoading(false)
    }
  }, [browseQuery, source, contentType])

  useEffect(() => { doSearch() }, [doSearch])

  // Installed view loader
  const loadInstalled = useCallback(async () => {
    setInstalledLoading(true)
    try {
      const res = await apiFetch('/api/v1/library')
      if (!res.ok) return
      const data = await res.json()
      const list = (Array.isArray(data) ? data : (data.data ?? [])) as Record<string, unknown>[]
      const all: (Mod & { modpack_name?: string; modpack_id?: string })[] = []
      await Promise.all(list.map(async item => {
        try {
          const r = await apiFetch(`/api/v1/library/${item['id']}/mods`)
          if (!r.ok) return
          const md = await r.json()
          const ml = (Array.isArray(md) ? md : (md.data ?? [])) as Record<string, unknown>[]
          ml.forEach(m => {
            all.push({
              id: String(m['id'] ?? ''),
              name: String(m['name'] ?? ''),
              version: m['version'] as string | undefined,
              source: m['source'] as string | undefined,
              icon_url: m['icon_url'] as string | undefined,
              modpack_name: String(item['name'] ?? ''),
              modpack_id: String(item['id'] ?? ''),
            })
          })
        } catch { /* ignore */ }
      }))
      setInstalledMods(all)
    } finally {
      setInstalledLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'installed') loadInstalled()
  }, [view, loadInstalled])

  // Reset picker when mod changes / closes
  const closePicker = () => {
    setPickerMod(null); setPickerModpack(null); setPickerStep('modpack')
    setVersions([]); setFeedback(null); setAdding(null)
  }

  // Step 1 → Step 2: user picked a modpack, fetch the mod's versions
  const choosePickerModpack = async (mp: Modpack) => {
    setPickerModpack(mp)
    setPickerStep('version')
    setFeedback(null)
    setVersions([])
    setVersionsLoading(true)
    if (!pickerMod) return
    try {
      const params = new URLSearchParams({ source: pickerMod.source })
      const res = await apiFetch(`/api/v1/mods/${encodeURIComponent(pickerMod.id)}/versions?${params}`)
      if (res.ok) {
        const json = await res.json()
        const list = (json.data ?? []) as ModVersion[]
        // Filter by the modpack's MC version + loader if available
        const mcv = mp.mcVersion?.trim()
        const loader = mp.loader?.toLowerCase().trim()
        const matches = list.filter(v => {
          const mcOk = !mcv || (v.game_versions ?? []).includes(mcv)
          const ldOk = !loader || (v.loaders ?? []).map(x => x.toLowerCase()).includes(loader)
          return mcOk && ldOk
        })
        // Show filtered first, then the rest as a fallback
        const others = list.filter(v => !matches.includes(v))
        setVersions([...matches, ...others])
      }
    } catch { /* ignore */ }
    finally { setVersionsLoading(false) }
  }

  const addToModpack = async (version?: ModVersion) => {
    if (!pickerMod || !pickerModpack) return
    setAdding(pickerModpack.id); setFeedback(null)
    try {
      const res = await apiFetch(`/api/v1/library/${pickerModpack.id}/mods`, {
        method: 'POST',
        body: JSON.stringify({
          source: pickerMod.source,
          external_id: pickerMod.id,
          name: pickerMod.name,
          image_url: pickerMod.imageUrl,
          version: version?.version_number ?? version?.name,
          version_name: version?.name,
        }),
      })
      if (res.ok) {
        setFeedback(`✓ Adicionado ao modpack`)
        setTimeout(() => closePicker(), 1200)
      } else if (res.status === 409) {
        setFeedback('Este mod já está nesse modpack')
      } else if (res.status === 422) {
        const json = await res.json().catch(() => null)
        const code = (json?.errors?.[0]?.code ?? '') as string
        if (code === 'modpack_not_installed') {
          setFeedback('Instale o modpack antes de adicionar mods.')
        } else {
          setFeedback(json?.errors?.[0]?.message ?? 'Erro ao adicionar')
        }
      } else {
        setFeedback(`Erro ao adicionar (HTTP ${res.status})`)
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro')
    } finally {
      setAdding(null)
    }
  }

  const filteredInstalled = installedMods.filter(m =>
    m.name.toLowerCase().includes(installedSearch.toLowerCase()) ||
    (m.modpack_name ?? '').toLowerCase().includes(installedSearch.toLowerCase())
  )

  return (
    <div style={{ padding: '24px 28px', animation: 'fadeIn 200ms ease', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: M.text, letterSpacing: '-0.02em' }}>
          {CONTENT_TYPE_LABELS[contentType]}
        </h2>
        <div style={{ display: 'flex', gap: '4px', padding: '3px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${M.border}`, borderRadius: '12px' }}>
          {(['browse', 'installed'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{
                padding: '7px 16px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                background: view === v ? 'rgba(27,217,106,0.18)' : 'transparent',
                color: view === v ? M.accent : M.textSub,
                fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', transition: 'all 150ms',
              }}>
              {v === 'browse' ? 'Explorar' : 'Instalados'}
            </button>
          ))}
        </div>
      </div>

      {/* Content type tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexShrink: 0 }}>
        {(['mods', 'shaders', 'resourcepacks'] as ContentType[]).map(ct => {
          const icons: Record<ContentType, string> = { mods: '📦', shaders: '✨', resourcepacks: '🎨' }
          return (
            <button key={ct} onClick={() => setContentType(ct)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '10px',
                border: `1px solid ${contentType === ct ? M.accent + '55' : M.border}`,
                background: contentType === ct ? `${M.accent}15` : 'rgba(255,255,255,0.04)',
                color: contentType === ct ? M.accent : M.textSub,
                fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer', transition: 'all 150ms',
              }}>
              <span>{icons[ct]}</span>
              {CONTENT_TYPE_LABELS[ct]}
            </button>
          )
        })}
      </div>

      {/* Search bar + filters */}
      {view === 'browse' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexShrink: 0 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              value={browseQuery}
              onChange={e => setBrowseQuery(e.target.value)}
              placeholder={`Buscar ${CONTENT_TYPE_LABELS[contentType].toLowerCase()}...`}
              style={{
                width: '100%', padding: '11px 14px 11px 38px',
                background: 'rgba(255,255,255,0.06)', border: `1px solid ${M.border}`,
                borderRadius: '12px', color: M.text, fontSize: '13px',
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <Package size={15} color={M.textMuted} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
          <select value={source} onChange={e => setSource(e.target.value as typeof source)}
            style={{
              padding: '0 14px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${M.border}`,
              color: M.text, fontSize: '13px', cursor: 'pointer',
              fontFamily: 'inherit', outline: 'none', appearance: 'none',
            }}>
            <option value="both">Todas as fontes</option>
            <option value="modrinth">Modrinth</option>
            <option value="curseforge">CurseForge</option>
          </select>
        </div>
      )}

      {view === 'installed' && (
        <div style={{ position: 'relative', marginBottom: '14px', flexShrink: 0 }}>
          <input
            value={installedSearch}
            onChange={e => setInstalledSearch(e.target.value)}
            placeholder="Buscar nos seus mods..."
            style={{
              width: '100%', padding: '11px 14px 11px 38px',
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${M.border}`,
              borderRadius: '12px', color: M.text, fontSize: '13px',
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <Package size={15} color={M.textMuted} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {view === 'browse' && (
          <>
            {browseError && (
              <div style={{ padding: '14px', borderRadius: M.radius, background: `${M.red}15`, border: `1px solid ${M.red}33`, color: M.red, fontSize: '13px', marginBottom: '12px' }}>
                {browseError}
              </div>
            )}
            {browseLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: M.textMuted }}>
                <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : browseResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: M.textMuted, fontSize: '13px' }}>
                Nenhum resultado.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {browseResults.map(mod => (
                  <div key={`${mod.source}-${mod.id}`} className="mp-card" style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '12px 14px', borderRadius: '12px',
                    background: 'rgba(255,255,255,0.045)',
                    border: `1px solid ${M.border}`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  }}>
                    {/* Icon with onError fallback */}
                    <div style={{ width: 44, height: 44, borderRadius: '10px', flexShrink: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {mod.imageUrl
                        ? <img src={mod.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                        : (contentType === 'shaders' ? <span style={{ fontSize: '20px' }}>✨</span>
                          : contentType === 'resourcepacks' ? <span style={{ fontSize: '20px' }}>🎨</span>
                          : <Package size={20} color={M.textMuted} />)
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {mod.name}
                        </span>
                        <span style={{
                          padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700,
                          background: mod.source === 'modrinth' ? `${M.accent}22` : `${M.orange}22`,
                          color:      mod.source === 'modrinth' ? M.accent : M.orange,
                          flexShrink: 0,
                        }}>
                          {mod.source === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                        </span>
                      </div>
                      {mod.description && (
                        <div style={{ fontSize: '12px', color: M.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {mod.description}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11px', color: M.textMuted }}>
                        {mod.downloads != null && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Download size={11} />{formatNum(mod.downloads)}
                          </span>
                        )}
                        {mod.author && <span>por {mod.author}</span>}
                      </div>
                    </div>
                    <button onClick={() => setPickerMod(mod)}
                      style={{
                        padding: '8px 14px', borderRadius: '10px',
                        border: 'none', background: M.accent, color: '#fff',
                        cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                        fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px',
                        boxShadow: `0 4px 12px ${M.accent}44`,
                        flexShrink: 0,
                      }}>
                      <Plus size={13} /> Adicionar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'installed' && (
          <>
            {installedLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: M.textMuted }}>
                <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : filteredInstalled.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: M.textMuted, fontSize: '13px' }}>
                <Package size={28} color={M.textMuted} style={{ marginBottom: '10px', opacity: 0.4 }} />
                <p style={{ margin: 0 }}>
                  {installedSearch ? 'Nenhum mod encontrado.' : 'Nenhum mod instalado ainda.'}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
                  Adicione um mod usando a aba <strong style={{ color: M.accent }}>Explorar</strong>.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {filteredInstalled.map((mod, idx) => (
                  <div key={`${mod.id}-${idx}`} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 14px', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.04)', border: `1px solid ${M.border}`,
                  }}>
                    {mod.icon_url
                      ? <img src={mod.icon_url} alt="" style={{ width: 32, height: 32, borderRadius: '8px', flexShrink: 0 }} />
                      : <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Package size={14} color={M.textMuted} />
                        </div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mod.name}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '2px', alignItems: 'center' }}>
                        {mod.version && <span style={{ fontSize: '11px', color: M.textMuted }}>v{mod.version}</span>}
                        {mod.source && <span style={{ fontSize: '11px', color: M.textMuted }}>{mod.source}</span>}
                        {mod.modpack_name && (
                          <span style={{ fontSize: '11px', color: M.textMuted, background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '4px' }}>
                            {mod.modpack_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modpack picker modal — 2 step flow: pick modpack → pick version */}
      {pickerMod && (
        <div onClick={() => !adding && closePicker()} style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 180ms ease',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '480px', maxWidth: '92vw', padding: '24px',
            background: 'rgba(20,25,35,0.95)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: `1px solid ${M.border}`,
            borderRadius: '20px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              {pickerMod.imageUrl
                ? <img src={pickerMod.imageUrl} alt="" style={{ width: 44, height: 44, borderRadius: '10px', flexShrink: 0 }} />
                : <div style={{ width: 44, height: 44, borderRadius: '10px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={20} color={M.textMuted} />
                  </div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pickerMod.name}
                </div>
                <div style={{ fontSize: '12px', color: M.textMuted }}>
                  {pickerStep === 'modpack' ? 'Adicionar a qual modpack?' : 'Escolha a versão'}
                </div>
              </div>
              <button onClick={closePicker} disabled={!!adding}
                style={{
                  width: 28, height: 28, borderRadius: '8px',
                  background: 'transparent', border: 'none',
                  color: M.textMuted, cursor: adding ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <X size={15} />
              </button>
            </div>

            {pickerStep === 'modpack' && (
              modpacks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: M.textMuted, fontSize: '13px' }}>
                  Você não tem modpacks ainda.<br />
                  Crie um na <strong style={{ color: M.accent }}>Biblioteca</strong>.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto' }}>
                  {modpacks.map(mp => {
                    const lc = mp.loader ? (LOADER_COLORS[mp.loader.toLowerCase()] ?? M.textSub) : M.textSub
                    const isCustom = isCustomModpack(mp.external_id)
                    const blocked = !isCustom && !mp.installed
                    return (
                      <button key={mp.id}
                        onClick={() => !blocked && choosePickerModpack(mp)}
                        disabled={blocked}
                        title={blocked ? 'Instale o modpack antes de adicionar mods' : ''}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '10px 12px', borderRadius: '10px',
                          background: blocked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${M.border}`,
                          cursor: blocked ? 'not-allowed' : 'pointer',
                          textAlign: 'left', fontFamily: 'inherit',
                          opacity: blocked ? 0.5 : 1,
                          transition: 'background 150ms',
                        }}>
                        {mp.imageUrl
                          ? <img src={mp.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Layers size={15} color={M.textMuted} />
                            </div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {mp.name}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: M.textMuted, alignItems: 'center' }}>
                            {mp.mcVersion && <span>{mp.mcVersion}</span>}
                            {mp.loader && <span style={{ color: lc, fontWeight: 600 }}>{mp.loader.charAt(0).toUpperCase() + mp.loader.slice(1)}</span>}
                            {blocked && (
                              <span style={{ color: M.orange, fontWeight: 600, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Download size={11} /> Não instalado
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            )}

            {pickerStep === 'version' && pickerModpack && (
              <>
                {/* Selected modpack chip */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px', borderRadius: '10px',
                  background: 'rgba(27,217,106,0.10)', border: `1px solid rgba(27,217,106,0.25)`,
                  marginBottom: '12px',
                }}>
                  {pickerModpack.imageUrl
                    ? <img src={pickerModpack.imageUrl} alt="" style={{ width: 24, height: 24, borderRadius: '6px', objectFit: 'cover' }} />
                    : <Layers size={16} color={M.accent} />
                  }
                  <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pickerModpack.name}
                  </span>
                  {pickerModpack.mcVersion && <span style={{ fontSize: '11px', color: M.textSub }}>{pickerModpack.mcVersion}</span>}
                  {pickerModpack.loader && <span style={{ fontSize: '11px', color: M.accent, fontWeight: 600 }}>{pickerModpack.loader.charAt(0).toUpperCase() + pickerModpack.loader.slice(1)}</span>}
                  <button onClick={() => { setPickerStep('modpack'); setPickerModpack(null); setVersions([]) }}
                    style={{ padding: '3px 8px', background: 'transparent', border: 'none', color: M.textMuted, cursor: 'pointer', fontSize: '11px' }}>
                    Trocar
                  </button>
                </div>

                {versionsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: M.textMuted }}>
                    <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : versions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: M.textMuted, fontSize: '13px' }}>
                    Nenhuma versão encontrada para este mod.
                    <div style={{ marginTop: '12px' }}>
                      <button onClick={() => addToModpack()} disabled={!!adding}
                        style={{
                          padding: '8px 16px', borderRadius: '10px',
                          background: M.accent, border: 'none', color: '#fff',
                          cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
                        }}>
                        Adicionar mesmo assim
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '340px', overflowY: 'auto' }}>
                    {versions.map(v => {
                      const compatible =
                        (!pickerModpack.mcVersion || (v.game_versions ?? []).includes(pickerModpack.mcVersion)) &&
                        (!pickerModpack.loader || (v.loaders ?? []).map(x => x.toLowerCase()).includes(pickerModpack.loader.toLowerCase()))
                      return (
                        <button key={v.id} onClick={() => addToModpack(v)} disabled={!!adding}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 10px', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.04)', border: `1px solid ${M.border}`,
                            cursor: adding ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'inherit',
                            opacity: adding ? 0.5 : 1,
                          }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: M.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.name}
                            </div>
                            <div style={{ display: 'flex', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
                              {(v.loaders ?? []).slice(0, 3).map(l => (
                                <span key={l} style={{
                                  fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                                  background: 'rgba(255,255,255,0.06)', color: M.textMuted, fontWeight: 600,
                                }}>{l}</span>
                              ))}
                              {(v.game_versions ?? []).slice(0, 4).map(g => (
                                <span key={g} style={{
                                  fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                                  background: 'rgba(255,255,255,0.06)', color: M.textMuted,
                                }}>{g}</span>
                              ))}
                            </div>
                          </div>
                          {compatible && (
                            <span style={{ fontSize: '10px', fontWeight: 700, color: M.accent, padding: '2px 7px', borderRadius: '5px', background: `${M.accent}18` }}>
                              ✓ Compatível
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {feedback && (
              <div style={{
                marginTop: '14px', padding: '10px 12px', borderRadius: '10px',
                background: feedback.startsWith('✓') ? `${M.accent}15` : `${M.orange}15`,
                color: feedback.startsWith('✓') ? M.accent : M.orange,
                fontSize: '12px', textAlign: 'center', fontWeight: 600,
              }}>
                {feedback}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

// ── App shell ─────────────────────────────────────────────────────────────────

const AppShell: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => {
  const location = useLocation()

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: M.bg }}>
      <TitleBar user={user} onLogout={onLogout} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <Routes location={location}>
            <Route path="/" element={<HomePage user={user} />} />
            <Route path="/library" element={<LibraryPage user={user} />} />
            <Route path="/mods" element={<ModsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [updateRequired, setUpdateRequired] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{
    versionInfo: {
      current: string
      minimum: string
      downloadUrl: string
      releaseNotes?: string
    }
    currentVersion: string
  } | null>(null)

  // Check for updates on mount (before showing UI)
  useEffect(() => {
    let cancelled = false

    const checkUpdates = async () => {
      if (!window.nimbus?.update?.checkForUpdates) {
        console.warn('[App] Update check not available in this environment')
        return
      }

      try {
        const result = await window.nimbus.update.checkForUpdates()
        if (cancelled) return

        if (result.updateRequired) {
          // Get current version for display
          const currentVersion = window.nimbus.update.getCurrentVersion
            ? await window.nimbus.update.getCurrentVersion()
            : '0.1.0'

          setUpdateRequired(true)
          setUpdateInfo({
            versionInfo: result.versionInfo,
            currentVersion,
          })
        }
      } catch (error) {
        console.error('[App] Failed to check for updates:', error)
        // Continue without blocking the app
      }
    }

    checkUpdates()
    return () => { cancelled = true }
  }, [])

  // On mount, check if already logged in (using a stored launcher session
  // token that the main process attaches automatically via Authorization).
  useEffect(() => {
    let cancelled = false

    const tryLoad = async (attempt = 1): Promise<void> => {
      try {
        const res = await apiFetch('/api/v1/users/me')
        if (cancelled) return
        if (res.ok) {
          const json = await res.json()
          const data = json?.data ?? json
          if (data && (data.id || data.username)) {
            setUser({
              id: String(data.id ?? ''),
              username: data.username ?? data.discord_username ?? 'Usuário',
              avatar: data.avatar_url ?? data.avatar,
              email: data.email,
            })
            return
          }
        } else if (res.status === 401) {
          // Token is genuinely invalid — clear it.
          if (window.nimbus?.session?.clear) await window.nimbus.session.clear()
          return
        }
        // 5xx / network error — retry once after 1.5s.
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1500))
          if (!cancelled) return tryLoad(attempt + 1)
        }
      } catch {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1500))
          if (!cancelled) return tryLoad(attempt + 1)
        }
      }
    }

    tryLoad().finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])

  const handleLogout = async () => {
    try {
      if (window.nimbus?.session?.clear) {
        await window.nimbus.session.clear()
      }
    } catch { /* ignore */ }
    setUser(null)
  }

  const handleDownloadUpdate = () => {
    if (updateInfo?.versionInfo.downloadUrl && window.nimbus?.openExternal) {
      window.nimbus.openExternal(updateInfo.versionInfo.downloadUrl)
    }
  }

  // Show update modal if update is required (blocks all UI)
  if (updateRequired && updateInfo) {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <UpdateModal
          versionInfo={updateInfo.versionInfo}
          currentVersion={updateInfo.currentVersion}
          onDownload={handleDownloadUpdate}
        />
      </>
    )
  }

  if (checking) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: M.bg }}>
        <style>{GLOBAL_CSS}</style>
        <Loader size={24} color={M.accent} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <AppShell user={user} onLogout={handleLogout} />
    </>
  )
}

export default App
