import { create } from 'zustand'
import { ipcService, type Json } from '@/services/ipcService'
import { buyInParam, currentDateRange, useFilterStore } from './filterStore'
import { logError } from '@/utils/log'

export type ViewMode = 'tournaments' | 'hands'

interface HandsFilters {
  position: string | null
  result: string | null
  minPot: number | null
  maxPot: number | null
  sortBy: string
  /** Only the hands where the hero left their own range. */
  rangeDeviation: boolean
}

interface HandsState {
  tournaments: Json[]
  totalTournaments: number
  handsList: Json[]
  totalHandsCount: number
  isLoading: boolean
  isLoadingHands: boolean
  isLoadingHand: boolean
  currentPage: number
  pageSize: number
  filters: HandsFilters
  viewMode: ViewMode
  /** The hands behind a figure of a report: when set, the list shows only these. */
  handSelection: { title: string; ids: string[] } | null
  selectedHand: Json | null
  selectedTournament: Json | null
  tournamentHands: Json[]
  loadTournaments: () => Promise<void>
  loadHandsList: () => Promise<void>
  loadData: () => Promise<void>
  loadTournamentHands: (gameId: string | number) => Promise<void>
  setViewMode: (mode: ViewMode) => void
  setPage: (page: number) => void
  setSortBy: (sortBy: string) => void
  setFilters: (updates: Partial<HandsFilters>) => void
  /** Shows exactly these hands in the history (by hands view), under a title saying where they come from. */
  showHands: (title: string, ids: string[]) => void
  clearHandSelection: () => void
  selectHand: (handId: string | number | null) => Promise<void>
  selectTournament: (tournament: Json | null) => void
  clearSelection: () => void
}

// Only the answer to the latest request is kept: a slow older one must not overwrite it.
let tournamentsRequest = 0
let handsRequest = 0

export const useHandsStore = create<HandsState>((set, get) => ({
  tournaments: [],
  totalTournaments: 0,
  handsList: [],
  totalHandsCount: 0,
  isLoading: false,
  isLoadingHands: false,
  isLoadingHand: false,
  currentPage: 1,
  pageSize: 50,
  filters: { position: null, result: null, minPot: null, maxPot: null, sortBy: 'date_desc', rangeDeviation: false },
  viewMode: 'tournaments',
  handSelection: null,
  selectedHand: null,
  selectedTournament: null,
  tournamentHands: [],

  loadTournaments: async () => {
    const request = ++tournamentsRequest
    set({ isLoading: true })
    const { heroName, buyIn } = useFilterStore.getState()
    const { dateFrom, dateTo } = currentDateRange()
    const { currentPage, pageSize, filters } = get()

    try {
      const result = await ipcService.getTournaments({
        page: currentPage,
        limit: pageSize,
        heroName,
        sortBy: filters.sortBy,
        dateFrom,
        dateTo,
        buyIn: buyInParam(buyIn),
        result: filters.result,
        minPot: filters.minPot,
        maxPot: filters.maxPot,
      })
      if (request === tournamentsRequest && result?.success && result.data) {
        set({ tournaments: result.data.tournaments ?? [], totalTournaments: result.data.total ?? 0 })
      }
    } catch (error) {
      logError('Failed to load tournaments:', error)
    } finally {
      if (request === tournamentsRequest) set({ isLoading: false })
    }
  },

  loadHandsList: async () => {
    const request = ++handsRequest
    set({ isLoading: true })
    const { heroName } = useFilterStore.getState()
    const { dateFrom, dateTo } = currentDateRange()
    const { currentPage, pageSize, filters, handSelection } = get()

    try {
      const result = await ipcService.getHands({
        handIds: handSelection?.ids ?? undefined,
        page: currentPage,
        limit: pageSize,
        heroName,
        dateFrom,
        dateTo,
        result: filters.result,
        sortBy: filters.sortBy,
        rangeDeviation: filters.rangeDeviation,
      })
      if (request === handsRequest && result?.success && result.data) {
        set({ handsList: result.data.hands ?? [], totalHandsCount: result.data.total ?? 0 })
      }
    } catch (error) {
      logError('Failed to load hands list:', error)
    } finally {
      if (request === handsRequest) set({ isLoading: false })
    }
  },

  loadData: () => (get().viewMode === 'tournaments' ? get().loadTournaments() : get().loadHandsList()),

  loadTournamentHands: async (gameId) => {
    set({ isLoadingHands: true })
    try {
      const result = await ipcService.getTournamentHands(gameId, useFilterStore.getState().heroName)
      if (result?.success) set({ tournamentHands: result.data ?? [] })
    } catch (error) {
      logError('Failed to load tournament hands:', error)
    } finally {
      set({ isLoadingHands: false })
    }
  },

  setViewMode: (viewMode) => {
    set({ viewMode, currentPage: 1 })
    void get().loadData()
  },

  setPage: (currentPage) => {
    set({ currentPage })
    void get().loadData()
  },

  setSortBy: (sortBy) => {
    set((state) => ({ filters: { ...state.filters, sortBy }, currentPage: 1 }))
    void get().loadData()
  },

  setFilters: (updates) => {
    set((state) => ({ filters: { ...state.filters, ...updates }, currentPage: 1 }))
    void get().loadData()
  },

  showHands: (title, ids) => {
    set({ handSelection: { title, ids }, viewMode: 'hands', currentPage: 1 })
    void get().loadData()
  },

  clearHandSelection: () => {
    set({ handSelection: null, currentPage: 1 })
    void get().loadData()
  },

  selectHand: async (handId) => {
    if (!handId) return set({ selectedHand: null })

    set({ isLoadingHand: true, selectedHand: null })
    try {
      const result = await ipcService.getHandDetails(handId, useFilterStore.getState().heroName)
      if (result.success) set({ selectedHand: result.data })
    } catch (error) {
      logError('Failed to load hand details:', error)
    } finally {
      set({ isLoadingHand: false })
    }
  },

  selectTournament: (tournament) => {
    set({ selectedTournament: tournament })
    if (tournament) void get().loadTournamentHands(tournament.gameId ?? tournament.GameId)
    else set({ tournamentHands: [] })
  },

  clearSelection: () => set({ selectedHand: null, selectedTournament: null, tournamentHands: [] }),
}))
