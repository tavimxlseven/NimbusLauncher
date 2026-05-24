# UpdateModal Component

## Overview

The `UpdateModal` component is a mandatory update modal that blocks all launcher UI interaction when a critical update is required. It displays version information and provides a download button to get the latest version.

## Features

- **Blocking Overlay**: Covers entire launcher UI with dark overlay (Requirement 8.2)
- **Version Display**: Shows current, minimum required, and latest versions (Requirements 8.3, 8.4, 8.5)
- **Download Button**: Opens download URL in default browser (Requirement 8.6)
- **Non-Closable**: Cannot be closed via ESC key or X button (Requirement 8.8)
- **UI Blocking**: Prevents all interaction with launcher except the modal (Requirement 8.7)
- **Accessibility**: Proper ARIA attributes for screen readers
- **Responsive**: Works on all screen sizes
- **Optional Release Notes**: Displays release notes when provided

## Requirements Satisfied

- ✅ 8.1: Display blocking modal when mandatory update is detected
- ✅ 8.2: Cover entire launcher UI with dark overlay
- ✅ 8.3: Display current launcher version
- ✅ 8.4: Display minimum required version
- ✅ 8.5: Display latest available version
- ✅ 8.6: Include "Download Update" button that opens download URL
- ✅ 8.7: Block all UI interaction except the modal
- ✅ 8.8: Prevent modal from being closed (no X button, no ESC key)
- ✅ 8.9: Open download URL in default browser when button is clicked
- ✅ 8.10: Modal remains visible until launcher is closed and updated

## Usage

### Basic Usage

```tsx
import { UpdateModal } from './components/launcher'
import type { VersionInfo } from './components/launcher'

function App() {
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

  useEffect(() => {
    // Check for updates on app startup
    const checkUpdates = async () => {
      const result = await window.electron.checkForUpdates()
      if (result.updateRequired) {
        setShowUpdateModal(true)
        setVersionInfo(result.versionInfo)
      }
    }
    checkUpdates()
  }, [])

  const handleDownload = () => {
    if (versionInfo?.downloadUrl) {
      window.electron.openExternal(versionInfo.downloadUrl)
    }
  }

  return (
    <div>
      {/* Your app content */}
      
      {/* Update modal (blocks all UI when shown) */}
      {showUpdateModal && versionInfo && (
        <UpdateModal
          versionInfo={versionInfo}
          currentVersion="1.0.0"
          onDownload={handleDownload}
        />
      )}
    </div>
  )
}
```

### With Release Notes

```tsx
const versionInfo: VersionInfo = {
  current: '1.2.0',
  minimum: '1.1.0',
  downloadUrl: 'https://github.com/nimbusgg/launcher/releases/latest',
  releaseNotes: 'Bug fixes and performance improvements',
}

<UpdateModal
  versionInfo={versionInfo}
  currentVersion="1.0.0"
  onDownload={handleDownload}
/>
```

## Props

### `UpdateModalProps`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `versionInfo` | `VersionInfo` | Yes | Version information from the backend |
| `currentVersion` | `string` | Yes | Current launcher version (semver format) |
| `onDownload` | `() => void` | Yes | Callback when user clicks "Download Update" |
| `data-testid` | `string` | No | Custom test ID for testing |

### `VersionInfo`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `current` | `string` | Yes | Latest available version (semver format) |
| `minimum` | `string` | Yes | Minimum required version (semver format) |
| `downloadUrl` | `string` | Yes | URL to download page for the update |
| `releaseNotes` | `string` | No | Optional markdown release notes |

## Integration with UpdateService

The `UpdateModal` is designed to work with the `UpdateService` from the main process:

1. **Main Process** (`electron/main/index.ts`):
   ```typescript
   import { UpdateService } from './api/UpdateService'
   import { app, ipcMain, shell } from 'electron'
   
   const updateService = new UpdateService(
     'https://api.nimbusgg.me',
     app.getVersion(),
     5000
   )
   
   ipcMain.handle('check-for-updates', async () => {
     return await updateService.checkForUpdates()
   })
   
   ipcMain.handle('open-external', async (_, url: string) => {
     await shell.openExternal(url)
   })
   ```

2. **Preload Script** (`electron/preload.ts`):
   ```typescript
   import { contextBridge, ipcRenderer } from 'electron'
   
   contextBridge.exposeInMainWorld('electron', {
     checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
     openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
   })
   ```

3. **Renderer** (`App.tsx`):
   ```typescript
   const result = await window.electron.checkForUpdates()
   if (result.updateRequired) {
     setShowUpdateModal(true)
     setVersionInfo(result.versionInfo)
   }
   ```

## Styling

The component uses the Modrinth-inspired design system with LiquidGlass styling:

- **Dark overlay**: `rgba(0,0,0,0.9)` with 12px blur
- **Modal card**: Glass effect with blur and semi-transparent background
- **Accent color**: `#1bd96a` (Nimbus green)
- **Border radius**: 18px for the modal card
- **Typography**: System font stack with proper hierarchy

## Accessibility

- Uses `role="alertdialog"` for proper screen reader announcement
- Includes `aria-modal="true"` to indicate modal behavior
- Provides `aria-labelledby` and `aria-describedby` for context
- Prevents body scroll while modal is open
- Blocks ESC key to prevent accidental dismissal

## Testing

The component includes comprehensive unit tests:

```bash
npm test -- UpdateModal.test.tsx --run
```

Tests cover:
- ✅ Rendering with version information
- ✅ Download button callback
- ✅ Release notes display
- ✅ ESC key blocking
- ✅ Accessibility attributes
- ✅ Custom test IDs
- ✅ Body scroll blocking

## Files

- `UpdateModal.tsx` - Main component implementation
- `UpdateModal.test.tsx` - Unit tests
- `UpdateModal.example.tsx` - Usage examples and integration guide
- `UpdateModal.README.md` - This documentation file

## Design Decisions

1. **Non-closable**: The modal cannot be closed because it's a mandatory update. Users must download the update to continue using the launcher.

2. **Blocking overlay**: The dark overlay (90% opacity) ensures users cannot interact with the launcher UI behind the modal.

3. **ESC key prevention**: The component actively prevents ESC key events to ensure the modal cannot be dismissed accidentally.

4. **Body scroll lock**: Prevents scrolling the page behind the modal for better UX.

5. **Inline styles**: Uses inline styles for better encapsulation and to avoid CSS conflicts with the rest of the application.

6. **Accessibility first**: Proper ARIA attributes ensure the modal is accessible to screen reader users.

## Future Enhancements

Possible future improvements:

- [ ] Add progress indicator for download
- [ ] Support for automatic download and installation
- [ ] Changelog viewer with markdown rendering
- [ ] Multiple language support
- [ ] Animation for modal entrance

## Related Components

- `UpdateService` - Main process service for checking updates
- `GlassModal` - General-purpose modal component (closable)
- `LauncherDownloadPrompt` - Prompt for downloading the launcher

## License

Part of the Nimbus Launcher project.
