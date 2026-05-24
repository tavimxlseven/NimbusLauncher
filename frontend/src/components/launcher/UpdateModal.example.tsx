/**
 * UpdateModal.example.tsx — Example usage of UpdateModal component
 *
 * This file demonstrates how to integrate the UpdateModal into the application.
 * The modal should be displayed when UpdateService detects a mandatory update.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10
 */

import React, { useEffect, useState } from 'react'
import UpdateModal from './UpdateModal'
import type { VersionInfo } from './UpdateModal'

/**
 * Example: Integrating UpdateModal into App.tsx
 *
 * This example shows how to:
 * 1. Check for updates on app startup using UpdateService
 * 2. Display the UpdateModal when an update is required
 * 3. Open the download URL when the user clicks "Download Update"
 */
export const UpdateModalExample: React.FC = () => {
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [currentVersion] = useState('1.0.0') // This would come from package.json or app metadata

  useEffect(() => {
    // Check for updates on app mount
    const checkForUpdates = async () => {
      try {
        // In the real app, this would call the UpdateService via IPC
        // Example: const result = await window.electron.checkForUpdates()
        
        // Simulated update check result
        const mockUpdateCheckResult = {
          updateRequired: true,
          updateAvailable: true,
          versionInfo: {
            current: '1.2.0',
            minimum: '1.1.0',
            downloadUrl: 'https://github.com/nimbusgg/launcher/releases/latest',
            releaseNotes: 'Bug fixes and performance improvements',
          },
        }

        if (mockUpdateCheckResult.updateRequired) {
          setVersionInfo(mockUpdateCheckResult.versionInfo)
          setShowUpdateModal(true)
        }
      } catch (error) {
        console.error('Failed to check for updates:', error)
        // Safe default: don't block the launcher if update check fails
      }
    }

    checkForUpdates()
  }, [])

  const handleDownload = () => {
    if (versionInfo?.downloadUrl) {
      // Open download URL in default browser
      // In Electron: window.electron.openExternal(versionInfo.downloadUrl)
      window.open(versionInfo.downloadUrl, '_blank')
    }
  }

  return (
    <div>
      {/* Your app content */}
      <div style={{ padding: '20px' }}>
        <h1>Nimbus Launcher</h1>
        <p>Current version: {currentVersion}</p>
      </div>

      {/* Update modal (blocks all UI when shown) */}
      {showUpdateModal && versionInfo && (
        <UpdateModal
          versionInfo={versionInfo}
          currentVersion={currentVersion}
          onDownload={handleDownload}
        />
      )}
    </div>
  )
}

/**
 * Example: Integration with Electron IPC
 *
 * In the main process (electron/main/index.ts):
 * 
 * ```typescript
 * import { UpdateService } from './api/UpdateService'
 * import { app, ipcMain, shell } from 'electron'
 * 
 * const updateService = new UpdateService(
 *   'https://api.nimbusgg.me',
 *   app.getVersion(),
 *   5000
 * )
 * 
 * // Handle update check from renderer
 * ipcMain.handle('check-for-updates', async () => {
 *   return await updateService.checkForUpdates()
 * })
 * 
 * // Handle opening external URL
 * ipcMain.handle('open-external', async (_, url: string) => {
 *   await shell.openExternal(url)
 * })
 * ```
 * 
 * In the preload script (electron/preload.ts):
 * 
 * ```typescript
 * import { contextBridge, ipcRenderer } from 'electron'
 * 
 * contextBridge.exposeInMainWorld('electron', {
 *   checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
 *   openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
 * })
 * ```
 * 
 * In the renderer (App.tsx):
 * 
 * ```typescript
 * const result = await window.electron.checkForUpdates()
 * if (result.updateRequired) {
 *   setShowUpdateModal(true)
 *   setVersionInfo(result.versionInfo)
 * }
 * 
 * const handleDownload = () => {
 *   window.electron.openExternal(versionInfo.downloadUrl)
 * }
 * ```
 */

export default UpdateModalExample
