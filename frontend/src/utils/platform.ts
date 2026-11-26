/** Whether this computer is a Mac, from the browser identification of the webview. */
export function isMac(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Macintosh|Mac OS X/i.test(userAgent)
}

/**
 * The table HUD reads the windows of a Windows poker client, so it exists on Windows only.
 * The rest of the application is the same everywhere.
 */
export function hudSupported(userAgent?: string): boolean {
  return !isMac(userAgent)
}
