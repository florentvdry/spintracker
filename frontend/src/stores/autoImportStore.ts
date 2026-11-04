import { create } from 'zustand'
import { ipcService, type AutoImportFolder, type AutoImportStatus } from '@/services/ipcService'
import { useAppStore } from './appStore'

/** Hands arrive in bursts while playing: reload the data once the burst is over. */
const REFRESH_DEBOUNCE_MS = 2000

const IDLE_STATUS: AutoImportStatus = { state: 'off', message: null }

interface AutoImportState {
  enabled: boolean
  folders: AutoImportFolder[]
  detected: AutoImportFolder[]
  status: AutoImportStatus
  loaded: boolean
  load: () => Promise<void>
  save: (enabled: boolean, folders: AutoImportFolder[]) => Promise<string | null>
  /** Subscribes to the backend events; returns the cleanup function. */
  listen: () => () => void
}

export const useAutoImportStore = create<AutoImportState>((set, get) => ({
  enabled: false,
  folders: [],
  detected: [],
  status: IDLE_STATUS,
  loaded: false,

  load: async () => {
    const result = await ipcService.getAutoImport()
    if (!result.success) return
    set({
      enabled: result.enabled,
      folders: result.folders,
      detected: result.detected,
      status: result.status,
      loaded: true,
    })
  },

  save: async (enabled, folders) => {
    const result = await ipcService.setAutoImport(enabled, folders)
    if (!result.success) return result.message ?? 'error'
    set({ enabled, folders })
    return null
  },

  listen: () => {
    void get().load()
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const stopStatus = ipcService.onAutoImportStatus((status) => set({ status }))
    const stopHands = ipcService.onHandsImported(() => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => void useAppStore.getState().refreshAll(), REFRESH_DEBOUNCE_MS)
    })
    return () => {
      stopStatus()
      stopHands()
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  },
}))
