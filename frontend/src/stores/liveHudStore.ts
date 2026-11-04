import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import {
  defaultSettings,
  importProfiles,
  MAX_PROFILES,
  newProfileId,
  sanitizeSettings,
  type HudFormat,
  type HudProfile,
  type HudRoom,
  type HudSettings,
  type PanelPosition,
} from '@/views/LiveHud/hudProfile'

/** Edits made in quick succession (a slider, a drag) are written once. */
const SAVE_DEBOUNCE_MS = 400

let saveTimer: ReturnType<typeof setTimeout> | null = null

interface LiveHudState {
  settings: HudSettings
  loaded: boolean
  load: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setActiveProfile: (id: string) => void
  updateProfile: (id: string, change: (profile: HudProfile) => HudProfile) => void
  addProfile: (name: string) => string | null
  duplicateProfile: (id: string, name: string) => string | null
  removeProfile: (id: string) => void
  /** Adds the profiles of a shared file; `false` when the file is not a valid one. */
  importProfilesFile: (content: string) => boolean
  setSnapToGrid: (snap: boolean) => void
  setPlacements: (room: HudRoom, format: HudFormat, positions: Record<string, PanelPosition>) => void
}

export const useLiveHudStore = create<LiveHudState>((set, get) => {
  const commit = (change: (settings: HudSettings) => HudSettings) => {
    set((state) => ({ settings: change(state.settings) }))
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void ipcService.setHudSettings(get().settings).then((result) => {
        if (!result.success) console.error('Could not save the HUD settings:', result.message)
      })
    }, SAVE_DEBOUNCE_MS)
  }

  return {
    settings: defaultSettings(),
    loaded: false,

    load: async () => {
      const result = await ipcService.getHudSettings()
      set({ settings: sanitizeSettings(result.success ? result.settings : null), loaded: true })
    },

    setEnabled: (enabled) => commit((s) => ({ ...s, enabled })),
    setActiveProfile: (id) => commit((s) => (s.profiles.some((p) => p.id === id) ? { ...s, activeProfileId: id } : s)),

    updateProfile: (id, change) =>
      commit((s) => ({ ...s, profiles: s.profiles.map((p) => (p.id === id ? change(p) : p)) })),

    addProfile: (name) => {
      if (get().settings.profiles.length >= MAX_PROFILES) return null
      const id = newProfileId()
      const base = get().settings.profiles[0]
      commit((s) => ({ ...s, profiles: [...s.profiles, { ...structuredClone(base), id, name }], activeProfileId: id }))
      return id
    },

    duplicateProfile: (id, name) => {
      const source = get().settings.profiles.find((p) => p.id === id)
      if (!source || get().settings.profiles.length >= MAX_PROFILES) return null
      const copyId = newProfileId()
      commit((s) => ({ ...s, profiles: [...s.profiles, { ...structuredClone(source), id: copyId, name }], activeProfileId: copyId }))
      return copyId
    },

    removeProfile: (id) =>
      commit((s) => {
        if (s.profiles.length <= 1) return s
        const profiles = s.profiles.filter((p) => p.id !== id)
        return { ...s, profiles, activeProfileId: s.activeProfileId === id ? profiles[0].id : s.activeProfileId }
      }),

    importProfilesFile: (content) => {
      const imported = importProfiles(content)
      if (!imported) return false
      commit((s) => ({ ...s, profiles: [...s.profiles, ...imported].slice(0, MAX_PROFILES) }))
      return true
    },

    setSnapToGrid: (snapToGrid) => commit((s) => ({ ...s, snapToGrid })),

    setPlacements: (room, format, positions) =>
      commit((s) => ({
        ...s,
        placements: { ...s.placements, [room]: { ...s.placements[room], [format]: positions } },
      })),
  }
})
