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
  lastUpdate: 0,
  
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
    
    set({ isLoading: true, error: null, loadingMessage: 'Démarrage du serveur...' });
    
    // Helper pour réessayer les appels si le backend n'est pas encore prêt
    const retry = async (fn, retries = 15, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        const result = await fn();
        if (result && result.success) return result;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return { success: false, error: 'Le serveur ne répond pas après plusieurs tentatives.' };
    };
    
    try {
      // 1. Charger les stats du dashboard
      set({ loadingMessage: 'Chargement des statistiques...' });
      const statsResult = await retry(async () => {
        const res = await get().loadDashboardStats();
        return res;
      }, 15, 1000);
      
      if (!statsResult || !statsResult.success) {
        throw new Error(statsResult?.error || 'Impossible de charger les statistiques');
      }
      
      // 2. Charger l'historique des sessions
      set({ loadingMessage: 'Chargement des sessions...' });
      const sessionsResult = await retry(() => get().loadSessions(), 3, 1000);
      
      // On est moins strict sur les sessions, si ça échoue on continue mais on log
      if (!sessionsResult?.success) {
        console.warn('Failed to load sessions, continuing anyway', sessionsResult?.error);
      }
      
      set({ isInitialized: true, loadingMessage: 'Prêt !' });

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
      set({ error: typeof error === 'string' ? error : error.message || 'Erreur inconnue lors de l\'initialisation' });
      
      // Also notify app-ready so the user can see the error on the main window
      try {
        const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
        if (ipcRenderer && ipcRenderer.invoke) {
          ipcRenderer.invoke('app-ready');
        }
      } catch (e) {
        // ignore
      }
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
      set({ lastUpdate: Date.now() });
    } finally {
      set({ isLoading: false });
    }
  },
}));
