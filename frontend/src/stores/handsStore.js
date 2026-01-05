import { create } from 'zustand';
import { ipcService } from '@services/ipcService';

/**
 * Store pour l'historique des mains et les analyses
 */
export const useHandsStore = create((set, get) => ({
  // État
  hands: [],
  totalHands: 0,
  isLoading: false,
  currentPage: 1,
  pageSize: 50,
  filters: {
    dateFrom: null,
    dateTo: null,
    position: null,
    result: null, // 'won', 'lost', 'all'
    minPot: null,
    maxPot: null,
  },
  selectedHand: null,

  // Actions
  loadHands: async () => {
    set({ isLoading: true });
    
    try {
      const { currentPage, pageSize, filters } = get();
      const result = await ipcService.getHands({
        page: currentPage,
        limit: pageSize,
        ...filters,
      });
      
      if (result.success) {
        set({
          hands: result.data.hands || [],
          totalHands: result.data.total || 0,
        });
      }
      
      return result;
    } catch (error) {
      console.error('Failed to load hands:', error);
      return { success: false, error };
    } finally {
      set({ isLoading: false });
    }
  },

  setPage: (page) => {
    set({ currentPage: page });
    get().loadHands();
  },

  setFilters: (updates) => {
    set((state) => ({
      filters: { ...state.filters, ...updates },
      currentPage: 1, // Reset to first page
    }));
    get().loadHands();
  },

  selectHand: async (handId) => {
    try {
      const result = await ipcService.getHandDetails(handId);
      if (result.success) {
        set({ selectedHand: result.data });
      }
      return result;
    } catch (error) {
      console.error('Failed to load hand details:', error);
      return { success: false, error };
    }
  },

  clearSelection: () => {
    set({ selectedHand: null });
  },
}));
