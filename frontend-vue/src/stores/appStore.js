import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from './filterStore'

export const useAppStore = defineStore('app', () => {
  const isLoading = ref(true)
  const isInitialized = ref(false)
  const dashboardStats = ref(null)
  const sessions = ref([])
  const availableBuyIns = ref([])
  const lastUpdate = ref(0)
  const error = ref(null)
  const loadingMessage = ref('')

  const initialize = async () => {
    if (isInitialized.value) return

    isLoading.value = true
    error.value = null
    loadingMessage.value = 'Démarrage...'

    try {
      const filterStore = useFilterStore()
      
      let hydrationChecks = 0
      while (!filterStore._hasHydrated && hydrationChecks < 40) {
        await new Promise(resolve => setTimeout(resolve, 50))
        hydrationChecks++
      }

      loadingMessage.value = 'Connexion au serveur...'
      let backendReady = false
      let attempts = 0
      const maxAttempts = 120

      while (!backendReady && attempts < maxAttempts) {
        try {
          const res = await ipcService.checkServerStatus()
          if (res && res.success) {
            backendReady = true
          } else {
            throw new Error('Not ready')
          }
        } catch (e) {
          attempts++
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      if (!backendReady) {
        console.warn('[Init] Backend not responding after 60s')
      }

      await loadBuyIns()

      isLoading.value = true
      await Promise.all([
        loadDashboardStats(),
        loadSessions(50),
      ])
      lastUpdate.value = Date.now()
      isLoading.value = false

      isInitialized.value = true
      isLoading.value = false
      loadingMessage.value = 'Prêt !'

      try {
        const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null }
        if (ipcRenderer && ipcRenderer.invoke) {
          await ipcRenderer.invoke('app-ready')
        }
      } catch (e) {}

    } catch (err) {
      console.error('[Init] Critical failure:', err)
      error.value = err.message || 'Erreur lors de l\'initialisation'
      isLoading.value = false
    }
  }

  const loadDashboardStats = async () => {
    const filterStore = useFilterStore()
    if (!filterStore) {
      return { success: true, data: null }
    }
    const heroName = filterStore.heroName
    const buyIn = filterStore.buyIn
    const { getDateRangeParams } = filterStore

    const { dateFrom, dateTo } = getDateRangeParams()
    const buyInParam = buyIn === 'all' ? null : Number(buyIn)

    if (!heroName) {
      dashboardStats.value = null
      return { success: true, data: null }
    }

    try {

      const result = await ipcService.getDashboardStats(heroName, dateFrom, dateTo, buyInParam)
      if (result.success) {
        const stats = result.data || {}
        dashboardStats.value = {
          ...stats,
          total_profit: Number(stats.total_profit) || 0,
          total_hands: Number(stats.total_hands) || 0,
          total_ev: Number(stats.total_ev) || 0
        }
      }
      return result
    } catch (err) {
      console.error('Failed to load dashboard stats:', err)
      return { success: false, error: err }
    }
  }

  const loadSessions = async (limit = 50) => {
    try {
      const filterStore = useFilterStore()
      if (!filterStore) {
        return { success: true, data: [] }
      }
      const heroName = filterStore.heroName
      const buyIn = filterStore.buyIn

      const buyInParam = buyIn === 'all' ? null : Number(buyIn)

      if (!heroName) {
        sessions.value = []
        return { success: true, data: [] }
      }

      const result = await ipcService.getSessionHistory(limit, heroName, null, null, buyInParam)
      if (result.success) {
        sessions.value = result.data
      }
      return result
    } catch (err) {
      console.error('Failed to load sessions:', err)
      return { success: false, error: err }
    }
  }

  const loadBuyIns = async () => {
    try {
      const result = await ipcService.getBuyIns()
      if (result.success) {
        availableBuyIns.value = result.data
      }
    } catch (err) {
      console.error('Failed to load buy-ins:', err)
    }
  }

  const refreshAll = async () => {
    isLoading.value = true
    try {
      await Promise.all([
        loadDashboardStats(),
        loadSessions(50),
        loadBuyIns(),
      ])
      lastUpdate.value = Date.now()
    } finally {
      isLoading.value = false
    }
  }

  return {
    isLoading,
    isInitialized,
    dashboardStats,
    sessions,
    availableBuyIns,
    lastUpdate,
    error,
    loadingMessage,
    initialize,
    loadDashboardStats,
    loadSessions,
    loadBuyIns,
    refreshAll
  }
})
