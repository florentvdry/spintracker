import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import {
  applyTemplateToSettings,
  defaultSettings,
  duplicateWithPlacements,
  emptyProfile,
  importProfiles,
  MAX_PROFILES,
  newProfileId,
  sanitizeSettings,
  type HudDetection,
  type HudFormat,
  type HudProfile,
  type HudRoom,
  type HudSettings,
  type HudLayout,
  type SeatPlacements,
} from '@/views/LiveHud/hudProfile'
import type { TemplateId } from '@/views/LiveHud/hudTemplates'

/** Edits made in quick succession (a slider, a drag) are written once. */
const SAVE_DEBOUNCE_MS = 400

let saveTimer: ReturnType<typeof setTimeout> | null = null

interface LiveHudState {
  settings: HudSettings
  loaded: boolean
  load: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setRoomEnabled: (room: HudRoom, enabled: boolean) => void
  setDetection: (room: HudRoom, change: Partial<HudDetection>) => void
  setActiveProfile: (id: string) => void
  updateProfile: (id: string, change: (profile: HudProfile) => HudProfile) => void
  /** A copy of the first profile, or an empty one to build from scratch. */
  addProfile: (name: string, empty?: boolean) => string | null
  duplicateProfile: (id: string, name: string) => string | null
  removeProfile: (id: string) => void
  /** Adds the profiles of a shared file; `false` when the file is not a valid one. */
  importProfilesFile: (content: string) => boolean
  /** Applies a shipped model to a profile (see `applyTemplateToSettings`). */
  applyTemplate: (profileId: string, templateId: TemplateId) => void
  setSnapToGrid: (snap: boolean) => void
  /** Sets the layout of a format and where its grids sit in a room, in one save (one undo step for the editor). */
  setEditorDoc: (profileId: string, room: HudRoom, format: HudFormat, layout: HudLayout, seats: Record<string, SeatPlacements>) => void
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
    setRoomEnabled: (room, enabled) => commit((s) => ({ ...s, rooms: { ...s.rooms, [room]: enabled } })),
    setDetection: (room, change) => commit((s) => ({ ...s, detection: { ...s.detection, [room]: { ...s.detection[room], ...change } } })),
    setActiveProfile: (id) => commit((s) => (s.profiles.some((p) => p.id === id) ? { ...s, activeProfileId: id } : s)),

    updateProfile: (id, change) =>
      commit((s) => ({ ...s, profiles: s.profiles.map((p) => (p.id === id ? change(p) : p)) })),

    addProfile: (name, empty = false) => {
      if (get().settings.profiles.length >= MAX_PROFILES) return null
      const id = newProfileId()
      if (empty) {
        commit((s) => ({ ...s, profiles: [...s.profiles, emptyProfile(id, name)], activeProfileId: id }))
        return id
      }
      return get().duplicateProfile(get().settings.profiles[0].id, name)
    },

    duplicateProfile: (id, name) => {
      const source = get().settings.profiles.find((p) => p.id === id)
      if (!source || get().settings.profiles.length >= MAX_PROFILES) return null
      const copy = duplicateWithPlacements(source, get().settings.placements, name)
      commit((s) => ({ ...s, profiles: [...s.profiles, copy.profile], placements: copy.placements, activeProfileId: copy.profile.id }))
      return copy.profile.id
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

    applyTemplate: (profileId, templateId) => commit((s) => applyTemplateToSettings(s, profileId, templateId)),

    setSnapToGrid: (snapToGrid) => commit((s) => ({ ...s, snapToGrid })),

    setEditorDoc: (profileId, room, format, layout, seats) =>
      commit((s) => ({
        ...s,
        profiles: s.profiles.map((p) => (p.id === profileId ? { ...p, layouts: { ...p.layouts, [format]: layout } } : p)),
        placements: { ...s.placements, [room]: { ...s.placements[room], [format]: seats } },
      })),
  }
})
