const isElectron = typeof window !== 'undefined' && window.require
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null

class IPCService {
  constructor() {
    this.listeners = new Map()
  }

  async invoke(channel, ...args) {
    // Sanitize arguments to avoid "An object could not be cloned" errors
    // which can happen with Vue reactive objects/proxies
    const sanitizedArgs = args.map(arg => {
      try {
        if (arg !== null && typeof arg === 'object') {
          return JSON.parse(JSON.stringify(arg))
        }
      } catch (e) {
        console.error(`[IPC] Failed to sanitize argument for ${channel}:`, e)
      }
      return arg
    })

    console.log(`[IPC →] ${channel}`, ...sanitizedArgs)
    if (!ipcRenderer) {
      console.warn(`IPC not available. Channel: ${channel}`)
      return { success: false, message: 'IPC not available' }
    }

    try {
      const result = await ipcRenderer.invoke(channel, ...sanitizedArgs)
      console.log(`[IPC ←] ${channel}`, result)
      return result
    } catch (error) {
      console.error(`[IPC Error] ${channel}:`, error)
      return { success: false, message: error.message }
    }
  }

  on(channel, callback) {
    if (!ipcRenderer) return () => {}

    const wrappedCallback = (event, ...args) => callback(...args)
    ipcRenderer.on(channel, wrappedCallback)

    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, [])
    }
    this.listeners.get(channel).push(wrappedCallback)

    return () => {
      ipcRenderer.removeListener(channel, wrappedCallback)
    }
  }

  once(channel, callback) {
    if (!ipcRenderer) return
    ipcRenderer.once(channel, (event, ...args) => callback(...args))
  }

  removeAllListeners(channel) {
    if (!ipcRenderer) return
    ipcRenderer.removeAllListeners(channel)
    this.listeners.delete(channel)
  }

  async getDashboardStats(heroName, dateFrom, dateTo, buyIn) {
    return this.invoke('get-dashboard-stats', heroName, dateFrom, dateTo, buyIn)
  }

  async getWinrateChartData(options = {}) {
    return this.invoke('get-winrate-chart-data', options)
  }

  async getMultiplierStats(options = {}) {
    return this.invoke('get-multiplier-stats', options)
  }

  async getSessionHistory(limit = 50, heroName, dateFrom, dateTo, buyIn) {
    return this.invoke('get-session-history', limit, heroName, dateFrom, dateTo, buyIn)
  }

  async getBuyIns() {
    return this.invoke('get-buy-ins')
  }

  async getDetailedStats(heroName, dateFrom, dateTo, buyIn, statsScope = 'population', opponentName = null) {
    return this.invoke('get-detailed-stats', heroName, dateFrom, dateTo, buyIn, statsScope, opponentName)
  }

  async getHands(options = {}) {
    return this.invoke('get-hands', options)
  }

  async getTournaments(options = {}) {
    return this.invoke('get-tournaments', options)
  }

  async getTournamentHands(gameId, heroName) {
    return this.invoke('get-tournament-hands', gameId, heroName)
  }

  async getHandDetails(handId, heroName = null) {
    return this.invoke('get-hand-details', handId, heroName)
  }

  async getHandReplay(handId, heroName = null) {
    return this.invoke('get-hand-replay', handId, heroName)
  }

  async getPlayers(options = {}) {
    return this.invoke('get-players', options)
  }

  async getOpponents(heroName, limit = 2000) {
    return this.invoke('get-opponents', heroName, limit)
  }

  async updatePlayerRegStatus(playerId, isReg) {
    return this.invoke('update-player-reg-status', playerId, isReg)
  }

  async getHandsAgainstPlayer(opponentName, heroName, limit = 50, page = 1) {
    return this.invoke('get-hands-against-player', opponentName, heroName, limit, page)
  }

  async importHandHistory() {
    return this.invoke('import-hand-history')
  }

  onImportProgress(callback) {
    return this.on('import-progress', callback)
  }

  async getRangeHeatmap(filters = {}) {
    return this.invoke('get-range-heatmap', filters)
  }

  async getAnalysisStats(filters = {}) {
    return this.invoke('get-analysis-stats', filters)
  }

  async getAnalysisHands(request = {}) {
    return this.invoke('get-analysis-hands', request)
  }

  async getRangeBreakdown(filters = {}) {
    return this.invoke('get-range-breakdown', filters)
  }

  async calculateEquity(params) {
    return this.invoke('python-calculate-equity', params)
  }

  async runAnalysis(params) {
    return this.invoke('python-run-analysis', params)
  }

  onAnalysisProgress(callback) {
    return this.on('analysis-progress', callback)
  }

  async checkServerStatus() {
    return this.invoke('check-server-status')
  }

  async deleteAllHands() {
    return this.invoke('delete-all-hands')
  }

  async resetDefaultStats() {
    return this.invoke('reset-default-stats')
  }

  async exportData(format = 'json') {
    return this.invoke('export-data', format)
  }

  async openLogsFolder() {
    return this.invoke('open-logs-folder')
  }

  async getAppVersion() {
    return this.invoke('get-app-version')
  }

  async analyzeRange({ position, stack, action }) {
    return this.invoke('python-analyze-range', { position, stack, action })
  }

  async evaluateStat(stat) {
    return this.invoke('stats-builder-evaluate', stat)
  }

  async downloadUpdate() {
    return this.invoke('download-update')
  }

  async quitAndInstall() {
    return this.invoke('quit-and-install')
  }

  onUpdateStatus(callback) {
    return this.on('update-status', callback)
  }

  async getDatabases() {
    return this.invoke('get-databases')
  }

  async getActiveDatabase() {
    return this.invoke('get-active-database')
  }

  async createDatabase(name) {
    return this.invoke('create-database', name)
  }

  async setActiveDatabase(id) {
    return this.invoke('set-active-database', id)
  }

  async deleteDatabase(id) {
    return this.invoke('delete-database', id)
  }

  async renameDatabase(id, name) {
    return this.invoke('rename-database', id, name)
  }
}

export const ipcService = new IPCService()
export default ipcService
