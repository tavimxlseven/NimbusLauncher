/**
 * ThemeService — applies, persists and restores user theme preferences.
 *
 * Requirements: 7.3, 7.4, 7.6
 *
 * Key guarantees:
 *  - applyTheme completes in < 300ms (synchronous DOM mutation)
 *  - savePreference writes to localStorage AND fires a fire-and-forget
 *    PATCH /api/v1/users/me/preferences — API failure never blocks the UI
 *  - restoreFromSession reads localStorage first, falls back to
 *    prefers-color-scheme (Requirement 7.6)
 *  - getEffectiveMode resolves 'system' via matchMedia at call time
 */

export interface ThemeConfig {
  mode: 'light' | 'dark' | 'system'
  color?: string // hex #RRGGBB
}

const STORAGE_KEY = 'nimbus_theme'
const PREFERENCES_ENDPOINT = '/api/v1/users/me/preferences'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when running in a real browser environment (SSR-safe). */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/** Parses a stored JSON string into a ThemeConfig, or returns null. */
function parseStoredTheme(raw: string | null): ThemeConfig | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'mode' in parsed &&
      (parsed as Record<string, unknown>).mode !== undefined
    ) {
      const obj = parsed as Record<string, unknown>
      const mode = obj.mode
      if (mode === 'light' || mode === 'dark' || mode === 'system') {
        const color =
          typeof obj.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(obj.color)
            ? obj.color
            : undefined
        return { mode, ...(color !== undefined ? { color } : {}) }
      }
    }
  } catch {
    // Corrupted storage — ignore and fall through to defaults
  }
  return null
}

// ── ThemeService implementation ───────────────────────────────────────────────

/**
 * Applies a ThemeConfig to the document in < 300ms.
 *
 * Sets `data-theme` on `document.documentElement` so that the CSS rules in
 * glass.css ([data-theme='light'] / [data-theme='dark']) take effect
 * immediately. Also writes the accent color as a CSS custom property so
 * components can consume `--theme-color` directly.
 *
 * This function is synchronous — the DOM mutation completes before the call
 * returns, well within the 300ms budget (Requirement 7.3).
 */
export function applyTheme(theme: ThemeConfig): void {
  if (!isBrowser()) return

  const effectiveMode = getEffectiveMode(theme)
  const root = document.documentElement

  // Set data-theme attribute — triggers CSS [data-theme] selectors in glass.css
  root.setAttribute('data-theme', effectiveMode)

  // Persist the accent color as a CSS custom property
  if (theme.color) {
    root.style.setProperty('--theme-color', theme.color)
  } else {
    root.style.removeProperty('--theme-color')
  }
}

/**
 * Persists the theme preference to localStorage and to the backend.
 *
 * The backend call is fire-and-forget: a failure is silently swallowed so
 * that the UI is never blocked by an API error (Requirement 7.4).
 */
export async function savePreference(theme: ThemeConfig): Promise<void> {
  // 1. Persist locally — always succeeds (synchronous)
  if (isBrowser()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
    } catch {
      // Storage quota exceeded or private-browsing restriction — ignore
    }
  }

  // 2. Fire-and-forget backend sync (Requirement 7.4)
  try {
    await fetch(PREFERENCES_ENDPOINT, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme_preference: theme.mode,
        ...(theme.color !== undefined ? { theme_color: theme.color } : {}),
      }),
    })
  } catch {
    // Network error or server unavailable — silently ignored
  }
}

/**
 * Restores the theme from localStorage before the first render (SSR-safe).
 *
 * Priority:
 *  1. Stored preference in localStorage (`nimbus_theme`)
 *  2. OS-level `prefers-color-scheme` media query (Requirement 7.6)
 *  3. Default: { mode: 'system' }
 */
export function restoreFromSession(): ThemeConfig {
  if (!isBrowser()) {
    // SSR: return a neutral default — the client will hydrate with the real value
    return { mode: 'system' }
  }

  // 1. Explicit user preference stored in localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const parsed = parseStoredTheme(stored)
    if (parsed !== null) return parsed
  } catch {
    // localStorage unavailable (e.g. private browsing with strict settings)
  }

  // 2. OS preference via prefers-color-scheme (Requirement 7.6)
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches

  return { mode: prefersDark ? 'dark' : 'light' }
}

/**
 * Resolves 'system' to the actual OS preference at call time.
 *
 * Returns 'light' or 'dark' — never 'system'.
 */
export function getEffectiveMode(theme: ThemeConfig): 'light' | 'dark' {
  if (theme.mode !== 'system') return theme.mode

  if (
    isBrowser() &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark'
  }

  return 'light'
}

// ── Default export as a service object (matches the design interface) ─────────

const ThemeService = {
  applyTheme,
  savePreference,
  restoreFromSession,
  getEffectiveMode,
}

export default ThemeService
