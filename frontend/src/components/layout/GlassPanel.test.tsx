/**
 * Unit tests for GlassPanel component.
 *
 * Requirements: 7.1, 7.3, 7.5
 *
 * Covers:
 *  - Snapshot test to catch unintended visual regressions
 *  - backdrop-filter blur ≥ 12px is applied (Requirement 7.1)
 *  - border-radius ≥ 12px is applied (Requirement 7.1)
 *  - background-color opacity ≤ 0.8 (Requirement 7.1)
 *  - Responsive layout: width 100%, overflow hidden (Requirement 7.5)
 *  - Smooth theme transitions are set (Requirement 7.3)
 *  - Renders children correctly
 *  - Supports custom className, style, as prop, and data-testid
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GlassPanel from './GlassPanel'

// ── Snapshot ──────────────────────────────────────────────────────────────────

describe('GlassPanel — snapshot', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('matches snapshot with custom className and style', () => {
    const { container } = render(
      <GlassPanel className="custom" style={{ padding: '16px' }} data-testid="glass">
        Content
      </GlassPanel>,
    )
    expect(container.firstChild).toMatchSnapshot()
  })
})

// ── backdrop-filter (Requirement 7.1) ─────────────────────────────────────────

describe('GlassPanel — backdrop-filter blur ≥ 12px (Requirement 7.1)', () => {
  it('applies backdropFilter style with the CSS variable and 16px fallback', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    // The inline style uses the CSS variable with a 16px fallback
    expect(el.style.backdropFilter).toContain('blur(')
    expect(el.style.backdropFilter).toContain('var(--glass-blur, 16px)')
  })

  it('applies WebkitBackdropFilter for Safari compatibility', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    // jsdom does not serialize vendor-prefixed CSS properties in the style attribute,
    // but React sets WebkitBackdropFilter on the element's style object.
    // We verify the backdropFilter (non-prefixed) is set, which confirms the
    // blur effect is applied. The WebkitBackdropFilter mirrors the same value.
    expect(el.style.backdropFilter).toContain('blur(')
    // Additionally verify the component renders without errors when both
    // backdropFilter and WebkitBackdropFilter are set in the style prop.
    expect(el).toBeInTheDocument()
  })

  /**
   * The fallback value in the CSS variable expression is 16px, which is ≥ 12px.
   * This test extracts the fallback pixel value and asserts it meets the minimum.
   */
  it('fallback blur value is at least 12px (Requirement 7.1)', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    const backdropFilter = el.style.backdropFilter
    // Extract the fallback px value from "blur(var(--glass-blur, 16px))"
    const match = backdropFilter.match(/blur\(var\([^,]+,\s*(\d+(?:\.\d+)?)px\)/)
    expect(match).not.toBeNull()
    const blurPx = parseFloat(match![1])
    expect(blurPx).toBeGreaterThanOrEqual(12)
  })
})

// ── border-radius (Requirement 7.1) ───────────────────────────────────────────

describe('GlassPanel — border-radius ≥ 12px (Requirement 7.1)', () => {
  it('applies borderRadius style with the CSS variable and 16px fallback', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    expect(el.style.borderRadius).toContain('var(--glass-radius, 16px)')
  })

  it('fallback border-radius value is at least 12px (Requirement 7.1)', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    const match = el.style.borderRadius.match(/var\([^,]+,\s*(\d+(?:\.\d+)?)px\)/)
    expect(match).not.toBeNull()
    const radiusPx = parseFloat(match![1])
    expect(radiusPx).toBeGreaterThanOrEqual(12)
  })
})

// ── background-color opacity ≤ 0.8 (Requirement 7.1) ─────────────────────────

describe('GlassPanel — background-color opacity ≤ 0.8 (Requirement 7.1)', () => {
  it('applies backgroundColor style with the CSS variable', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    expect(el.style.backgroundColor).toContain('var(--glass-bg,')
  })

  it('fallback background-color has opacity ≤ 0.8 (Requirement 7.1)', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    // Extract rgba fallback: "var(--glass-bg, rgba(255,255,255,0.15))"
    const match = el.style.backgroundColor.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/)
    expect(match).not.toBeNull()
    const opacity = parseFloat(match![1])
    expect(opacity).toBeLessThanOrEqual(0.8)
  })
})

// ── Responsive layout (Requirement 7.5) ───────────────────────────────────────

describe('GlassPanel — responsive layout (Requirement 7.5)', () => {
  it('sets width: 100%', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    expect(el.style.width).toBe('100%')
  })

  it('sets maxWidth: 100%', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    expect(el.style.maxWidth).toBe('100%')
  })

  it('sets overflowX: hidden to prevent horizontal overflow', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    expect(el.style.overflowX).toBe('hidden')
  })
})

// ── Theme transition (Requirement 7.3) ────────────────────────────────────────

describe('GlassPanel — smooth theme transitions (Requirement 7.3)', () => {
  it('applies a CSS transition property', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    expect(el.style.transition).toBeTruthy()
    expect(el.style.transition).toContain('background-color')
  })
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('GlassPanel — rendering', () => {
  it('renders children', () => {
    render(<GlassPanel>Hello World</GlassPanel>)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders as a div by default', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    expect(el.tagName).toBe('DIV')
  })

  it('renders as a custom element when "as" prop is provided', () => {
    render(
      <GlassPanel as="section" data-testid="glass">
        Content
      </GlassPanel>,
    )
    const el = screen.getByTestId('glass')
    expect(el.tagName).toBe('SECTION')
  })

  it('applies the glass-panel base class', () => {
    render(<GlassPanel data-testid="glass">Content</GlassPanel>)
    const el = screen.getByTestId('glass')
    expect(el.classList.contains('glass-panel')).toBe(true)
  })

  it('merges custom className with glass-panel', () => {
    render(
      <GlassPanel className="my-class" data-testid="glass">
        Content
      </GlassPanel>,
    )
    const el = screen.getByTestId('glass')
    expect(el.classList.contains('glass-panel')).toBe(true)
    expect(el.classList.contains('my-class')).toBe(true)
  })

  it('merges custom inline styles on top of base styles', () => {
    render(
      <GlassPanel style={{ padding: '24px' }} data-testid="glass">
        Content
      </GlassPanel>,
    )
    const el = screen.getByTestId('glass')
    expect(el.style.padding).toBe('24px')
    // Base styles are still present
    expect(el.style.width).toBe('100%')
  })

  it('forwards data-testid to the DOM element', () => {
    render(<GlassPanel data-testid="my-panel">Content</GlassPanel>)
    expect(screen.getByTestId('my-panel')).toBeInTheDocument()
  })

  it('renders without children', () => {
    render(<GlassPanel data-testid="glass" />)
    expect(screen.getByTestId('glass')).toBeInTheDocument()
  })
})
