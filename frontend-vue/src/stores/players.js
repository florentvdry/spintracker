import { defineStore } from 'pinia'
import { apiService } from '../services/api'

export const usePlayersStore = defineStore('players', {
  state: () => ({
    players: [],
    isLoading: false,
    error: null
  }),

  actions: {
    async loadPlayers(params = {}) {
      this.isLoading = true
      this.error = null
      try {
        const response = await apiService.getPlayers(params)
        this.players = response.data
        return this.players
      } catch (error) {
        this.error = error.message
        return []
      } finally {
        this.isLoading = false
      }
    },

    async updatePlayerRegStatus(playerId, isReg) {
      try {
        await apiService.updatePlayer(playerId, isReg)
        const player = this.players.find(p => p.id === playerId)
        if (player) {
          player.is_reg = isReg
        }
        return true
      } catch (error) {
        this.error = error.message
        return false
      }
    }
  }
})
