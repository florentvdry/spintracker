import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import { logError } from '@/utils/log'

const SETTING_KEY = 'rakeback'

/** Rakeback percentage by room key (`winamax`), 0 meaning none. */
export type RakebackRates = Record<string, number>

interface RakebackState {
  rates: RakebackRates
  loaded: boolean
  load: () => Promise<void>
  save: (rates: RakebackRates) => Promise<boolean>
}

export const useRakebackStore = create<RakebackState>((set) => ({
  rates: {},
  loaded: false,

  load: async () => {
    try {
      const result = await ipcService.getSetting(SETTING_KEY)
      const stored = result.success && result.data && typeof result.data === 'object' ? (result.data as RakebackRates) : {}
      set({ rates: stored, loaded: true })
    } catch (error) {
      logError('Failed to load the rakeback rates:', error)
    }
  },

  save: async (rates) => {
    try {
      const cleaned = Object.fromEntries(Object.entries(rates).filter(([, pct]) => pct > 0 && pct <= 100))
      const result = await ipcService.saveSetting(SETTING_KEY, cleaned)
      if (result.success) set({ rates: cleaned })
      return result.success
    } catch (error) {
      logError('Failed to save the rakeback rates:', error)
      return false
    }
  },
}))
