import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ipcService } from '@/services/ipcService'

export const usePlayersStore = defineStore('players', () => {
  const players = ref([])
  const heroName = ref(null)
  const isLoading = ref(false)
  const filters = ref({
    sortBy: 'hands',
    sortOrder: 'desc',
    minHands: 0,
    search: '',
  })
  const selectedPlayer = ref(null)

  const loadPlayers = async (options = {}) => {
    isLoading.value = true

    try {
      const result = await ipcService.getPlayers({
        ...filters.value,
        ...options,
      })

      if (result.success) {
        const playersList = Array.isArray(result.data) ? result.data : (result.data.players || [])

        players.value = playersList
        heroName.value = result.data.heroName || null
      }

      return result
    } catch (error) {
      console.error('Failed to load players:', error)
      return { success: false, error }
    } finally {
      isLoading.value = false
    }
  }

  const setFilters = (updates) => {
    filters.value = { ...filters.value, ...updates }
  }

  const selectPlayer = (player) => {
    selectedPlayer.value = player
  }

  const clearSelection = () => {
    selectedPlayer.value = null
  }

  return {
    players,
    heroName,
    isLoading,
    filters,
    selectedPlayer,
    loadPlayers,
    setFilters,
    selectPlayer,
    clearSelection
  }
})
