/**
 * Example usage of UpdateService
 *
 * This file demonstrates how to use the UpdateService to check for updates
 * on launcher startup.
 */

import { UpdateService } from './UpdateService';

/**
 * Example: Check for updates on launcher startup
 */
async function checkForUpdatesOnStartup() {
  // Get the local version from package.json
  const localVersion = '0.1.0'; // In real code, read from package.json

  // Create UpdateService instance with backend URL
  const updateService = new UpdateService(
    'https://nimbusgg.me',
    localVersion,
    5000, // 5-second timeout
  );

  // Check for updates
  const result = await updateService.checkForUpdates();

  if (result.updateRequired) {
    // Mandatory update - show blocking modal
    console.log('MANDATORY UPDATE REQUIRED');
    console.log(`Current version: ${localVersion}`);
    console.log(`Minimum required: ${result.versionInfo.minimum}`);
    console.log(`Latest version: ${result.versionInfo.current}`);
    console.log(`Download URL: ${result.versionInfo.downloadUrl}`);
    
    // In real code, this would trigger the UpdateModal component
    // which blocks all UI interaction until the user downloads the update
    return { showUpdateModal: true, versionInfo: result.versionInfo };
  } else if (result.updateAvailable) {
    // Optional update - show notification
    console.log('Optional update available');
    console.log(`Current version: ${localVersion}`);
    console.log(`Latest version: ${result.versionInfo.current}`);
    console.log(`Download URL: ${result.versionInfo.downloadUrl}`);
    
    // In real code, this could show a non-blocking notification
    return { showNotification: true, versionInfo: result.versionInfo };
  } else {
    // No update needed
    console.log('Launcher is up to date');
    return { showUpdateModal: false };
  }
}

/**
 * Example: Manual update check from settings menu
 */
async function manualUpdateCheck() {
  const localVersion = '0.1.0';
  const updateService = new UpdateService(
    'https://nimbusgg.me',
    localVersion,
  );

  try {
    const result = await updateService.checkForUpdates();
    
    if (result.updateAvailable) {
      return {
        success: true,
        message: `Update available: ${result.versionInfo.current}`,
        downloadUrl: result.versionInfo.downloadUrl,
      };
    } else {
      return {
        success: true,
        message: 'You are running the latest version',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: 'Failed to check for updates. Please try again later.',
    };
  }
}

// Export examples
export { checkForUpdatesOnStartup, manualUpdateCheck };
