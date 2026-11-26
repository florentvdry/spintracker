import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import { logError } from '@/utils/log'

export interface QueuedHand {
  handId: string
  box: number
  dueOn: string
  dueNow: boolean
  addedOn: string
  note: string
  playedAt: string | null
  room: string | null
  blinds: string | null
  cards: string | null
  profitChips: number
}

interface ReviewQueueState {
  items: QueuedHand[]
  due: number
  loaded: boolean
  /** The hero of the last read, so a change of the queue reads it again for the same player. */
  heroName: string | null
  load: (heroName: string | null) => Promise<void>
  /** Ids of the marked hands, to show which buttons are on. */
  markedIds: Set<string>
  mark: (handId: string, note?: string) => Promise<boolean>
  unmark: (handId: string) => Promise<boolean>
  answer: (handId: string, correct: boolean) => Promise<boolean>
}

export const useReviewQueueStore = create<ReviewQueueState>((set, get) => ({
  items: [],
  due: 0,
  loaded: false,
  heroName: null,
  markedIds: new Set(),

  load: async (heroName) => {
    try {
      const result = await ipcService.getReviewQueue(heroName)
      if (!result.success) return
      const items = (result.data?.items ?? []) as QueuedHand[]
      set({ heroName, items, due: result.data?.due ?? 0, loaded: true, markedIds: new Set(items.map((i) => i.handId)) })
    } catch (error) {
      logError('Failed to load the review queue:', error)
    }
  },

  mark: async (handId, note = '') => {
    try {
      const result = await ipcService.markHandForReview(handId, note)
      if (result.success) set((state) => ({ markedIds: new Set(state.markedIds).add(handId) }))
      return result.success
    } catch (error) {
      logError('Failed to mark the hand:', error)
      return false
    }
  },

  unmark: async (handId) => {
    try {
      const result = await ipcService.unmarkHandForReview(handId)
      if (result.success) {
        set((state) => {
          const markedIds = new Set(state.markedIds)
          markedIds.delete(handId)
          return { markedIds, items: state.items.filter((i) => i.handId !== handId) }
        })
      }
      return result.success
    } catch (error) {
      logError('Failed to unmark the hand:', error)
      return false
    }
  },

  answer: async (handId, correct) => {
    try {
      const result = await ipcService.answerHandReview(handId, correct)
      return result.success
    } catch (error) {
      logError('Failed to record the review:', error)
      return false
    } finally {
      // The order of the queue changed: read it again.
      void get().load(get().heroName)
    }
  },
}))
