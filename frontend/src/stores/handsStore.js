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

    const { currentPage, pageSize, filters } = get();
    let lastError = null;

    // Retry a few times to handle the backend not being ready on app startup
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await ipcService.getHands({
          page: currentPage,
          limit: pageSize,
          ...filters,
        });

        if (result && result.success && result.data) {
          set({
            hands: result.data.hands || [],
            totalHands: result.data.total || 0,
          });
          set({ isLoading: false });
          return result;
        }

        lastError = result && result.error ? result.error : 'Unknown error';
      } catch (error) {
        lastError = error;
      }

      // Wait longer between attempts
      await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
    }

    console.error('Failed to load hands after retries:', lastError);
    set({ isLoading: false });
    return { success: false, error: lastError };
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
