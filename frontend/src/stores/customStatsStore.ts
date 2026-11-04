import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import { cleanDefinition, DEFAULT_LIMITS, type CustomStat, type CustomStatDef, type CustomStatOptions } from '@/views/CustomStats/customStatModel'

const STATUS_POLL_MS = 700

const FALLBACK_OPTIONS: CustomStatOptions = { flags: [], positions: ['BTN', 'SB', 'BB'], tableSizes: [2, 3], limits: DEFAULT_LIMITS }

export interface ComputeProgress {
  done: number
  total: number
}

interface CustomStatsState {
  stats: CustomStat[]
  options: CustomStatOptions
  loaded: boolean
  /** Figures are being computed over the history. */
  computing: boolean
  progress: ComputeProgress | null
  load: () => Promise<void>
  /** Saves a new stat (`id` null) or an edit; resolves to an error message, or `null` on success. */
  save: (id: number | null, definition: CustomStatDef) => Promise<string | null>
  remove: (id: number) => Promise<void>
  /** Computes the figures of the stats that wait for them. */
  recompute: () => Promise<void>
}

export const useCustomStatsStore = create<CustomStatsState>((set, get) => ({
  stats: [],
  options: FALLBACK_OPTIONS,
  loaded: false,
  computing: false,
  progress: null,

  load: async () => {
    const [list, options] = await Promise.all([ipcService.getCustomStats(), ipcService.getCustomStatOptions()])
    set({
      stats: list.success && Array.isArray(list.data) ? (list.data as CustomStat[]) : get().stats,
      options: options.success && options.data ? (options.data as CustomStatOptions) : get().options,
      loaded: true,
    })
  },

  save: async (id, definition) => {
    const body = cleanDefinition(definition)
    const result = id === null ? await ipcService.createCustomStat(body) : await ipcService.updateCustomStat(id, body)
    if (!result.success) return result.message ?? result.error ?? 'error'
    await get().load()
    void get().recompute()
    return null
  },

  remove: async (id) => {
    await ipcService.deleteCustomStat(id)
    await get().load()
  },

  recompute: async () => {
    if (get().computing) return
    set({ computing: true, progress: null })
    let stopped = false
    const poll = async () => {
      while (!stopped) {
        await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_MS))
        const status = await ipcService.getCustomStatStatus()
        if (!stopped && status.success && status.data?.running) set({ progress: { done: status.data.done, total: status.data.total } })
      }
    }
    void poll()
    try {
      await ipcService.recomputeCustomStats()
    } finally {
      stopped = true
      set({ computing: false, progress: null })
      await get().load()
    }
  },
}))
