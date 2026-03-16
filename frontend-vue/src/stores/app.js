import { defineStore } from 'pinia'
import { apiService } from '../services/api'

export const useAppStore = defineStore('app', {
  state: () => ({
    isLoading: true,
    isInitialized: false,
    dashboardStats: null,
    cevStats: null,
    chartData: [],
    error: null,
    loadingMessage: ''
  }),

  actions: {
    async initialize() {
      if (this.isInitialized) return

      this.isLoading = true
      this.error = null
      this.loadingMessage = 'Connexion au serveur...'

      try {
        let backendReady = false
        let attempts = 0
        const maxAttempts = 20

        while (!backendReady && attempts < maxAttempts) {
          try {
            await apiService.checkHealth()
            backendReady = true
          } catch (e) {
            attempts++
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }

        if (!backendReady) {
          console.warn('Backend not responding after 10s')
        }

        this.isInitialized = true
        this.isLoading = false
        this.loadingMessage = 'Prêt !'
      } catch (error) {
        console.error('Critical failure:', error)
        this.error = error.message || 'Erreur lors de l\'initialisation'
        this.isLoading = false
      }
    },

    async loadStats(heroName = null, dateFrom = null, dateTo = null) {
      try {
        const params = {}
        if (heroName) params.hero_name = heroName
        if (dateFrom) params.date_from = dateFrom
        if (dateTo) params.date_to = dateTo

        const response = await apiService.getStats(params)
        this.dashboardStats = response.data
        return response.data
      } catch (error) {
        console.error('Failed to load stats:', error)
        return null
      }
    },

    async loadCev(heroName, dateFrom = null, dateTo = null) {
      try {
        const response = await apiService.getCev(heroName, dateFrom, dateTo)
        this.cevStats = response.data
        return response.data
      } catch (error) {
        console.error('Failed to load CEV:', error)
        return null
      }
    },

    async loadChartData(heroName = null, dateFrom = null, dateTo = null, buyIn = null) {
      try {
        const params = {}
        if (heroName) params.hero_name = heroName
        if (dateFrom) params.date_from = dateFrom
        if (dateTo) params.date_to = dateTo
        if (buyIn) params.buy_in = buyIn

        const response = await apiService.getChartData(params)
        this.chartData = response.data.data || []
        return this.chartData
      } catch (error) {
        console.error('Failed to load chart data:', error)
        return []
      }
    },

    async refreshAll(heroName, dateFrom = null, dateTo = null, buyIn = null) {
      this.isLoading = true
      try {
        await Promise.all([
          this.loadStats(heroName, dateFrom, dateTo),
          this.loadChartData(heroName, dateFrom, dateTo, buyIn),
          this.loadCev(heroName, dateFrom, dateTo)
        ])
      } finally {
        this.isLoading = false
      }
    }
  }
})
