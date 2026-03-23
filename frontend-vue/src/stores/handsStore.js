import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from './filterStore'

export const useHandsStore = defineStore('hands', () => {
  const hands = ref([])
  const tournaments = ref([])
  const totalTournaments = ref(0)
  const totalHands = ref(0)
  const isLoading = ref(false)
  const isLoadingHands = ref(false)
  const isLoadingHand = ref(false)
  const currentPage = ref(1)
  const pageSize = ref(50)
  const filters = ref({
    position: null,
    result: null,
    minPot: null,
    maxPot: null,
    sortBy: 'date_desc',
  })
  const selectedHand = ref(null)
  const selectedTournament = ref(null)
  const tournamentHands = ref([])

  const loadTournaments = async () => {
    isLoading.value = true

    const filterStore = useFilterStore()
    const heroName = filterStore.heroName
    const buyIn = filterStore.buyIn
    const { getDateRangeParams } = filterStore
    const { dateFrom, dateTo } = getDateRangeParams()
    const buyInParam = buyIn === 'all' ? null : Number(buyIn)

    try {
      const result = await ipcService.getTournaments({
        page: currentPage.value,
        limit: pageSize.value,
        heroName: heroName,
        sortBy: filters.value.sortBy,
        dateFrom,
        dateTo,
        buyIn: buyInParam,
        result: filters.value.result,
        minPot: filters.value.minPot,
        maxPot: filters.value.maxPot,
      })

      if (result && result.success && result.data) {
        tournaments.value = result.data.tournaments || []
        totalTournaments.value = result.data.total || 0
      }
      isLoading.value = false
      return result
    } catch (error) {
      console.error('Failed to load tournaments:', error)
      isLoading.value = false
      return { success: false, error }
    }
  }

  const loadTournamentHands = async (gameId) => {
    isLoadingHands.value = true
    try {
      const filterStore = useFilterStore()
      const heroName = filterStore.heroName
      const result = await ipcService.getTournamentHands(gameId, heroName)
      if (result && result.success) {
        tournamentHands.value = result.data || []
      }
      isLoadingHands.value = false
      return result
    } catch (error) {
      isLoadingHands.value = false
      console.error('Failed to load tournament hands:', error)
      return { success: false, error }
    }
  }

  const setPage = (page) => {
    currentPage.value = page
    loadTournaments()
  }

  const setSortBy = (sortBy) => {
    filters.value.sortBy = sortBy
    currentPage.value = 1
    loadTournaments()
  }

  const setFilters = (updates) => {
    filters.value = { ...filters.value, ...updates }
    currentPage.value = 1
    loadTournaments()
  }

  const selectHand = async (handId) => {
    if (!handId) {
      selectedHand.value = null
      return { success: true }
    }

    isLoadingHand.value = true
    selectedHand.value = null
    try {
      const filterStore = useFilterStore()
      const heroName = filterStore.heroName
      const result = await ipcService.getHandDetails(handId, heroName)
      if (result.success) {
        selectedHand.value = result.data
      }
      isLoadingHand.value = false
      return result
    } catch (error) {
      isLoadingHand.value = false
      console.error('Failed to load hand details:', error)
      return { success: false, error }
    }
  }

  const selectTournament = (tournament) => {
    selectedTournament.value = tournament
    if (tournament) {
      loadTournamentHands(tournament.gameId || tournament.GameId)
    } else {
      tournamentHands.value = []
    }
  }

  const clearSelection = () => {
    selectedHand.value = null
    selectedTournament.value = null
    tournamentHands.value = []
  }

  return {
    hands,
    tournaments,
    totalTournaments,
    totalHands,
    isLoading,
    isLoadingHands,
    isLoadingHand,
    currentPage,
    pageSize,
    filters,
    selectedHand,
    selectedTournament,
    tournamentHands,
    loadTournaments,
    loadTournamentHands,
    setPage,
    setSortBy,
    setFilters,
    selectHand,
    selectTournament,
    clearSelection
  }
})
