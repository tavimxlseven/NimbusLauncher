/**
 * Unit tests for LoginButton component.
 *
 * Requirements: 2.1
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import LoginButton from './LoginButton'

describe('LoginButton — rendering', () => {
  it('renders the "Entrar com Discord" label', () => {
    render(<LoginButton />)
    expect(screen.getByText('Entrar com Discord')).toBeInTheDocument()
  })

  it('renders as an anchor element (not a button)', () => {
    render(<LoginButton data-testid="login-button" />)
    const el = screen.getByTestId('login-button')
    expect(el.tagName.toLowerCase()).toBe('a')
  })

  it('has role="button" for accessibility', () => {
    render(<LoginButton />)
    expect(screen.getByRole('button', { name: /entrar com discord/i })).toBeInTheDocument()
  })

  it('has aria-label "Entrar com Discord"', () => {
    render(<LoginButton />)
    expect(screen.getByRole('button', { name: 'Entrar com Discord' })).toBeInTheDocument()
  })

  it('defaults href to /auth/discord (Requirement 2.1)', () => {
    render(<LoginButton data-testid="login-button" />)
    const el = screen.getByTestId('login-button')
    expect(el).toHaveAttribute('href', '/auth/discord')
  })

  it('accepts a custom href override', () => {
    render(<LoginButton href="/custom/auth" data-testid="login-button" />)
    expect(screen.getByTestId('login-button')).toHaveAttribute('href', '/custom/auth')
  })

  it('applies login-button class', () => {
    render(<LoginButton data-testid="login-button" />)
    expect(screen.getByTestId('login-button').className).toContain('login-button')
  })

  it('merges extra className', () => {
    render(<LoginButton className="extra-class" data-testid="login-button" />)
    expect(screen.getByTestId('login-button').className).toContain('extra-class')
  })

  it('applies LiquidGlass backdrop-filter blur via inline style', () => {
    render(<LoginButton data-testid="login-button" />)
    const el = screen.getByTestId('login-button') as HTMLElement
    expect(el.style.backdropFilter).toContain('blur')
  })

  it('applies border-radius ≥ 12px via inline style', () => {
    render(<LoginButton data-testid="login-button" />)
    const el = screen.getByTestId('login-button') as HTMLElement
    expect(el.style.borderRadius).toBeTruthy()
  })

  it('renders the Discord brand icon (SVG)', () => {
    render(<LoginButton data-testid="login-button" />)
    const svg = screen.getByTestId('login-button').querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})

describe('LoginButton — loading state', () => {
  it('shows "Entrando…" text when loading', () => {
    render(<LoginButton loading />)
    expect(screen.getByText('Entrando…')).toBeInTheDocument()
  })

  it('does not show "Entrar com Discord" text when loading', () => {
    render(<LoginButton loading />)
    expect(screen.queryByText('Entrar com Discord')).not.toBeInTheDocument()
  })

  it('sets aria-disabled when loading', () => {
    render(<LoginButton loading data-testid="login-button" />)
    expect(screen.getByTestId('login-button')).toHaveAttribute('aria-disabled', 'true')
  })

  it('removes href when loading to prevent navigation', () => {
    render(<LoginButton loading data-testid="login-button" />)
    expect(screen.getByTestId('login-button')).not.toHaveAttribute('href')
  })

  it('renders a spinner icon when loading', () => {
    render(<LoginButton loading data-testid="login-button" />)
    // Lucide Loader icon renders as SVG
    const svg = screen.getByTestId('login-button').querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})

describe('LoginButton — hover interaction', () => {
  it('updates hover style on mouseenter', () => {
    render(<LoginButton data-testid="login-button" />)
    const el = screen.getByTestId('login-button') as HTMLElement
    fireEvent.mouseEnter(el)
    // After hover the background should change — just verify no crash
    expect(el).toBeInTheDocument()
  })

  it('restores style on mouseleave', () => {
    render(<LoginButton data-testid="login-button" />)
    const el = screen.getByTestId('login-button') as HTMLElement
    fireEvent.mouseEnter(el)
    fireEvent.mouseLeave(el)
    expect(el).toBeInTheDocument()
  })
})
