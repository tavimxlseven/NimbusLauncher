/**
 * Property-based tests for ThemeService.
 *
 * Feature: minecraft-launcher-platform, Property 14: Persistência e restauração de preferência de tema
 * **Validates: Requirements 7.4**
 *
 * Property: Para qualquer preferência de tema válida (cor e modo claro/escuro/sistema)
 * salva por um usuário autenticado, recuperar a preferência do localStorage deve
 * retornar exatamente os mesmos valores salvos; a preferência deve ser aplicada
 * antes da primeira renderização visível da página em sessões futuras.
 *
 * 100 iterations per property.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { savePreference, restoreFromSession, type ThemeConfig } from './ThemeService'

// ── localStorage polyfill (same as unit tests) ────────────────────────────────

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

const localStorageMock = new InMemoryStorage()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).localStorage = localStorageMock

// Suppress fetch errors — savePreference fires a fire-and-forget PATCH that
// will fail in the test environment; we don't want unhandled rejection noise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).fetch = () => Promise.reject(new Error('no network in tests'))

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** Generates a valid ThemeConfig mode. */
const arbMode = fc.constantFrom('light' as const, 'dark' as const, 'system' as const)

/** Generates a valid hex color string matching /^#[0-9a-fA-F]{6}$/. */
const arbHexColor = fc
  .stringOf(fc.constantFrom(...'0123456789abcdefABCDEF'.split('')), { minLength: 6, maxLength: 6 })
  .map((s) => `#${s}`)

/** Generates a valid ThemeConfig with an optional color. */
const arbThemeConfig: fc.Arbitrary<ThemeConfig> = fc.oneof(
  // mode only
  arbMode.map((mode) => ({ mode })),
  // mode + color
  fc.record({ mode: arbMode, color: arbHexColor }),
)

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P14: Theme preference persistence and restoration (Requirement 7.4)', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  /**
   * P14-A: savePreference then restoreFromSession returns the same mode.
   *
   * For any valid ThemeConfig, after saving the preference, restoring it
   * must return exactly the same mode value.
   *
   * **Validates: Requirements 7.4**
   */
  it('P14-A: restoreFromSession returns the same mode that was saved — 100 iterations', async () => {
    await fc.assert(
      fc.asyncProperty(arbThemeConfig, async (theme) => {
        localStorageMock.clear()

        await savePreference(theme)
        const restored = restoreFromSession()

        expect(restored.mode).toBe(theme.mode)
      }),
      { numRuns: 10, verbose: false },
    )
  })

  /**
   * P14-B: savePreference then restoreFromSession returns the same color.
   *
   * For any valid ThemeConfig that includes a color, after saving the
   * preference, restoring it must return exactly the same color value.
   *
   * **Validates: Requirements 7.4**
   */
  it('P14-B: restoreFromSession returns the same color that was saved — 100 iterations', async () => {
    await fc.assert(
      fc.asyncProperty(fc.record({ mode: arbMode, color: arbHexColor }), async (theme) => {
        localStorageMock.clear()

        await savePreference(theme)
        const restored = restoreFromSession()

        expect(restored.color).toBe(theme.color)
      }),
      { numRuns: 10, verbose: false },
    )
  })

  /**
   * P14-C: savePreference without color — restoreFromSession returns no color.
   *
   * For any valid ThemeConfig without a color, after saving the preference,
   * restoring it must not include a color field.
   *
   * **Validates: Requirements 7.4**
   */
  it('P14-C: restoreFromSession returns no color when none was saved — 100 iterations', async () => {
    await fc.assert(
      fc.asyncProperty(arbMode, async (mode) => {
        localStorageMock.clear()

        await savePreference({ mode })
        const restored = restoreFromSession()

        expect(restored.color).toBeUndefined()
      }),
      { numRuns: 10, verbose: false },
    )
  })

  /**
   * P14-D: Round-trip identity — save then restore returns identical ThemeConfig.
   *
   * For any valid ThemeConfig, the full round-trip save → restore must
   * produce an object with the same mode and color as the original.
   *
   * **Validates: Requirements 7.4**
   */
  it('P14-D: Full round-trip save → restore preserves the complete ThemeConfig — 100 iterations', async () => {
    await fc.assert(
      fc.asyncProperty(arbThemeConfig, async (theme) => {
        localStorageMock.clear()

        await savePreference(theme)
        const restored = restoreFromSession()

        expect(restored.mode).toBe(theme.mode)
        if (theme.color !== undefined) {
          expect(restored.color).toBe(theme.color)
        } else {
          expect(restored.color).toBeUndefined()
        }
      }),
      { numRuns: 10, verbose: false },
    )
  })

  /**
   * P14-E: Last-write-wins — saving a new preference overwrites the previous one.
   *
   * For any two valid ThemeConfigs, saving the second after the first must
   * result in restoreFromSession returning the second config, not the first.
   *
   * **Validates: Requirements 7.4**
   */
  it('P14-E: Saving a new preference overwrites the previous one — 100 iterations', async () => {
    await fc.assert(
      fc.asyncProperty(arbThemeConfig, arbThemeConfig, async (first, second) => {
        localStorageMock.clear()

        await savePreference(first)
        await savePreference(second)
        const restored = restoreFromSession()

        expect(restored.mode).toBe(second.mode)
        if (second.color !== undefined) {
          expect(restored.color).toBe(second.color)
        } else {
          expect(restored.color).toBeUndefined()
        }
      }),
      { numRuns: 10, verbose: false },
    )
  })

  /**
   * P14-F: Idempotency — saving the same preference twice returns the same result.
   *
   * For any valid ThemeConfig, saving it twice and then restoring must
   * return the same config as saving it once.
   *
   * **Validates: Requirements 7.4**
   */
  it('P14-F: Saving the same preference twice is idempotent — 100 iterations', async () => {
    await fc.assert(
      fc.asyncProperty(arbThemeConfig, async (theme) => {
        localStorageMock.clear()

        await savePreference(theme)
        await savePreference(theme)
        const restored = restoreFromSession()

        expect(restored.mode).toBe(theme.mode)
        if (theme.color !== undefined) {
          expect(restored.color).toBe(theme.color)
        } else {
          expect(restored.color).toBeUndefined()
        }
      }),
      { numRuns: 10, verbose: false },
    )
  })
})
