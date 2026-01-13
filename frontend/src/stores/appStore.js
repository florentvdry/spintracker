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
  availableBuyIns: [],
  heroName: null,
  lastUpdate: 0,
  
  // Configuration
  config: {
    theme: 'dark',
    dateRange: 'all', // 'today', 'week', 'month', 'all'
    buyIn: 'all',
    customDateFrom: null,
    customDateTo: null,
    autoRefresh: true,
  },

  // Actions
  setHeroName: (name) => {
    set({ heroName: name });
    get().refreshAll();
  },

  setBuyIn: (buyIn) => {
    set((state) => ({
      config: { ...state.config, buyIn }
    }));
    get().refreshAll();
  },

  setDateRange: (range) => {
    set((state) => ({
      config: { ...state.config, dateRange: range }
    }));
    get().refreshAll();
  },

  setCustomDateRange: (from, to) => {
    set((state) => ({
      config: { 
        ...state.config, 
        dateRange: 'custom',
        customDateFrom: from,
        customDateTo: to
      }
    }));
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
      console.log('[Init] Loading dashboard stats...');
      const statsResult = await retry(async () => {
        const res = await get().loadDashboardStats();
        return res;
      }, 5, 1000);
      
      // Si échec des stats, on considère que l'init a échoué mais on laisse l'app s'ouvrir quand même
      // pour afficher l'erreur à l'utilisateur plutôt que de rester bloqué sur le splash.
      if (!statsResult || !statsResult.success) {
        console.warn('[Init] Dashboard stats failed to load:', statsResult?.error);
        set({ error: statsResult?.error || 'Impossible de charger les statistiques. Vérifiez que le backend tourne.' });
      } else {
        console.log('[Init] Dashboard stats loaded successfully');
        set({ isInitialized: true, loadingMessage: 'Prêt !' });
      }

      // 2. Charger l'historique des sessions (non-bloquant pour le splash)
      console.log('[Init] Loading sessions...');
      get().loadSessions(5);

      // Notify main process that renderer finished initialization so splash can close
      // IMPORTANT: On le fait DANS TOUS LES CAS pour ne jamais bloquer le splash
      console.log('[Init] Sending app-ready to main process');
      try {
        const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
        if (ipcRenderer && ipcRenderer.invoke) {
          await ipcRenderer.invoke('app-ready');
        }
      } catch (e) {
        console.error('[Init] Failed to send app-ready:', e);
      }
    } catch (error) {
      console.error('[Init] Critical failure during initialize:', error);
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

  _getDateRangeParams: () => {
    const { dateRange, customDateFrom, customDateTo } = get().config;
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
      dateFrom = customDateFrom;
      dateTo = customDateTo;
    }

    return { dateFrom, dateTo };
  },

  loadDashboardStats: async () => {
    try {
      const heroName = get().heroName;
      const { buyIn } = get().config;
      const { dateFrom, dateTo } = get()._getDateRangeParams();
      const buyInParam = buyIn === 'all' ? null : Number(buyIn);
      
      const result = await ipcService.getDashboardStats(heroName, dateFrom, dateTo, buyInParam);
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
      const { buyIn } = get().config;
      const { dateFrom, dateTo } = get()._getDateRangeParams();
      const buyInParam = buyIn === 'all' ? null : Number(buyIn);

      const result = await ipcService.getSessionHistory(limit, heroName, dateFrom, dateTo, buyInParam);
      if (result.success) {
        set({ sessions: result.data });
      }
      return result;
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return { success: false, error };
    }
  },

  loadBuyIns: async () => {
    try {
      const result = await ipcService.getBuyIns();
      if (result.success) {
        set({ availableBuyIns: result.data });
      }
    } catch (error) {
      console.error('Failed to load buy-ins:', error);
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
        get().loadSessions(5),
        get().loadBuyIns(),
      ]);
      set({ lastUpdate: Date.now() });
    } finally {
      set({ isLoading: false });
    }
  },
}));
