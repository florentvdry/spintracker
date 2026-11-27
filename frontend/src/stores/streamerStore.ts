import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import { logError } from '@/utils/log'

/** Version of the stored streamer settings; bump it when the shape changes. */
const STREAMER_SETTINGS_VERSION = 1

/** How often the overlay refreshes its figures, in milliseconds. */
const DEFAULT_REFRESH_MS = 5_000

/** The ranges the overlay can compute stats over. */
export type StreamerRange = 'session' | 'month' | 'all'

/** One stat the overlay may display. */
export interface StreamerStat {
  /** Stable id, matched against the backend dashboard-stats keys. */
  id: string
  label: string
  /** Shown unit, e.g. `€` or `hands`. */
  unit: string
  /** Default: shown on the overlay or not. */
  defaultEnabled: boolean
}

/** The stats the streamer may put on the overlay, in display order. */
export const STREAMER_STATS: StreamerStat[] = [
  { id: 'net_won', label: 'Net won', unit: '€', defaultEnabled: true },
  { id: 'cev', label: 'CEV', unit: '', defaultEnabled: true },
  { id: 'games', label: 'Tournaments', unit: '', defaultEnabled: false },
  { id: 'ev_profit', label: 'EV profit', unit: '€', defaultEnabled: false },
  { id: 'hands', label: 'Hands played', unit: 'hands', defaultEnabled: false },
]

/** What is persisted next to the databases. */
export interface StreamerSettings {
  version: number
  range: StreamerRange
  refreshMs: number
  /** stat id → whether it is shown on the overlay. */
  stats: Record<string, boolean>
}

const defaultSettings = (): StreamerSettings => ({
  version: STREAMER_SETTINGS_VERSION,
  range: 'session',
  refreshMs: DEFAULT_REFRESH_MS,
  stats: Object.fromEntries(STREAMER_STATS.map((s) => [s.id, s.defaultEnabled])),
})

interface StreamerState {
  settings: StreamerSettings
  loaded: boolean
  /** Reads the stored settings and merges them with the current defaults. */
  load: () => Promise<void>
  /** Persists the current settings next to the databases. */
  save: () => Promise<void>
  setRange: (range: StreamerRange) => void
  setStatEnabled: (id: string, enabled: boolean) => void
  setRefreshMs: (ms: number) => void
  /** Whether a stat is shown on the overlay. */
  isStatEnabled: (id: string) => boolean
  /** The stats currently selected for the overlay, in display order. */
  enabledStats: () => StreamerStat[]
}

export const useStreamerStore = create<StreamerState>((set, get) => ({
  settings: defaultSettings(),
  loaded: false,

  load: async () => {
    try {
      const result = await ipcService.getStreamerSettings()
      const stored = result.success ? (result.data?.settings as Partial<StreamerSettings> | null) : null
      if (stored) {
        const settings: StreamerSettings = {
          version: STREAMER_SETTINGS_VERSION,
          range: (typeof stored.range === 'string' && ['session', 'month', 'all'].includes(stored.range)
            ? stored.range
            : 'session') as StreamerRange,
          refreshMs:
            typeof stored.refreshMs === 'number' && stored.refreshMs > 0 && stored.refreshMs < 3_600_000
              ? stored.refreshMs
              : DEFAULT_REFRESH_MS,
          stats: { ...defaultSettings().stats, ...(typeof stored.stats === 'object' && stored.stats !== null ? stored.stats : {}) },
        }
        set({ settings, loaded: true })
        return
      }
    } catch (error) {
      logError('Failed to load streamer settings:', error)
    }
    set({ settings: defaultSettings(), loaded: true })
  },

  save: async () => {
    const { settings } = get()
    try {
      const result = await ipcService.setStreamerSettings(settings)
      if (!result.success) {
        logError('Failed to save streamer settings:', result.message)
      }
    } catch (error) {
      logError('Failed to save streamer settings:', error)
    }
  },

  setRange: (range) => set((state) => ({ settings: { ...state.settings, range } })),

  setStatEnabled: (id, enabled) =>
    set((state) => ({ settings: { ...state.settings, stats: { ...state.settings.stats, [id]: enabled } } })),

  setRefreshMs: (ms) => set((state) => ({ settings: { ...state.settings, refreshMs: ms } })),

  isStatEnabled: (id) => get().settings.stats[id] === true,

  enabledStats: () => STREAMER_STATS.filter((s) => get().settings.stats[s.id] === true),
}))
