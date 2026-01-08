import { create } from 'zustand';
import { ipcService } from '@services/ipcService';

/**
 * Store principal de l'application
 * Gère l'état global : stats dashboard, sessions, configuration
 */
export const useAppStore = create((set, get) => ({
  // État
  isLoading: true,
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
    const retry = async (fn, retries = 5, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          // Timeout de 2s par tentative pour ne pas bloquer indéfiniment
          const result = await Promise.race([
            fn(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
          ]);
          if (result && result.success) return result;
        } catch (e) {
          // Continue to next retry
        }
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
      }, 5, 1000);
      
      // Si échec des stats, on considère que l'init a échoué mais on laisse l'app s'ouvrir quand même
      // pour afficher l'erreur à l'utilisateur plutôt que de rester bloqué sur le splash.
      if (!statsResult || !statsResult.success) {
        set({ error: statsResult?.error || 'Impossible de charger les statistiques. Vérifiez que le backend tourne.' });
      } else {
        set({ isInitialized: true, loadingMessage: 'Prêt !' });
      }

      // 2. Charger l'historique des sessions (non-bloquant pour le splash)
      get().loadSessions();

      // Notify main process that renderer finished initialization so splash can close
      // IMPORTANT: On le fait DANS TOUS LES CAS pour ne jamais bloquer le splash
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
