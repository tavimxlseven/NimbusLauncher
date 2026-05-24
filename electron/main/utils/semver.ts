/**
 * Semantic version comparison utility
 * 
 * Compares two semantic version strings in the format MAJOR.MINOR.PATCH
 * 
 * @param v1 - First version string (e.g., "1.2.3")
 * @param v2 - Second version string (e.g., "1.2.4")
 * @returns Negative number if v1 < v2, 0 if v1 === v2, positive number if v1 > v2
 * 
 * @example
 * compareVersions("1.0.0", "1.0.1") // returns -1
 * compareVersions("2.0.0", "1.9.9") // returns 1
 * compareVersions("1.2.3", "1.2.3") // returns 0
 */
export function compareVersions(v1: string, v2: string): number {
  // Parse version strings into components
  const parts1 = v1.split('.')
  const parts2 = v2.split('.')
  
  // Extract major, minor, patch components
  const major1 = parseInt(parts1[0], 10)
  const minor1 = parseInt(parts1[1], 10)
  const patch1 = parseInt(parts1[2], 10)
  
  const major2 = parseInt(parts2[0], 10)
  const minor2 = parseInt(parts2[1], 10)
  const patch2 = parseInt(parts2[2], 10)
  
  // Compare major version first
  if (major1 < major2) {
    return -1
  } else if (major1 > major2) {
    return 1
  }
  
  // If major is equal, compare minor version
  if (minor1 < minor2) {
    return -1
  } else if (minor1 > minor2) {
    return 1
  }
  
  // If major and minor are equal, compare patch version
  if (patch1 < patch2) {
    return -1
  } else if (patch1 > patch2) {
    return 1
  }
  
  // All components are equal
  return 0
}
