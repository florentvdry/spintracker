import { create } from 'zustand';

/**
 * Store pour les notifications toast
 */
export const useNotificationStore = create((set, get) => ({
  notifications: [],
  
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
  
  // Supprimer une notification
  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },
  
  // Supprimer toutes les notifications
  clearAll: () => {
    set({ notifications: [] });
  },
}));
