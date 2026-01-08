import { create } from 'zustand';
import { ipcService } from '@services/ipcService';

/**
 * Store principal de l'application
 * Gère l'état global : stats dashboard, sessions, configuration
 */
export const useAppStore = create((set, get) => ({
  // État
  isLoading: false,
  isInitialized: false,
  dashboardStats: null,
  sessions: [],
  heroName: null,
  
  // Configuration
  config: {
    theme: 'dark',
    dateRange: 'all',
    autoRefresh: true,
  },

  // Actions
  setHeroName: (name) => {
    set({ heroName: name });
    get().refreshAll();
  },

  initialize: async () => {
    if (get().isInitialized) return;
    
    set({ isLoading: true });
    
    // Helper pour réessayer les appels si le backend n'est pas encore prêt
    const retry = async (fn, retries = 5, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        const result = await fn();
        if (result && result.success) return result;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return { success: false, error: 'Max retries exceeded' };
    };
    
    try {
      // Charger les stats du dashboard
      await retry(() => get().loadDashboardStats());
      
      // Charger l'historique des sessions
      await retry(() => get().loadSessions());
      
      set({ isInitialized: true });

      // Notify main process that renderer finished initialization so splash can close
      try {
        const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
        if (ipcRenderer && ipcRenderer.invoke) {
          ipcRenderer.invoke('app-ready');
        }
      } catch (e) {
        // ignore
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  loadDashboardStats: async () => {
    try {
      const heroName = get().heroName;
      const result = await ipcService.getDashboardStats(heroName);
      if (result.success) {
        const stats = result.data || {};
        // Coercer en nombre pour éviter les valeurs string/undefined
        stats.total_profit = Number(stats.total_profit) || 0;
        stats.total_hands = Number(stats.total_hands) || 0;
        stats.total_ev = Number(stats.total_ev) || 0;
        set({ dashboardStats: stats });
      }
      return result;
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
      return { success: false, error };
    }
  },

  loadSessions: async (limit = 50) => {
    try {
      const heroName = get().heroName;
      const result = await ipcService.getSessionHistory(limit, heroName);
      if (result.success) {
        set({ sessions: result.data });
      }
      return result;
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return { success: false, error };
    }
  },

  setConfig: (updates) => {
    set((state) => ({
      config: { ...state.config, ...updates },
    }));
  },

  refreshAll: async () => {
    set({ isLoading: true });
    try {
      await Promise.all([
        get().loadDashboardStats(),
        get().loadSessions(),
      ]);
    } finally {
      set({ isLoading: false });
    }
  },
}));
