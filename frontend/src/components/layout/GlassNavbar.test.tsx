/**
 * Unit tests for GlassNavbar component.
 * Requirements: 7.1, 7.2, 7.5, 10.1, 10.5
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import GlassNavbar from './GlassNavbar'

describe('GlassNavbar', () => {
  it('renders the default title', () => {
    render(<GlassNavbar />)
    expect(screen.getByText('Nimbus Launcher')).toBeInTheDocument()
  })

  it('renders a custom title', () => {
    render(<GlassNavbar title="My Launcher" />)
    expect(screen.getByText('My Launcher')).toBeInTheDocument()
  })

  it('renders children in the actions slot', () => {
    render(
      <GlassNavbar>
        <button>Login</button>
      </GlassNavbar>,
    )
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
  })

  it('renders a hamburger menu button', () => {
    render(<GlassNavbar />)
    expect(
      screen.getByRole('button', { name: /open menu/i }),
    ).toBeInTheDocument()
  })

  it('calls onMenuClick when hamburger is clicked', () => {
    const onMenuClick = vi.fn()
    render(<GlassNavbar onMenuClick={onMenuClick} />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(onMenuClick).toHaveBeenCalledTimes(1)
  })

  it('toggles aria-expanded on hamburger click', () => {
    render(<GlassNavbar />)
    const btn = screen.getByRole('button', { name: /open menu/i })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders a nav element with accessible label', () => {
    render(<GlassNavbar />)
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
  })

  it('applies sticky positioning', () => {
    render(<GlassNavbar data-testid="navbar" />)
    // The outer nav wrapper has position: sticky
    const nav = screen.getByRole('navigation')
    expect(nav.style.position).toBe('sticky')
  })
})
