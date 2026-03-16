import { defineStore } from 'pinia'
import { apiService } from '../services/api'

export const useTournamentsStore = defineStore('tournaments', {
  state: () => ({
    tournaments: [],
    currentTournament: null,
    isLoading: false,
    error: null
  }),

  actions: {
    async loadTournaments(limit = 50) {
      this.isLoading = true
      this.error = null
      try {
        const response = await apiService.getTournaments(limit)
        this.tournaments = response.data
        return this.tournaments
      } catch (error) {
        this.error = error.message
        return []
      } finally {
        this.isLoading = false
      }
    },

    async loadTournament(tournamentId) {
      this.isLoading = true
      this.error = null
      try {
        const response = await apiService.getTournament(tournamentId)
        this.currentTournament = response.data
        return this.currentTournament
      } catch (error) {
        this.error = error.message
        return null
      } finally {
        this.isLoading = false
      }
    }
  }
})
