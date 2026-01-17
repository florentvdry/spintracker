import { create } from 'zustand';
import { ipcService } from '@services/ipcService';
import { useAppStore } from './appStore';

/**
 * Store pour l'historique des tournois, des mains et les analyses
 */
export const useHandsStore = create((set, get) => ({
  // État
  hands: [],
  tournaments: [],
  totalTournaments: 0,
  totalHands: 0,
  isLoading: false,
  isLoadingHands: false, // For tournament hands list
  isLoadingHand: false,  // For single hand details
  currentPage: 1,
  pageSize: 50,
  filters: {
    dateFrom: null,
    dateTo: null,
    position: null,
    result: null, // 'won', 'lost', 'all'
    minPot: null,
    maxPot: null,
    sortBy: 'date_desc',
  },
  selectedHand: null,
  selectedTournament: null,
  tournamentHands: [],

  // Actions
  loadTournaments: async () => {
    set({ isLoading: true });

    const { currentPage, pageSize, filters } = get();
    let lastError = null;

    try {
      const heroName = useAppStore.getState().heroName;
      const result = await ipcService.getTournaments({
        page: currentPage,
        limit: pageSize,
        heroName,
        sortBy: filters.sortBy,
        ...filters,
      });

      if (result && result.success && result.data) {
        set({
          tournaments: result.data.tournaments || [],
          totalTournaments: result.data.total || 0,
        });
        set({ isLoading: false });
        return result;
      }

      lastError = result && result.error ? result.error : 'Unknown error';
    } catch (error) {
      lastError = error;
    }

    console.error('Failed to load tournaments:', lastError);
    set({ isLoading: false });
    return { success: false, error: lastError };
  },

  loadTournamentHands: async (gameId) => {
    set({ isLoadingHands: true });
    try {
      const heroName = useAppStore.getState().heroName;
      const result = await ipcService.getTournamentHands(gameId, heroName);
      if (result && result.success) {
        set({ tournamentHands: result.data || [] });
      }
      set({ isLoadingHands: false });
      return result;
    } catch (error) {
      set({ isLoadingHands: false });
      console.error('Failed to load tournament hands:', error);
      return { success: false, error };
    }
  },

  setPage: (page) => {
    set({ currentPage: page });
    get().loadTournaments();
  },

  setSortBy: (sortBy) => {
    set((state) => ({
      filters: { ...state.filters, sortBy },
      currentPage: 1,
    }));
    get().loadTournaments();
  },

  setFilters: (updates) => {
    set((state) => ({
      filters: { ...state.filters, ...updates },
      currentPage: 1, // Reset to first page
    }));
    get().loadTournaments();
  },

  selectHand: async (handId) => {
    if (!handId) {
      set({ selectedHand: null });
      return { success: true };
    }
    
    set({ isLoadingHand: true });
    try {
      const heroName = useAppStore.getState().heroName;
      const result = await ipcService.getHandDetails(handId, heroName);
      if (result.success) {
        set({ selectedHand: result.data });
      }
      set({ isLoadingHand: false });
      return result;
    } catch (error) {
      set({ isLoadingHand: false });
      console.error('Failed to load hand details:', error);
      return { success: false, error };
    }
  },

  selectTournament: (tournament) => {
    set({ selectedTournament: tournament });
    if (tournament) {
      get().loadTournamentHands(tournament.gameId || tournament.GameId);
    } else {
      set({ tournamentHands: [] });
    }
  },

  clearSelection: () => {
    set({ selectedHand: null, selectedTournament: null, tournamentHands: [] });
  },
}));
