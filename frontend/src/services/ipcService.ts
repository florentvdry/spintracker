import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ExportBucket, ExportFilter } from '@/utils/exportFilter'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any

export interface ApiResult<T = Json> {
  success: boolean
  data?: T
  message?: string
  error?: string
  [key: string]: Json
}

export interface ImportProgress {
  stage: 'counting' | 'importing'
  filesProcessed: number
  totalFiles: number
  percent: number
  handsImported: number
  handsSkipped?: number
  totalHands: number | null
}

export type AutoImportState = 'off' | 'nofolder' | 'watching' | 'importing' | 'paused' | 'error'

export interface AutoImportStatus {
  state: AutoImportState
  message: string | null
}

export interface AutoImportFolder {
  room: string
  path: string
}

export interface BackfillProgress {
  done: number
  total: number
}

export interface HandsImported {
  imported: number
  files: number
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  releaseNotes?: string
  progress?: { percent: number }
  error?: string
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Runs a Tauri command; failures become `{ success: false }` like the old bridge. */
async function command<T = Json>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    console.warn(`Tauri is not available. Command: ${name}`)
    return { success: false, message: 'Tauri is not available' } as T
  }
  try {
    return await invoke<T>(name, args)
  } catch (error) {
    console.error(`[IPC Error] ${name}:`, error)
    return { success: false, message: String(error) } as T
  }
}

function backend<T = Json>(method: Method, endpoint: string, body?: unknown): Promise<ApiResult<T>> {
  return command<ApiResult<T>>('backend_request', { method, endpoint, body: body ?? null })
}

/** Builds a query string, skipping empty values (the backend treats them as "no filter"). */
function query(params: Record<string, unknown>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false && value !== 0)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

const enc = encodeURIComponent

function subscribe<T>(event: string, callback: (payload: T) => void): () => void {
  if (!isTauri) return () => {}
  let unlisten: UnlistenFn | null = null
  let cancelled = false
  listen<T>(event, (e) => callback(e.payload)).then((fn) => {
    if (cancelled) fn()
    else unlisten = fn
  })
  return () => {
    cancelled = true
    unlisten?.()
  }
}

export const ipcService = {
  // Dashboard & stats
  getDashboardStats: (heroName?: string | null, dateFrom?: string | null, dateTo?: string | null, buyIn?: number | null) =>
    backend('GET', `/db/dashboard-stats${query({ heroName, dateFrom, dateTo, buyIn, supersede: true })}`),
  getSessionHistory: (limit = 50, heroName?: string | null, dateFrom?: string | null, dateTo?: string | null, buyIn?: number | null) =>
    backend('POST', '/db/session-history?supersede=true', { limit, heroName, dateFrom, dateTo, buyIn }),
  getWinrateChartData: (options: Json = {}) => backend('POST', '/db/winrate-chart', options),
  getMultiplierStats: (options: Json = {}) => backend('POST', '/db/multiplier-stats', options),
  getBuyIns: () => backend<number[]>('GET', '/db/buyins'),
  getDetailedStats: (
    heroName?: string | null,
    dateFrom?: string | null,
    dateTo?: string | null,
    buyIn?: number | null,
    statsScope: string = 'population',
    opponentName: string | null = null,
  ) => backend('GET', `/db/detailed-stats${query({ heroName, dateFrom, dateTo, buyIn, statsScope, opponentName })}`),

  // Hands & tournaments
  getHands: (options: Json = {}) => backend('POST', '/db/hands', options),
  getTournaments: (options: Json = {}) => backend('POST', '/db/tournaments', options),
  getTournamentHands: (gameId: string | number, heroName?: string | null) =>
    backend('GET', `/db/tournament-hands?gameId=${enc(String(gameId))}${heroName ? `&heroName=${enc(heroName)}` : ''}`),
  getHandDetails: (handId: string | number, heroName: string | null = null) =>
    backend('GET', `/db/hand/${enc(String(handId))}${query({ heroName })}`),
  getHandReplay: (handId: string | number, heroName: string | null = null) =>
    backend('GET', `/analysis/replayer/${enc(String(handId))}${query({ heroName })}`),

  // Players
  getPlayers: (options: Json = {}) => backend('POST', '/db/players', options),
  getOpponents: (heroName: string | null, limit = 2000) =>
    backend('GET', `/db/opponents?heroName=${enc(heroName ?? '')}&limit=${enc(String(limit))}`),
  updatePlayerRegStatus: (playerId: number | string, isReg: boolean) =>
    backend('POST', `/db/players/${playerId}/reg-status`, { isReg }),
  getHandsAgainstPlayer: (opponentName: string, heroName: string | null, limit = 50, page = 1) =>
    backend('POST', `/db/hands-against/${enc(opponentName)}`, { heroName, limit, page }),
  syncPlayers: () => backend('POST', '/db/players/sync', {}),

  // Aliases
  getAliases: () => backend('GET', '/db/aliases'),
  createAlias: (request: Json) => backend('POST', '/db/aliases', request),
  deleteAlias: (aliasId: number | string) => backend('DELETE', `/db/aliases/${aliasId}`),
  linkPlayerToAlias: (playerId: number | string, request: Json) => backend('POST', `/db/players/${playerId}/link`, request),
  unlinkPlayerFromAlias: (playerId: number | string) => backend('POST', `/db/players/${playerId}/unlink`, {}),

  // Analysis & ranges
  getRangeHeatmap: (filters: Json = {}) => backend('POST', '/db/range-heatmap', filters),
  getRangeBreakdown: (filters: Json = {}) => backend('POST', '/analysis/range-breakdown', filters),
  calculateEquity: (params: Json) => backend('POST', '/equity', params),

  // Databases
  getDatabases: () => backend('GET', '/api/databases'),
  getActiveDatabase: () => backend('GET', '/api/databases/active'),
  createDatabase: (name: string) => backend('POST', '/api/databases', { name }),
  setActiveDatabase: (id: number | string) => command<ApiResult>('set_active_database', { id }),
  deleteDatabase: (id: number | string) => backend('DELETE', `/api/databases/${id}`),
  renameDatabase: (id: number | string, name: string) => backend('PUT', `/api/databases/${id}`, { name }),

  // Maintenance
  deleteAllHands: () => command<ApiResult>('delete_all_hands'),
  importHandHistory: () => command<ApiResult>('import_hand_history'),
  getAutoImport: () => command<ApiResult>('auto_import_get'),
  setAutoImport: (enabled: boolean, folders: AutoImportFolder[]) => command<ApiResult>('auto_import_set', { enabled, folders }),
  getHudCatalog: () => backend<{ stats: { section: string; label: string; id: string; fixedSeat: boolean; name?: string; ready?: boolean }[] }>('GET', '/hud/catalog'),

  // Custom stats (definitions are the JSON of views/CustomStats/customStatModel.ts)
  getCustomStats: () => backend<Json[]>('GET', '/custom-stats'),
  getCustomStatOptions: () => backend('GET', '/custom-stats/options'),
  getCustomStatStatus: () => backend('GET', '/custom-stats/status'),
  createCustomStat: (definition: Json) => backend('POST', '/custom-stats', definition),
  updateCustomStat: (id: number, definition: Json) => backend('PUT', `/custom-stats/${id}`, definition),
  deleteCustomStat: (id: number) => backend('DELETE', `/custom-stats/${id}`),
  recomputeCustomStats: () => backend('POST', '/custom-stats/recompute', {}),
  previewCustomStat: (definition: Json, heroName?: string | null) => backend('POST', '/custom-stats/preview', { definition, heroName: heroName ?? null }),

  getHudState: async (): Promise<Json | null> => {
    const state = await command<Json | null>('hud_get_state')
    return state && state.success === false ? null : state
  },
  setHudPanelRects: (rects: { x: number; y: number; width: number; height: number }[]) => command<ApiResult>('hud_set_panel_rects', { rects }),
  getHudTables: () => command<ApiResult>('hud_tables'),
  associateHudTable: (table: number, gameId: string) => command<ApiResult>('hud_associate', { table, gameId }),
  setHudTableHidden: (table: number, hidden: boolean) => command<ApiResult>('hud_set_hidden', { table, hidden }),
  getHudPlayers: (body: Json) => backend('POST', '/hud/players', body),
  getHudFigureHands: (body: Json) => backend('POST', '/hud/figure-hands', body),
  getHudSettings: () => command<ApiResult>('hud_settings_get'),
  setHudSettings: (settings: Json) => command<ApiResult>('hud_settings_set', { settings }),
  setHudHeroes: (names: string[]) => command<ApiResult>('hud_set_heroes', { names }),
  pickAutoImportFolder: async (): Promise<string | null> => {
    const path = await command<unknown>('auto_import_pick_folder')
    return typeof path === 'string' ? path : null
  },
  getExportSummary: () => backend<ExportBucket[]>('GET', '/db/export-summary'),
  exportData: (dialogTitle: string, filter: ExportFilter) => command<ApiResult>('export_data', { dialogTitle, filter }),
  checkServerStatus: () => command<ApiResult>('check_server_status'),
  openLogsFolder: () => command<ApiResult>('open_logs_folder'),
  getAppVersion: async (): Promise<string | null> => {
    const version = await command<unknown>('get_app_version')
    // On failure `command` returns an error object instead of the version string.
    return typeof version === 'string' ? version : null
  },
  appReady: () => command<ApiResult>('app_ready'),
  openReplayer: (data: Json) => command<void>('open_replayer', { data }),
  getReplayerData: async (): Promise<Json | null> => {
    const data = await command<Json | null>('replayer_get_data')
    // `command` returns { success: false } on failure; a real hand payload never has that shape.
    return data && data.success === false ? null : data
  },
  log: (level: 'info' | 'warn' | 'error' | 'debug', message: string) => command<void>('frontend_log', { level, message }),

  // Updates
  checkForUpdates: () => command<void>('check_for_updates'),
  downloadUpdate: () => command<void>('download_update'),
  quitAndInstall: () => command<void>('quit_and_install'),

  // Events
  onImportProgress: (callback: (progress: ImportProgress) => void) => subscribe('import-progress', callback),
  /** The stored statistics are being recomputed (after an update changed their definition). */
  onBackfillProgress: (callback: (progress: BackfillProgress) => void) => subscribe('backfill-progress', callback),
  onHandsImported: (callback: (payload: HandsImported) => void) => subscribe('hands-imported', callback),
  onAutoImportStatus: (callback: (status: AutoImportStatus) => void) => subscribe('auto-import-status', callback),
  onHudState: (callback: (state: Json) => void) => subscribe('hud-state', callback),
  /** The HUD settings were saved: a HUD window already open reads them again. */
  onHudSettingsChanged: (callback: () => void) => subscribe('hud-settings-changed', callback),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => subscribe('update-status', callback),
}

export default ipcService
