import { create } from 'zustand'
import { ipcService, type BackfillProgress, type Json } from '@/services/ipcService'
import { buyInParam, currentDateRange, useFilterStore } from './filterStore'
import { logError } from '@/utils/log'

const HYDRATION_POLL_MS = 50
const HYDRATION_MAX_CHECKS = 40
const BACKEND_POLL_MS = 500
const SESSION_LIMIT = 50

// React StrictMode mounts twice in development; share one in-flight initialization.
let initialization: Promise<void> | null = null
// Only the answer to the latest dashboard request is kept.
let dashboardRequest = 0

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface AppState {
  isLoading: boolean
  isInitialized: boolean
  /** Progress of the statistics update while the backend starts; null otherwise. */
  backfill: BackfillProgress | null
  dashboardStats: Json | null
  sessions: Json[]
  availableBuyIns: number[]
  lastUpdate: number
  error: string | null
  initialize: () => Promise<void>
  runInitialization: () => Promise<void>
  loadDashboardStats: () => Promise<void>
  loadSessions: (limit?: number) => Promise<void>
  loadBuyIns: () => Promise<void>
  refreshAll: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  isLoading: true,
  isInitialized: false,
  backfill: null,
  dashboardStats: null,
  sessions: [],
  availableBuyIns: [],
  lastUpdate: 0,
  error: null,

  initialize: () => {
    initialization ??= get().runInitialization().finally(() => {
      initialization = null
    })
    return initialization
  },

  runInitialization: async () => {
    if (get().isInitialized) return
    set({ isLoading: true, error: null })

    try {
      for (let i = 0; !useFilterStore.getState().hasHydrated && i < HYDRATION_MAX_CHECKS; i++) {
        await sleep(HYDRATION_POLL_MS)
      }

      // The window opens now: opening the database can take long (migration, statistics update
      // after an application update), and the main window explains it instead of the splash.
      await ipcService.appReady()

      const stopListening = ipcService.onBackfillProgress((progress) => set({ backfill: progress }))
      try {
        for (;;) {
          const res = await ipcService.checkServerStatus()
          if (res?.success) break
          if (res?.status === 'error') throw new Error(String(res.message ?? 'The backend failed to start'))
          await sleep(BACKEND_POLL_MS)
        }
      } finally {
        stopListening()
      }

      // The dashboard queries can take long on a large history: the window opens first and the
      // data loads behind a loading state (the filter effect in App calls refreshAll).
      const noHero = !useFilterStore.getState().heroName
      set({ lastUpdate: Date.now(), isInitialized: true, isLoading: !noHero, backfill: null })
      if (noHero) void get().loadBuyIns()
    } catch (err) {
      logError('[Init] Critical failure:', err)
      set({ error: err instanceof Error ? err.message : 'Initialization failed', isLoading: false })
      // Also covers a failure before the window opened: never leave the user on the splash screen.
      await ipcService.appReady()
    }
  },

  loadDashboardStats: async () => {
    const { heroName, buyIn } = useFilterStore.getState()
    const request = ++dashboardRequest
    if (!heroName) return set({ dashboardStats: null })

    const { dateFrom, dateTo } = currentDateRange()
    try {
      const result = await ipcService.getDashboardStats(heroName, dateFrom, dateTo, buyInParam(buyIn))
      if (request === dashboardRequest && result.success) {
        const stats = result.data ?? {}
        set({
          dashboardStats: {
            ...stats,
            total_profit: Number(stats.total_profit) || 0,
            total_hands: Number(stats.total_hands) || 0,
            total_ev: Number(stats.total_ev) || 0,
          },
        })
      }
    } catch (err) {
      logError('Failed to load dashboard stats:', err)
    }
  },

  loadSessions: async (limit = SESSION_LIMIT) => {
    const { heroName, buyIn } = useFilterStore.getState()
    if (!heroName) return set({ sessions: [] })

    try {
      const result = await ipcService.getSessionHistory(limit, heroName, null, null, buyInParam(buyIn))
      if (result.success) set({ sessions: result.data })
    } catch (err) {
      logError('Failed to load sessions:', err)
    }
  },

  loadBuyIns: async () => {
    try {
      const result = await ipcService.getBuyIns()
      if (result.success) set({ availableBuyIns: result.data ?? [] })
    } catch (err) {
      logError('Failed to load buy-ins:', err)
    }
  },

  refreshAll: async () => {
    set({ isLoading: true })
    try {
      await Promise.all([get().loadDashboardStats(), get().loadSessions(SESSION_LIMIT), get().loadBuyIns()])
      set({ lastUpdate: Date.now() })
    } finally {
      set({ isLoading: false })
    }
  },
}))
