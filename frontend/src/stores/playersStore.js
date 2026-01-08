import { create } from 'zustand';
import { ipcService } from '@services/ipcService';

/**
 * Store pour les données des joueurs
 */
export const usePlayersStore = create((set, get) => ({
  // État
  players: [],
  heroName: null,
  isLoading: false,
  filters: {
    sortBy: 'hands',
    sortOrder: 'desc',
    minHands: 0,
    search: '',
  },
  selectedPlayer: null,

  // Actions
  loadPlayers: async (options = {}) => {
    set({ isLoading: true });
    
    try {
      const result = await ipcService.getPlayers({
        ...get().filters,
        ...options,
      });
      
      if (result.success) {
        // Handle both formats: array directly or object with players property
        const playersList = Array.isArray(result.data) ? result.data : (result.data.players || []);
        
        set({
          players: playersList,
          heroName: result.data.heroName || null,
        });
      }
      
      return result;
    } catch (error) {
      console.error('Failed to load players:', error);
      return { success: false, error };
    } finally {
      set({ isLoading: false });
    }
  },

  setFilters: (updates) => {
    set((state) => ({
      filters: { ...state.filters, ...updates },
    }));
  },

  selectPlayer: (player) => {
    set({ selectedPlayer: player });
  },

  clearSelection: () => {
    set({ selectedPlayer: null });
  },
}));
