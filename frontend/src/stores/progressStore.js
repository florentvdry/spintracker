import { create } from 'zustand';

/**
 * Store pour la gestion de la progression des tâches asynchrones
 */
export const useProgressStore = create((set, get) => ({
  // État
  isVisible: false,
  title: '',
  message: '',
  progress: 0,
  subProgress: null, // Pour les sous-tâches
  canCancel: false,
  
  // Actions
  startProgress: ({ title, message = '', canCancel = false }) => {
    set({
      isVisible: true,
      title,
      message,
      progress: 0,
      subProgress: null,
      canCancel,
    });
  },
  
  updateProgress: ({ progress, message, subProgress }) => {
    set((state) => ({
      progress: progress ?? state.progress,
      message: message ?? state.message,
      subProgress: subProgress ?? state.subProgress,
    }));
  },
  
  finishProgress: () => {
    set({
      isVisible: false,
      title: '',
      message: '',
      progress: 0,
      subProgress: null,
      canCancel: false,
    });
  },
  
  // Pour les opérations annulables
  cancelToken: null,
  setCancelToken: (token) => set({ cancelToken: token }),
  
  cancel: () => {
    const { cancelToken } = get();
    if (cancelToken) {
      cancelToken.cancel();
    }
    get().finishProgress();
  },
}));
