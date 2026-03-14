import { create } from 'zustand';
import { ipcService } from '@services/ipcService';
import { useFilterStore } from './filterStore';

/**
 * Store principal de l'application
 * Gère le chargement des données globales
 */
export const useAppStore = create((set, get) => ({
  // État
  isLoading: true,
  isInitialized: false,
  dashboardStats: null,
  sessions: [],
  availableBuyIns: [],
  lastUpdate: 0,
  error: null,
  loadingMessage: '',
  
  // Actions
  initialize: async () => {
    if (get().isInitialized) return;
    
    set({ isLoading: true, error: null, loadingMessage: 'Démarrage...' });
    
    try {
      // 1. Attendre l'hydratation des filtres (localStorage)
      let hydrationChecks = 0;
      while (!useFilterStore.getState()._hasHydrated && hydrationChecks < 40) {
        await new Promise(resolve => setTimeout(resolve, 50));
        hydrationChecks++;
      }

      // 2. Attendre que le backend soit prêt (Polling)
      set({ loadingMessage: 'Connexion au serveur...' });
      let backendReady = false;
      let attempts = 0;
      const maxAttempts = 20; // Max 10 secondes d'attente (20 * 500ms)

      while (!backendReady && attempts < maxAttempts) {
        try {
          const res = await ipcService.getBuyIns();
          if (res && res.success) {
            backendReady = true;
          } else {
            throw new Error('Not ready');
          }
        } catch (e) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (!backendReady) {
        console.warn('[Init] Backend not responding after 10s');
      }

      // 3. Vérifier et mettre à jour le rake Betclic si nécessaire
      set({ loadingMessage: 'Vérification des mains Betclic...' });
      const rakeCheck = await ipcService.getBetclicRakePendingCount();
      if (rakeCheck.success && rakeCheck.count > 0) {
        set({ loadingMessage: `Mise à jour du rake Betclic (${rakeCheck.count} mains)...` });
        await ipcService.updateBetclicRake();
      }

      // 4. Charger les données de base
      await get().loadBuyIns();

      set({ isInitialized: true, isLoading: false, loadingMessage: 'Prêt !' });

      // Notify main process
      try {
        const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
        if (ipcRenderer && ipcRenderer.invoke) {
          await ipcRenderer.invoke('app-ready');
        }
      } catch (e) {}

    } catch (error) {
      console.error('[Init] Critical failure:', error);
      set({ error: error.message || 'Erreur lors de l\'initialisation', isLoading: false });
    }
  },

  loadDashboardStats: async () => {
    const { heroName, buyIn, getDateRangeParams } = useFilterStore.getState();
    
    // Si pas de héros, on reset les stats et on arrête là
    if (!heroName) {
      set({ dashboardStats: null });
      return { success: true, data: null };
    }

    try {
      const { dateFrom, dateTo } = getDateRangeParams();
      const buyInParam = buyIn === 'all' ? null : Number(buyIn);
      
      const result = await ipcService.getDashboardStats(heroName, dateFrom, dateTo, buyInParam);
      if (result.success) {
        const stats = result.data || {};
        set({ dashboardStats: {
          ...stats,
          total_profit: Number(stats.total_profit) || 0,
          total_hands: Number(stats.total_hands) || 0,
          total_ev: Number(stats.total_ev) || 0
        }});
      }
      return result;
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
      return { success: false, error };
    }
  },

  loadSessions: async (limit = 50) => {
    try {
      const { heroName, buyIn } = useFilterStore.getState();
      const buyInParam = buyIn === 'all' ? null : Number(buyIn);

      // On ne filtre pas les sessions par date pour le dashboard/header, on veut les dernières
      const result = await ipcService.getSessionHistory(limit, heroName, null, null, buyInParam);
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
