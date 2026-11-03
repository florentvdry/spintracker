import { create } from 'zustand'
import { ipcService, type Json } from '@/services/ipcService'

interface PlayersFilters {
  sortBy: string
  sortOrder: 'asc' | 'desc'
  minHands: number
  search: string
}

interface PlayersState {
  players: Json[]
  heroName: string | null
  isLoading: boolean
  filters: PlayersFilters
  selectedPlayer: Json | null
  loadPlayers: (options?: Json) => Promise<void>
  setFilters: (updates: Partial<PlayersFilters>) => void
  selectPlayer: (player: Json | null) => void
  clearSelection: () => void
}

export const usePlayersStore = create<PlayersState>((set, get) => ({
  players: [],
  heroName: null,
  isLoading: false,
  filters: { sortBy: 'hands', sortOrder: 'desc', minHands: 0, search: '' },
  selectedPlayer: null,

  loadPlayers: async (options = {}) => {
    set({ isLoading: true })
    try {
      const result = await ipcService.getPlayers({ ...get().filters, ...options })
      if (result.success) {
        const data = result.data
        set({
          players: Array.isArray(data) ? data : (data?.players ?? []),
          heroName: data?.heroName ?? null,
        })
      }
    } catch (error) {
      console.error('Failed to load players:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  setFilters: (updates) => set((state) => ({ filters: { ...state.filters, ...updates } })),
  selectPlayer: (selectedPlayer) => set({ selectedPlayer }),
  clearSelection: () => set({ selectedPlayer: null }),
}))
