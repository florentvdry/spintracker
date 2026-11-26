import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { cleanName, MAX_PRESETS, sanitizePresets, snapshotOf, type FilterPreset } from '@/utils/filterPresets'
import { useFilterStore } from './filterStore'

interface FilterPresetsState {
  presets: FilterPreset[]
  /** Saves the filters now in force under a name; replaces a preset of the same name. */
  saveCurrent: (name: string) => boolean
  apply: (id: string) => void
  remove: (id: string) => void
}

const newId = () => `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export const useFilterPresetsStore = create<FilterPresetsState>()(
  persist(
    (set, get) => ({
      presets: [],

      saveCurrent: (name) => {
        const cleaned = cleanName(name)
        if (!cleaned) return false
        const filters = snapshotOf(useFilterStore.getState())
        const existing = get().presets.find((p) => p.name.toLowerCase() === cleaned.toLowerCase())
        if (!existing && get().presets.length >= MAX_PRESETS) return false
        set((state) => ({
          presets: existing
            ? state.presets.map((p) => (p.id === existing.id ? { ...p, filters } : p))
            : [...state.presets, { id: newId(), name: cleaned, filters }],
        }))
        return true
      },

      apply: (id) => {
        const preset = get().presets.find((p) => p.id === id)
        if (preset) useFilterStore.getState().setFilters({ ...preset.filters, selectedSession: null })
      },

      remove: (id) => set((state) => ({ presets: state.presets.filter((p) => p.id !== id) })),
    }),
    {
      name: 'spintracker-filter-presets',
      partialize: (state) => ({ presets: state.presets }),
      merge: (stored, current) => ({ ...current, presets: sanitizePresets((stored as Partial<FilterPresetsState> | undefined)?.presets) }),
    },
  ),
)
