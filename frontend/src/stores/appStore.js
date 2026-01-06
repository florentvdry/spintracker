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
  initialize: async () => {
    if (get().isInitialized) return;
    
    set({ isLoading: true });
    
    try {
      // Charger les stats du dashboard
      await get().loadDashboardStats();
      
      // Charger l'historique des sessions
      await get().loadSessions();
      
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
      const result = await ipcService.getDashboardStats();
      if (result.success) {
        set({ dashboardStats: result.data });
      }
      return result;
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
      return { success: false, error };
    }
  },

  loadSessions: async (limit = 50) => {
    try {
      const result = await ipcService.getSessionHistory(limit);
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
