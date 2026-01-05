/**
 * Service pour les calculs Python (équité, analyse)
 * Communique avec le backend Python via IPC
 */

import { ipcService } from './ipcService';
import { useProgressStore } from '@stores/progressStore';

class PythonService {
  constructor() {
    this.isAvailable = false;
    this.version = null;
  }

  /**
   * Vérifie si le backend Python est disponible
   */
  async checkAvailability() {
    try {
      const result = await ipcService.invoke('python-health-check');
      this.isAvailable = result.success;
      this.version = result.version;
      return result;
    } catch (error) {
      this.isAvailable = false;
      return { success: false, error };
    }
  }

  /**
   * Calcul d'équité avec progression
   */
  async calculateEquity({ heroCards, villainCards, board = '', iterations = 10000 }) {
    const progressStore = useProgressStore.getState();
    
    progressStore.startProgress({
      title: 'Calcul d\'équité',
      message: 'Initialisation...',
      canCancel: true,
    });

    try {
      // Écouter les mises à jour de progression
      const unsubscribe = ipcService.on('equity-progress', ({ progress, message }) => {
        progressStore.updateProgress({ progress, message });
      });

      const result = await ipcService.invoke('python-calculate-equity', {
        heroCards,
        villainCards,
        board,
        iterations,
      });

      unsubscribe();
      progressStore.finishProgress();
      
      return result;
    } catch (error) {
      progressStore.finishProgress();
      throw error;
    }
  }

  /**
   * Analyse complète des leaks avec progression
   */
  async analyzeLeaks(options = {}) {
    const progressStore = useProgressStore.getState();
    
    progressStore.startProgress({
      title: 'Analyse des leaks',
      message: 'Chargement des données...',
      canCancel: true,
    });

    try {
      const unsubscribe = ipcService.on('analysis-progress', ({ progress, message, stage }) => {
        progressStore.updateProgress({ 
          progress, 
          message: `${stage}: ${message}`,
        });
      });

      const result = await ipcService.invoke('python-analyze-leaks', options);

      unsubscribe();
      progressStore.finishProgress();
      
      return result;
    } catch (error) {
      progressStore.finishProgress();
      throw error;
    }
  }

  /**
   * Recalcul de toutes les EV avec progression
   */
  async recalculateAllEV() {
    const progressStore = useProgressStore.getState();
    
    progressStore.startProgress({
      title: 'Recalcul des EV',
      message: 'Préparation...',
      canCancel: false,
    });

    try {
      const unsubscribe = ipcService.on('ev-recalc-progress', ({ progress, message, handsProcessed, totalHands }) => {
        progressStore.updateProgress({ 
          progress, 
          message: `${handsProcessed}/${totalHands} mains traitées`,
        });
      });

      const result = await ipcService.invoke('python-recalculate-ev');

      unsubscribe();
      progressStore.finishProgress();
      
      return result;
    } catch (error) {
      progressStore.finishProgress();
      throw error;
    }
  }

  /**
   * Analyse de range GTO
   */
  async analyzeRange({ position, stack, action }) {
    return ipcService.invoke('python-analyze-range', { position, stack, action });
  }
}

export const pythonService = new PythonService();
export default pythonService;
