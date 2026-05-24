/**
 * Unit tests for LauncherDownloadPrompt component.
 *
 * Requirements: 4.7
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import LauncherDownloadPrompt from './LauncherDownloadPrompt'

describe('LauncherDownloadPrompt — default state (Requirement 4.7)', () => {
  it('renders the "Launcher não detectado" title', () => {
    render(<LauncherDownloadPrompt />)
    expect(screen.getByRole('heading', { name: /launcher não detectado/i })).toBeInTheDocument()
  })

  it('renders a message guiding the user to download the Launcher', () => {
    render(<LauncherDownloadPrompt />)
    expect(screen.getByText(/baixe e instale o launcher para continuar/i)).toBeInTheDocument()
  })

  it('renders a download button linking to the download URL', () => {
    render(<LauncherDownloadPrompt downloadUrl="/launcher/download" />)
    const btn = screen.getByRole('button', { name: /baixar o nimbus launcher/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('href', '/launcher/download')
  })

  it('uses the default download URL when none is provided', () => {
    render(<LauncherDownloadPrompt />)
    const btn = screen.getByRole('button', { name: /baixar o nimbus launcher/i })
    expect(btn).toHaveAttribute('href', '/launcher/download')
  })

  it('uses a custom download URL when provided', () => {
    render(<LauncherDownloadPrompt downloadUrl="https://example.com/download" />)
    const btn = screen.getByRole('button', { name: /baixar o nimbus launcher/i })
    expect(btn).toHaveAttribute('href', 'https://example.com/download')
  })

  it('applies the launcher-download-prompt class', () => {
    render(<LauncherDownloadPrompt data-testid="prompt" />)
    const panel = screen.getByTestId('prompt')
    expect(panel.className).toContain('launcher-download-prompt')
  })

  it('renders the download button with correct data-testid', () => {
    render(<LauncherDownloadPrompt data-testid="prompt" />)
    expect(screen.getByTestId('prompt-download-btn')).toBeInTheDocument()
  })
})

describe('LauncherDownloadPrompt — checking state', () => {
  it('renders a loading status when checking is true', () => {
    render(<LauncherDownloadPrompt checking />)
    expect(
      screen.getByRole('status', { name: /verificando disponibilidade do launcher/i }),
    ).toBeInTheDocument()
  })

  it('does not render the download button while checking', () => {
    render(<LauncherDownloadPrompt checking />)
    expect(
      screen.queryByRole('button', { name: /baixar o nimbus launcher/i }),
    ).not.toBeInTheDocument()
  })

  it('shows "Verificando Launcher…" text while checking', () => {
    render(<LauncherDownloadPrompt checking />)
    expect(screen.getByText(/verificando launcher/i)).toBeInTheDocument()
  })
})

describe('LauncherDownloadPrompt — accessibility', () => {
  it('has an accessible heading', () => {
    render(<LauncherDownloadPrompt />)
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })

  it('download button has an accessible label', () => {
    render(<LauncherDownloadPrompt />)
    const btn = screen.getByRole('button', { name: /baixar o nimbus launcher/i })
    expect(btn).toHaveAttribute('aria-label')
  })
})
