import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Global Filter Store
 * Handles Hero selection, Date ranges, and Buy-in filters across all pages.
 */
export const useFilterStore = create(
  persist(
    (set, get) => ({
      // Filters
      heroName: null,
      opponent: null,
      dateRange: 'month', // Default to 'month' instead of 'all'
      customDateFrom: null,
      customDateTo: null,
      selectedSession: null,
      buyIn: 'all',
      
      // Additional filters (can be expanded)
      position: 'all',
      result: 'all',
      _hasHydrated: false,

      // Actions
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setHeroName: (name) => set({ heroName: name }),
      setOpponent: (name) => set({ opponent: name }),
      
      setDateRange: (range) => {
        set({ dateRange: range });
        if (range !== 'custom' && range !== 'session') {
            set({ customDateFrom: null, customDateTo: null, selectedSession: null });
        }
      },
      
      setCustomDateRange: (from, to) => {
        set({ 
          dateRange: 'custom',
          customDateFrom: from,
          customDateTo: to,
          selectedSession: null
        });
      },

      setSelectedSession: (session) => {
        if (session === null) {
          set({ dateRange: 'all', selectedSession: null });
        } else {
          set({ dateRange: 'session', selectedSession: session });
        }
      },
      
      setBuyIn: (buyIn) => set({ buyIn }),
      
      setFilters: (updates) => set((state) => ({ ...state, ...updates })),

      resetFilters: () => set({
        dateRange: 'all',
        customDateFrom: null,
        customDateTo: null,
        selectedSession: null,
        buyIn: 'all',
        position: 'all',
        result: 'all'
      }),

      // Helper to get date params for API calls
      getDateRangeParams: () => {
        const { dateRange, customDateFrom, customDateTo, selectedSession } = get();
        let dateFrom = null;
        let dateTo = null;

        if (dateRange === 'all') return { dateFrom, dateTo };

        const now = new Date();
        const formatDate = (date) => {
          const pad = (n) => n.toString().padStart(2, '0');
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        };

        const startOfDay = (date) => {
          const d = new Date(date);
          d.setHours(0, 0, 0, 0);
          return d;
        };
        
        if (dateRange === 'today') {
          dateFrom = formatDate(startOfDay(now));
        } else if (dateRange === 'week') {
          // Start of week (Monday)
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1); 
          const monday = startOfDay(new Date(now.setDate(diff)));
          dateFrom = formatDate(monday);
        } else if (dateRange === 'month') {
          const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFrom = formatDate(firstOfMonth);
        } else if (dateRange === 'custom') {
          dateFrom = customDateFrom ? `${customDateFrom} 00:00:00` : null;
          dateTo = customDateTo ? `${customDateTo} 23:59:59` : null;
        } else if (dateRange === 'session' && selectedSession) {
          // Session date is in format "yyyy-MM-dd HH:mm"
          const sessionDate = new Date(selectedSession.session_date);
          dateFrom = formatDate(sessionDate);
          // Sessions are grouped by hands within 2 hours
          const sessionEnd = new Date(sessionDate.getTime() + 2 * 60 * 60 * 1000); // +2 hours
          dateTo = formatDate(sessionEnd);
        }

        return { dateFrom, dateTo };
      },
    }),
    {
      name: 'poker-filters-storage',
      // We only want to persist certain filters
      partialize: (state) => ({ 
        heroName: state.heroName,
        dateRange: state.dateRange,
        customDateFrom: state.customDateFrom,
        customDateTo: state.customDateTo,
        buyIn: state.buyIn
      }),
      onRehydrateStorage: (state) => {
        return () => state.setHasHydrated(true);
      }
    }
  )
);
