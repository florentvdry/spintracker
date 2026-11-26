import { useEffect, useState } from 'react'
import { ipcService, type Json } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import { logError } from '@/utils/log'

const FETCH_DEBOUNCE_MS = 300

export type BadBeatMode = 'elimination' | 'big_pot'

export interface BadBeatSettings {
  following: number
  minEquityPercent: number
  mode: BadBeatMode
}

export interface CevBucket {
  hands: number
  tournaments: number
  ev: number
}

export interface CevBreakdown {
  by_composition: Record<string, CevBucket>
  by_multiplier: { multiplier: number; tournaments: number; ev: number }[]
  by_session_progress: { from: number; to: number | null; tournaments: number; ev: number }[]
  after_bad_beat: { bad_beats: number; tournaments_after: number; ev_after: number; avg_after: number; avg_all: number }
}

/** Chip EV breakdowns for the hero and the filters selected, recomputed by the backend. */
export function useCevBreakdown(badBeat: BadBeatSettings): { data: CevBreakdown | null; isLoading: boolean } {
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const buyIn = useFilterStore((s) => s.buyIn)
  const customDateFrom = useFilterStore((s) => s.customDateFrom)
  const customDateTo = useFilterStore((s) => s.customDateTo)
  const lastUpdate = useAppStore((s) => s.lastUpdate)
  const [data, setData] = useState<CevBreakdown | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { following, minEquityPercent, mode } = badBeat

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const timer = setTimeout(async () => {
      try {
        const { dateFrom, dateTo } = currentDateRange()
        const res = await ipcService.getCevBreakdown({
          heroName, dateFrom, dateTo, buyIn: buyInParam(buyIn), following, minEquityPercent, mode,
        })
        if (!cancelled) setData(res.success ? (res.data as Json as CevBreakdown) : null)
      } catch (error) {
        logError('Failed to fetch the CEV breakdown:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }, FETCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [heroName, dateRange, selectedSession, customDateFrom, customDateTo, buyIn, lastUpdate, following, minEquityPercent, mode])

  return { data, isLoading }
}
