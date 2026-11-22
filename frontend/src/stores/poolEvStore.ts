import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import { defaultPoolEvTables, fromStoredTables, toStoredTables, type PoolEvTables } from '@/utils/poolEv'
import { logError } from '@/utils/log'

const SETTING_KEY = 'pool_ev_tables'

interface PoolEvState {
  tables: PoolEvTables
  loaded: boolean
  /** Reads the saved tables; the first time, seeds the backend with the simulator presets. */
  load: () => Promise<void>
  save: (tables: PoolEvTables) => Promise<boolean>
}

export const usePoolEvStore = create<PoolEvState>((set) => ({
  tables: defaultPoolEvTables(),
  loaded: false,

  load: async () => {
    try {
      const result = await ipcService.getSetting(SETTING_KEY)
      const stored = result.success ? fromStoredTables(result.data) : null
      if (stored) {
        set({ tables: stored, loaded: true })
        return
      }
      const defaults = defaultPoolEvTables()
      await ipcService.saveSetting(SETTING_KEY, toStoredTables(defaults))
      set({ tables: defaults, loaded: true })
    } catch (error) {
      logError('Failed to load the PoolEV tables:', error)
    }
  },

  save: async (tables) => {
    try {
      const result = await ipcService.saveSetting(SETTING_KEY, toStoredTables(tables))
      if (result.success) set({ tables })
      return result.success
    } catch (error) {
      logError('Failed to save the PoolEV tables:', error)
      return false
    }
  },
}))
