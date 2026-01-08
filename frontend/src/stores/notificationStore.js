import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Store pour les notifications toast
 */
export const useNotificationStore = create(
  persist(
    (set, get) => ({
      notifications: [],
      history: [], // Historique persistant des notifications
      
      // Ajouter une notification
      addNotification: (notification) => {
        const id = Date.now();
        const newNotification = {
          id,
          type: 'info',
          duration: 5000,
          ...notification,
        };
        
        set((state) => ({
          notifications: [...state.notifications, newNotification],
          // Ajouter à l'historique (max 50 items)
          history: [
            { 
              ...newNotification, 
              read: false, 
              timestamp: new Date().toISOString() 
            }, 
            ...state.history
          ].slice(0, 50)
        }));
        
        // Auto-remove après duration
        if (newNotification.duration > 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, newNotification.duration);
        }
        
        return id;
      },
      
      // Helpers rapides
      success: (message, title) => get().addNotification({ type: 'success', message, title }),
      error: (message, title) => get().addNotification({ type: 'error', message, title, duration: 8000 }),
      warning: (message, title) => get().addNotification({ type: 'warning', message, title }),
      info: (message, title) => get().addNotification({ type: 'info', message, title }),
      
      // Supprimer une notification (toast uniquement)
      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      // Marquer une notification comme lue
      markAsRead: (id) => {
        set((state) => ({
          history: state.history.map(n => n.id === id ? { ...n, read: true } : n)
        }));
      },

      // Tout marquer comme lu
      markAllAsRead: () => {
        set((state) => ({
          history: state.history.map(n => ({ ...n, read: true }))
        }));
      },
      
      // Supprimer une notification de l'historique
      removeHistoryItem: (id) => {
        set((state) => ({
          history: state.history.filter(n => n.id !== id)
        }));
      },

      // Vider l'historique
      clearHistory: () => {
        set({ history: [] });
      },
      
      // Supprimer toutes les notifications (toast)
      clearAll: () => {
        set({ notifications: [] });
      },
    }),
    {
      name: 'notification-storage',
      partialize: (state) => ({ history: state.history }),
    }
  )
);
