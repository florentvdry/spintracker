import { create } from 'zustand'
import { ipcService, type AutoImportFolder } from '@/services/ipcService'

interface OnboardingState {
  needed: boolean | null
  detected: AutoImportFolder[]
  loaded: boolean
  /** Reads from the backend whether the assistant still has to run and which folders were found. */
  load: () => Promise<void>
  /** Saves the chosen folders as the auto-import settings and marks onboarding as done. */
  complete: (folders: AutoImportFolder[]) => Promise<string | null>
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  needed: null,
  detected: [],
  loaded: false,

  load: async () => {
    const result = await ipcService.onboardingDetect()
    if (!result.success) return
    set({ needed: !!result.needed, detected: result.detected ?? [], loaded: true })
  },

  complete: async (folders: AutoImportFolder[]) => {
    const result = await ipcService.onboardingComplete(folders)
    if (!result.success) return result.message ?? 'error'
    set({ needed: false, loaded: true })
    return null
  },
}))
