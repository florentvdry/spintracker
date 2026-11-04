import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'

interface UpdateState {
  isAvailable: boolean
  isChecking: boolean
  isDownloading: boolean
  isDownloaded: boolean
  version: string
  releaseNotes: string
  progress: number
  error: string | null
  initialize: () => () => void
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set) => ({
  isAvailable: false,
  isChecking: false,
  isDownloading: false,
  isDownloaded: false,
  version: '',
  releaseNotes: '',
  progress: 0,
  error: null,

  initialize: () =>
    ipcService.onUpdateStatus(({ status, version, releaseNotes, progress, error }) => {
      switch (status) {
        case 'checking':
          set({ isChecking: true })
          break
        case 'available':
          set({ isChecking: false, isAvailable: true, version: version ?? '', releaseNotes: releaseNotes ?? '' })
          break
        case 'not-available':
          set({ isChecking: false, isAvailable: false })
          break
        case 'downloading':
          set({ isDownloading: true, progress: progress?.percent ?? 0 })
          break
        case 'downloaded':
          set({ isDownloading: false, isDownloaded: true, version: version ?? '' })
          break
        case 'error':
          set({ isChecking: false, isDownloading: false, error: error ?? 'Unknown error' })
          break
      }
    }),

  downloadUpdate: async () => {
    set({ error: null })
    await ipcService.downloadUpdate()
  },

  quitAndInstall: async () => {
    await ipcService.quitAndInstall()
  },
}))
