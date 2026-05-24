/**
 * Unit tests for ThemeService.
 *
 * Requirements: 7.3, 7.4, 7.6
 *
 * Covers:
 *  - applyTheme: sets data-theme attribute and --theme-color CSS property
 *  - savePreference: persists to localStorage and fires backend PATCH
 *  - restoreFromSession: reads localStorage, falls back to prefers-color-scheme
 *  - getEffectiveMode: resolves 'system' to 'light' or 'dark'
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  applyTheme,
  savePreference,
  restoreFromSession,
  getEffectiveMode,
  type ThemeConfig,
} from './ThemeService'

// ── localStorage polyfill ─────────────────────────────────────────────────────
// Node.js 26 has a native localStorage that is undefined (experimental).
// We provide a simple in-memory implementation so tests can use it.

class InMemoryStorage implements Storage {
  private store: Record<string, string> = {}

  get length(): number {
    return Object.keys(this.store).length
  }

  clear(): void {
    this.store = {}
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null
  }

  removeItem(key: string): void {
    delete this.store[key]
  }

  setItem(key: string, value: string): void {
    this.store[key] = value
  }
}

// Install the polyfill on globalThis so ThemeService can access it
const localStorageMock = new InMemoryStorage()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).localStorage = localStorageMock

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nimbus_theme'

// Use the polyfill directly
const storage = () => localStorageMock

function setStoredTheme(theme: ThemeConfig | null) {
  if (theme === null) {
    storage().removeItem(STORAGE_KEY)
  } else {
    storage().setItem(STORAGE_KEY, JSON.stringify(theme))
  }
}

/**
 * Mocks window.matchMedia by directly assigning to globalThis.
 * Avoids vi.stubGlobal to prevent corruption of other globals like localStorage.
 * Returns a cleanup function that restores the original value.
 */
function mockMatchMedia(prefersDark: boolean): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any
  const original = g.matchMedia

  g.matchMedia = (query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })

  return () => {
    if (original === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete g.matchMedia
    } else {
      g.matchMedia = original
    }
  }
}

/**
 * Mocks global fetch by directly assigning to globalThis.
 * Returns a cleanup function that restores the original value.
 */
function mockFetch(impl: typeof fetch): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any
  const original = g.fetch
  g.fetch = impl
  return () => {
    g.fetch = original
  }
}

// ── applyTheme ────────────────────────────────────────────────────────────────

describe('applyTheme (Requirement 7.3)', () => {
  beforeEach(() => {
    // Reset document state
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.removeProperty('--theme-color')
  })

  it('sets data-theme="light" for light mode', () => {
    applyTheme({ mode: 'light' })
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('sets data-theme="dark" for dark mode', () => {
    applyTheme({ mode: 'dark' })
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('resolves system mode to light when prefers-color-scheme is light', () => {
    const restore = mockMatchMedia(false)
    try {
      applyTheme({ mode: 'system' })
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    } finally {
      restore()
    }
  })

  it('resolves system mode to dark when prefers-color-scheme is dark', () => {
    const restore = mockMatchMedia(true)
    try {
      applyTheme({ mode: 'system' })
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    } finally {
      restore()
    }
  })

  it('sets --theme-color CSS property when color is provided', () => {
    applyTheme({ mode: 'light', color: '#4F8EF7' })
    expect(document.documentElement.style.getPropertyValue('--theme-color')).toBe('#4F8EF7')
  })

  it('removes --theme-color CSS property when color is absent', () => {
    // First set a color, then remove it
    document.documentElement.style.setProperty('--theme-color', '#FF0000')
    applyTheme({ mode: 'light' })
    expect(document.documentElement.style.getPropertyValue('--theme-color')).toBe('')
  })

  it('completes synchronously (< 300ms budget)', () => {
    const start = performance.now()
    applyTheme({ mode: 'dark', color: '#A78BFA' })
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(300)
  })
})

// ── getEffectiveMode ──────────────────────────────────────────────────────────

describe('getEffectiveMode', () => {
  it('returns "light" for mode: "light"', () => {
    expect(getEffectiveMode({ mode: 'light' })).toBe('light')
  })

  it('returns "dark" for mode: "dark"', () => {
    expect(getEffectiveMode({ mode: 'dark' })).toBe('dark')
  })

  it('returns "dark" for mode: "system" when OS prefers dark', () => {
    const restore = mockMatchMedia(true)
    try {
      expect(getEffectiveMode({ mode: 'system' })).toBe('dark')
    } finally {
      restore()
    }
  })

  it('returns "light" for mode: "system" when OS prefers light', () => {
    const restore = mockMatchMedia(false)
    try {
      expect(getEffectiveMode({ mode: 'system' })).toBe('light')
    } finally {
      restore()
    }
  })
})

// ── savePreference ────────────────────────────────────────────────────────────

describe('savePreference (Requirement 7.4)', () => {
  let restoreFetch: (() => void) | null = null

  beforeEach(() => {
    storage().clear()
  })

  afterEach(() => {
    if (restoreFetch) {
      restoreFetch()
      restoreFetch = null
    }
  })

  it('persists theme to localStorage', async () => {
    const theme: ThemeConfig = { mode: 'dark', color: '#34D399' }
    restoreFetch = mockFetch(vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch)

    await savePreference(theme)

    const stored = storage().getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.mode).toBe('dark')
    expect(parsed.color).toBe('#34D399')
  })

  it('persists theme without color to localStorage', async () => {
    restoreFetch = mockFetch(vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch)

    await savePreference({ mode: 'light' })

    const stored = storage().getItem(STORAGE_KEY)
    const parsed = JSON.parse(stored!)
    expect(parsed.mode).toBe('light')
    expect(parsed.color).toBeUndefined()
  })

  it('fires PATCH /api/v1/users/me/preferences with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    restoreFetch = mockFetch(fetchMock as unknown as typeof fetch)

    await savePreference({ mode: 'dark', color: '#A78BFA' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/users/me/preferences')
    expect(options.method).toBe('PATCH')
    const body = JSON.parse(options.body as string)
    expect(body.theme_preference).toBe('dark')
    expect(body.theme_color).toBe('#A78BFA')
  })

  it('does not include theme_color in backend payload when color is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    restoreFetch = mockFetch(fetchMock as unknown as typeof fetch)

    await savePreference({ mode: 'light' })

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(body).not.toHaveProperty('theme_color')
  })

  it('does not throw when backend call fails (fire-and-forget)', async () => {
    restoreFetch = mockFetch(
      vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch,
    )

    // Should resolve without throwing
    await expect(savePreference({ mode: 'dark' })).resolves.toBeUndefined()
  })

  it('still persists to localStorage even when backend call fails', async () => {
    restoreFetch = mockFetch(
      vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch,
    )

    await savePreference({ mode: 'system', color: '#22D3EE' })

    const stored = storage().getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).mode).toBe('system')
  })
})

// ── restoreFromSession ────────────────────────────────────────────────────────

describe('restoreFromSession (Requirements 7.4, 7.6)', () => {
  beforeEach(() => {
    storage().clear()
  })

  it('returns stored preference from localStorage when present', () => {
    setStoredTheme({ mode: 'dark', color: '#FB7185' })
    const result = restoreFromSession()
    expect(result.mode).toBe('dark')
    expect(result.color).toBe('#FB7185')
  })

  it('returns stored preference with mode: "light"', () => {
    setStoredTheme({ mode: 'light' })
    const result = restoreFromSession()
    expect(result.mode).toBe('light')
  })

  it('returns stored preference with mode: "system"', () => {
    setStoredTheme({ mode: 'system' })
    const result = restoreFromSession()
    expect(result.mode).toBe('system')
  })

  it('falls back to dark when no stored preference and OS prefers dark (Requirement 7.6)', () => {
    const restore = mockMatchMedia(true)
    try {
      const result = restoreFromSession()
      expect(result.mode).toBe('dark')
    } finally {
      restore()
    }
  })

  it('falls back to light when no stored preference and OS prefers light (Requirement 7.6)', () => {
    const restore = mockMatchMedia(false)
    try {
      const result = restoreFromSession()
      expect(result.mode).toBe('light')
    } finally {
      restore()
    }
  })

  it('ignores corrupted localStorage data and falls back to OS preference', () => {
    storage().setItem(STORAGE_KEY, 'not-valid-json{{{')
    const restore = mockMatchMedia(false)
    try {
      const result = restoreFromSession()
      expect(result.mode).toBe('light')
    } finally {
      restore()
    }
  })

  it('ignores stored data with invalid mode and falls back to OS preference', () => {
    storage().setItem(STORAGE_KEY, JSON.stringify({ mode: 'invalid-mode' }))
    const restore = mockMatchMedia(true)
    try {
      const result = restoreFromSession()
      expect(result.mode).toBe('dark')
    } finally {
      restore()
    }
  })

  it('ignores stored color with invalid hex format', () => {
    storage().setItem(STORAGE_KEY, JSON.stringify({ mode: 'dark', color: 'not-a-hex' }))
    const result = restoreFromSession()
    expect(result.mode).toBe('dark')
    expect(result.color).toBeUndefined()
  })

  it('stored preference takes priority over OS preference (Requirement 7.4 > 7.6)', () => {
    setStoredTheme({ mode: 'light' })
    const restore = mockMatchMedia(true) // OS prefers dark
    try {
      const result = restoreFromSession()
      // Stored 'light' wins over OS 'dark'
      expect(result.mode).toBe('light')
    } finally {
      restore()
    }
  })
})
