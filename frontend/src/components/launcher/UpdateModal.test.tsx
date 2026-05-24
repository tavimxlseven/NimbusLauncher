/**
 * UpdateModal.test.tsx — Unit tests for UpdateModal component
 *
 * Tests:
 * - Modal renders with correct version information
 * - Download button triggers onDownload callback
 * - Modal blocks ESC key (cannot be closed)
 * - Release notes are displayed when provided
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UpdateModal from './UpdateModal'
import type { VersionInfo } from './UpdateModal'

describe('UpdateModal', () => {
  const mockVersionInfo: VersionInfo = {
    current: '1.2.0',
    minimum: '1.1.0',
    downloadUrl: 'https://example.com/download',
  }

  const mockOnDownload = vi.fn()

  it('renders with version information', () => {
    render(
      <UpdateModal
        versionInfo={mockVersionInfo}
        currentVersion="1.0.0"
        onDownload={mockOnDownload}
      />
    )

    // Check title
    expect(screen.getByText('Update Required')).toBeInTheDocument()

    // Check version information (Requirements 8.3, 8.4, 8.5)
    expect(screen.getByText('1.0.0')).toBeInTheDocument() // Current version
    expect(screen.getByText('1.1.0')).toBeInTheDocument() // Minimum required
    expect(screen.getByText('1.2.0')).toBeInTheDocument() // Latest version

    // Check download button (Requirement 8.6)
    expect(screen.getByText('Download Update')).toBeInTheDocument()
  })

  it('calls onDownload when download button is clicked', () => {
    render(
      <UpdateModal
        versionInfo={mockVersionInfo}
        currentVersion="1.0.0"
        onDownload={mockOnDownload}
      />
    )

    const downloadButton = screen.getByText('Download Update')
    fireEvent.click(downloadButton)

    expect(mockOnDownload).toHaveBeenCalledTimes(1)
  })

  it('displays release notes when provided', () => {
    const versionInfoWithNotes: VersionInfo = {
      ...mockVersionInfo,
      releaseNotes: 'Bug fixes and performance improvements',
    }

    render(
      <UpdateModal
        versionInfo={versionInfoWithNotes}
        currentVersion="1.0.0"
        onDownload={mockOnDownload}
      />
    )

    expect(screen.getByText('Release Notes')).toBeInTheDocument()
    expect(screen.getByText('Bug fixes and performance improvements')).toBeInTheDocument()
  })

  it('does not display release notes section when not provided', () => {
    render(
      <UpdateModal
        versionInfo={mockVersionInfo}
        currentVersion="1.0.0"
        onDownload={mockOnDownload}
      />
    )

    expect(screen.queryByText('Release Notes')).not.toBeInTheDocument()
  })

  it('prevents ESC key from closing modal (Requirement 8.8)', () => {
    render(
      <UpdateModal
        versionInfo={mockVersionInfo}
        currentVersion="1.0.0"
        onDownload={mockOnDownload}
      />
    )

    // Modal should be visible
    expect(screen.getByText('Update Required')).toBeInTheDocument()

    // Simulate ESC key press
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    // Modal should still be visible (ESC key is blocked)
    expect(screen.getByText('Update Required')).toBeInTheDocument()
  })

  it('has correct accessibility attributes', () => {
    render(
      <UpdateModal
        versionInfo={mockVersionInfo}
        currentVersion="1.0.0"
        onDownload={mockOnDownload}
      />
    )

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'update-modal-title')
    expect(dialog).toHaveAttribute('aria-describedby', 'update-modal-description')
  })

  it('uses custom data-testid when provided', () => {
    render(
      <UpdateModal
        versionInfo={mockVersionInfo}
        currentVersion="1.0.0"
        onDownload={mockOnDownload}
        data-testid="custom-update-modal"
      />
    )

    expect(screen.getByTestId('custom-update-modal')).toBeInTheDocument()
    expect(screen.getByTestId('custom-update-modal-card')).toBeInTheDocument()
    expect(screen.getByTestId('custom-update-modal-download-button')).toBeInTheDocument()
  })

  it('blocks body scroll when modal is open', () => {
    const { unmount } = render(
      <UpdateModal
        versionInfo={mockVersionInfo}
        currentVersion="1.0.0"
        onDownload={mockOnDownload}
      />
    )

    // Body overflow should be hidden
    expect(document.body.style.overflow).toBe('hidden')

    // Unmount modal
    unmount()

    // Body overflow should be restored
    expect(document.body.style.overflow).toBe('')
  })
})
