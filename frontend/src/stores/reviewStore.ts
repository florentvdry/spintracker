import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import { logError } from '@/utils/log'
import type { ReviewOverview } from '@/utils/review'

interface ReviewState {
  overview: ReviewOverview | null
  loading: boolean
  load: (heroName: string | null) => Promise<void>
}

// Only the answer to the latest request is kept.
let request = 0

export const useReviewStore = create<ReviewState>((set) => ({
  overview: null,
  loading: false,

  load: async (heroName) => {
    const id = ++request
    set({ loading: true })
    try {
      const result = await ipcService.getReview(heroName)
      if (id === request && result.success) set({ overview: result.data as ReviewOverview })
    } catch (error) {
      logError('Failed to load the review:', error)
    } finally {
      if (id === request) set({ loading: false })
    }
  },
}))
