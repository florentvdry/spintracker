import { create } from 'zustand'
import { ipcService, type Json } from '@/services/ipcService'
import { buyInParam, currentDateRange, useFilterStore } from './filterStore'

const HYDRATION_POLL_MS = 50
const HYDRATION_MAX_CHECKS = 40
const BACKEND_POLL_MS = 500
const BACKEND_MAX_ATTEMPTS = 120
const SESSION_LIMIT = 50

// React StrictMode mounts twice in development; share one in-flight initialization.
let initialization: Promise<void> | null = null
// Only the answer to the latest dashboard request is kept.
let dashboardRequest = 0

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface AppState {
  isLoading: boolean
  isInitialized: boolean
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

      let backendReady = false
      for (let attempts = 0; !backendReady && attempts < BACKEND_MAX_ATTEMPTS; attempts++) {
        const res = await ipcService.checkServerStatus()
        if (res?.success) backendReady = true
        else await sleep(BACKEND_POLL_MS)
      }
      if (!backendReady) console.warn('[Init] Backend not responding after 60s')

      await get().loadBuyIns()
      await Promise.all([get().loadDashboardStats(), get().loadSessions(SESSION_LIMIT)])
      set({ lastUpdate: Date.now(), isInitialized: true, isLoading: false })

      await ipcService.appReady()
    } catch (err) {
      console.error('[Init] Critical failure:', err)
      set({ error: err instanceof Error ? err.message : 'Initialization failed', isLoading: false })
      // Never leave the user stuck on the splash screen.
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
      console.error('Failed to load dashboard stats:', err)
    }
  },

  loadSessions: async (limit = SESSION_LIMIT) => {
    const { heroName, buyIn } = useFilterStore.getState()
    if (!heroName) return set({ sessions: [] })

    try {
      const result = await ipcService.getSessionHistory(limit, heroName, null, null, buyInParam(buyIn))
      if (result.success) set({ sessions: result.data })
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  },

  loadBuyIns: async () => {
    try {
      const result = await ipcService.getBuyIns()
      if (result.success) set({ availableBuyIns: result.data ?? [] })
    } catch (err) {
      console.error('Failed to load buy-ins:', err)
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
