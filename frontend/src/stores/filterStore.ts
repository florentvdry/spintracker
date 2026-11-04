import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ipcService, type Json } from '@/services/ipcService'

export type DateRange = 'all' | 'today' | 'week' | 'month' | 'custom' | 'session'

export interface SessionFilter {
  session_date: string
  session_end: string
  [key: string]: Json
}

interface FilterState {
  heroName: string | null
  aliases: Json[]
  dateRange: DateRange
  customDateFrom: string | null
  customDateTo: string | null
  selectedSession: SessionFilter | null
  buyIn: string | number
  position: string
  result: string
  hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
  setHeroName: (name: string | null) => void
  setDateRange: (range: DateRange) => void
  setCustomDateRange: (from: string | null, to: string | null) => void
  setSelectedSession: (session: SessionFilter | null) => void
  setBuyIn: (buyIn: string | number) => void
  setFilters: (updates: Partial<Omit<FilterState, 'aliases' | 'hasHydrated'>>) => void
  resetFilters: () => void
  fetchAliases: () => Promise<void>
}

const pad = (n: number) => n.toString().padStart(2, '0')

/**
 * The backend stores hand times in UTC (as the rooms write them), while the user thinks in local
 * time: a local instant is converted to UTC before being sent as a bound.
 */
function formatDateTime(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateTime(value: string | null): string | null {
  if (!value) return null
  // "2026-05-25" or "2026-05-25T14:30", read as local time.
  const local = new Date(value.includes('T') ? value : `${value}T00:00`)
  return Number.isNaN(local.getTime()) ? null : formatDateTime(local)
}

export interface DateRangeParams {
  dateFrom: string | null
  dateTo: string | null
}

/** Resolves the active date range into the `from`/`to` pair the backend expects. */
export function getDateRangeParams(
  state: Pick<FilterState, 'dateRange' | 'customDateFrom' | 'customDateTo' | 'selectedSession'>,
): DateRangeParams {
  const { dateRange, customDateFrom, customDateTo, selectedSession } = state
  const now = new Date()

  switch (dateRange) {
    case 'today':
      return { dateFrom: formatDateTime(startOfDay(now)), dateTo: null }
    case 'week': {
      const day = now.getDay()
      const monday = new Date(now)
      monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1))
      return { dateFrom: formatDateTime(startOfDay(monday)), dateTo: null }
    }
    case 'month':
      return { dateFrom: formatDateTime(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: null }
    case 'custom':
      return { dateFrom: toDateTime(customDateFrom), dateTo: toDateTime(customDateTo) }
    case 'session':
      return selectedSession
        ? { dateFrom: selectedSession.session_date, dateTo: selectedSession.session_end }
        : { dateFrom: null, dateTo: null }
    default:
      return { dateFrom: null, dateTo: null }
  }
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      heroName: null,
      aliases: [],
      dateRange: 'month',
      customDateFrom: null,
      customDateTo: null,
      selectedSession: null,
      buyIn: 'all',
      position: 'all',
      result: 'all',
      hasHydrated: false,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setHeroName: (heroName) => set({ heroName }),
      setDateRange: (dateRange) =>
        set(
          dateRange !== 'custom' && dateRange !== 'session'
            ? { dateRange, customDateFrom: null, customDateTo: null, selectedSession: null }
            : { dateRange },
        ),
      setCustomDateRange: (customDateFrom, customDateTo) =>
        set({ dateRange: 'custom', customDateFrom, customDateTo, selectedSession: null }),
      setSelectedSession: (session) =>
        set(session === null ? { dateRange: 'all', selectedSession: null } : { dateRange: 'session', selectedSession: session }),
      setBuyIn: (buyIn) => set({ buyIn }),
      setFilters: (updates) => set(updates),
      resetFilters: () =>
        set({
          dateRange: 'all',
          customDateFrom: null,
          customDateTo: null,
          selectedSession: null,
          buyIn: 'all',
          position: 'all',
          result: 'all',
        }),
      fetchAliases: async () => {
        const res = await ipcService.getAliases()
        if (res?.success) set({ aliases: res.data })
      },
    }),
    {
      name: 'poker-filters-storage',
      partialize: (state) => ({
        heroName: state.heroName,
        dateRange: state.dateRange,
        customDateFrom: state.customDateFrom,
        customDateTo: state.customDateTo,
        buyIn: state.buyIn,
        selectedSession: state.selectedSession,
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
)

/** Convenience for non-component code: resolves the current range from the store. */
export function currentDateRange(): DateRangeParams {
  return getDateRangeParams(useFilterStore.getState())
}

export function buyInParam(buyIn: string | number): number | null {
  return buyIn === 'all' ? null : Number(buyIn)
}
