import { create } from 'zustand'
import { ipcService, type AutoImportFolder } from '@/services/ipcService'

/** Rooms whose history can be watched automatically; iPoker is detected but manual-only. */
const WATCHABLE_ROOMS = ['Winamax', 'Unibet'] as const

/** Persisted once the user finishes the first-launch onboarding wizard. */
const COMPLETED_KEY = 'onboarding_completed'

interface OnboardingRoom {
  room: string
  path: string
  selected: boolean
}

interface OnboardingState {
  completed: boolean
  detected: AutoImportFolder[]
  rooms: OnboardingRoom[]
  loading: boolean
  load: () => Promise<void>
  select: (room: string, checked: boolean) => void
  finish: () => Promise<void>
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  completed: false,
  detected: [],
  rooms: [],
  loading: false,

  load: async () => {
    const saved = localStorage.getItem(COMPLETED_KEY) === '1'
    set({ completed: saved })
    if (saved) return
    set({ loading: true })
    try {
      const result = await ipcService.detectHistoryFolders()
      if (!result.success) {
        set({ loading: false })
        return
      }
      const rooms: OnboardingRoom[] = (result.rooms ?? []).map((r) => ({
        room: r.room,
        path: r.path,
        selected: true,
      }))
      set({
        detected: rooms.map(({ room, path }) => ({ room, path })),
        rooms,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  select: (room: string, checked: boolean) => {
    set({
      rooms: get().rooms.map((r) => (r.room === room ? { ...r, selected: checked } : r)),
    })
  },

  finish: async () => {
    // Only watchable rooms can be auto-imported; iPoker is detected but manual-only.
    const selected = get().rooms
      .filter((r) => r.selected && WATCHABLE_ROOMS.includes(r.room as 'Winamax' | 'Unibet'))
      .map(({ room, path }) => ({ room, path }))
    const result = await ipcService.setAutoImport(true, selected)
    if (!result.success) return
    localStorage.setItem(COMPLETED_KEY, '1')
    set({ completed: true })
  },
}))
