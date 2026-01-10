/**
 * Service de communication IPC avec le processus principal Electron
 * Abstraction pour tous les appels IPC
 */

// Type check pour Electron
const isElectron = typeof window !== 'undefined' && window.require;
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null;

class IPCService {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Invoke une méthode IPC et retourne le résultat
   */
  async invoke(channel, ...args) {
    if (!ipcRenderer) {
      console.warn(`IPC not available. Channel: ${channel}`);
      return { success: false, message: 'IPC not available' };
    }
    
    try {
      return await ipcRenderer.invoke(channel, ...args);
    } catch (error) {
      console.error(`IPC Error (${channel}):`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Écoute les événements IPC
   */
  on(channel, callback) {
    if (!ipcRenderer) return () => {};
    
    const wrappedCallback = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, wrappedCallback);
    
    // Stocker pour cleanup
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    this.listeners.get(channel).push(wrappedCallback);
    
    // Retourne une fonction de cleanup
    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback);
    };
  }

  /**
   * Écoute une fois un événement IPC
   */
  once(channel, callback) {
    if (!ipcRenderer) return;
    ipcRenderer.once(channel, (event, ...args) => callback(...args));
  }

  /**
   * Nettoie tous les listeners d'un channel
   */
  removeAllListeners(channel) {
    if (!ipcRenderer) return;
    ipcRenderer.removeAllListeners(channel);
    this.listeners.delete(channel);
  }

  // ============ API Methods ============

  // Dashboard
  async getDashboardStats(heroName) {
    return this.invoke('get-dashboard-stats', heroName);
  }

  async getWinrateChartData(options = {}) {
    return this.invoke('get-winrate-chart-data', options);
  }

  // Sessions
  async getSessionHistory(limit = 50, heroName) {
    return this.invoke('get-session-history', limit, heroName);
  }

  // Hands
  async getHands(options = {}) {
    return this.invoke('get-hands', options);
  }

  async getHandDetails(handId) {
    return this.invoke('get-hand-details', handId);
  }

  // Players
  async getPlayers(options = {}) {
    return this.invoke('get-players', options);
  }

  // Import
  async importHandHistory() {
    return this.invoke('import-hand-history');
  }

  onImportProgress(callback) {
    return this.on('import-progress', callback);
  }

  // Analysis
  async analyzeLeaks(options = {}) {
    return this.invoke('analyze-leaks', options);
  }

  async getRangeHeatmap(filters = {}) {
    return this.invoke('get-range-heatmap', filters);
  }

  async getAnalysisStats(filters = {}) {
    return this.invoke('get-analysis-stats', filters);
  }

  async getAnalysisHands(request = {}) {
    return this.invoke('get-analysis-hands', request);
  }

  async getRangeBreakdown(filters = {}) {
    return this.invoke('get-range-breakdown', filters);
  }

  // Python Calculations
  async calculateEquity(params) {
    return this.invoke('python-calculate-equity', params);
  }

  async runAnalysis(params) {
    return this.invoke('python-run-analysis', params);
  }

  onAnalysisProgress(callback) {
    return this.on('analysis-progress', callback);
  }

  // System
  async checkServerStatus() {
    return this.invoke('check-server-status');
  }

  // Data Management
  async deleteAllHands() {
    return this.invoke('delete-all-hands');
  }

  async exportData(format = 'json') {
    return this.invoke('export-data', format);
  }

  async analyzeRange({ position, stack, action }) {
    return this.invoke('python-analyze-range', { position, stack, action });
  }

  // Stats Builder
  async evaluateStat(stat) {
    return this.invoke('stats-builder-evaluate', stat);
  }

  // Updater
  async downloadUpdate() {
    return this.invoke('download-update');
  }

  async quitAndInstall() {
    return this.invoke('quit-and-install');
  }

  onUpdateStatus(callback) {
    return this.on('update-status', callback);
  }
}

export const ipcService = new IPCService();
export default ipcService;
