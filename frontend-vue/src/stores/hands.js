import { defineStore } from 'pinia'
import { apiService } from '../services/api'

export const useHandsStore = defineStore('hands', {
  state: () => ({
    hands: [],
    currentHand: null,
    isLoading: false,
    error: null
  }),

  actions: {
    async loadHands(params = {}) {
      this.isLoading = true
      this.error = null
      try {
        const response = await apiService.getHands(params)
        this.hands = response.data
        return this.hands
      } catch (error) {
        this.error = error.message
        return []
      } finally {
        this.isLoading = false
      }
    },

    async loadHandDetails(handId) {
      this.isLoading = true
      this.error = null
      try {
        const response = await apiService.getHandDetails(handId)
        this.currentHand = response.data
        return this.currentHand
      } catch (error) {
        this.error = error.message
        return null
      } finally {
        this.isLoading = false
      }
    }
  }
})
