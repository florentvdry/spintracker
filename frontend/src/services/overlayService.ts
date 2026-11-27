import { invoke } from '@tauri-apps/api/core'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

async function command<T = Json>(name: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(name, args)
  } catch (error) {
    console.error(`[Overlay IPC] ${name}:`, error)
    return { success: false, message: String(error) } as T
  }
}

function query(params: Record<string, string | null>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

/** Thin IPC layer for the overlay window, which is served as its own local HTML page. */
export const overlayService = {
  getStreamerSettings: () =>
    command<{ success: boolean; settings: Json | null }>('streamer_settings_get'),
  setStreamerSettings: (settings: Json) =>
    command<{ success: boolean }>('streamer_settings_set', { settings }),
  /** Dashboard figures for a period, the same source the main dashboard uses. */
  dashboardStats: (dateFrom: string | null, dateTo: string | null) =>
    command<{ success: boolean; data: Json }>('backend_request', {
      method: 'GET',
      endpoint: `/db/dashboard-stats${query({ dateFrom, dateTo })}`,
      body: null,
    }),
  /** Latest session, used to bound the "current session" range. */
  latestSession: () =>
    command<{ success: boolean; data: Json[] }>('backend_request', {
      method: 'GET',
      endpoint: '/db/session-history?limit=1',
      body: null,
    }),
}
