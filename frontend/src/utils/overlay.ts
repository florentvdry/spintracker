/** The overlay's default port, as the backend has it. */
export const OVERLAY_DEFAULT_PORT = 7779
/** Ports below this belong to the system. */
export const OVERLAY_MIN_PORT = 1024
export const OVERLAY_MAX_PORT = 65535

export type OverlayTheme = 'dark' | 'light'

export const OVERLAY_THEMES: readonly OverlayTheme[] = ['dark', 'light']

/** A port the player typed, when it is a whole number in the usable range; null otherwise. */
export function parseOverlayPort(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const port = Number(trimmed)
  return port >= OVERLAY_MIN_PORT && port <= OVERLAY_MAX_PORT ? port : null
}

/** The address a browser source loads: always the loopback address. */
export function overlayUrl(port: number): string {
  return `http://127.0.0.1:${port}/`
}
