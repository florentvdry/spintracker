import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const apiService = {
  // Health
  async checkHealth() {
    return api.get('/health')
  },

  // Stats
  async getStats(params = {}) {
    return api.get('/stats', { params })
  },

  async getChartData(params = {}) {
    return api.get('/stats/chart', { params })
  },

  // CEV
  async getCev(heroName, dateFrom = null, dateTo = null) {
    return api.get('/cev', { params: { hero_name: heroName, date_from: dateFrom, date_to: dateTo } })
  },

  // Players
  async getPlayers(params = {}) {
    return api.get('/players', { params })
  },

  async updatePlayer(playerId, isReg) {
    return api.patch(`/players/${playerId}`, null, { params: { is_reg: isReg } })
  },

  // Tournaments
  async getTournaments(limit = 50) {
    return api.get('/tournaments', { params: { limit } })
  },

  async getTournament(tournamentId) {
    return api.get(`/tournaments/${tournamentId}`)
  },

  // Hands
  async getHands(params = {}) {
    return api.get('/hands', { params })
  },

  async getHandDetails(handId) {
    return api.get(`/hands/${handId}`)
  },

  // Equity
  async calculateEquity(params) {
    return api.post('/equity/calculate', params)
  },

  // Import
  async importFile(filePath) {
    return api.post('/parser/import', { file_path: filePath })
  },

  // Database
  async getDatabases() {
    return api.get('/database')
  },

  async createDatabase(name) {
    return api.post('/database', { name })
  },

  async deleteDatabase(id) {
    return api.delete(`/database/${id}`)
  },

  async resetDatabase() {
    return api.post('/database/reset')
  }
}

export default apiService
