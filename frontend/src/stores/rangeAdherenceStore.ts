import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import type { DateRangeParams } from '@/stores/filterStore'
import type { AdherenceSummary, OpponentFilter, ScenarioDetail } from '@/utils/rangeAdherence'
import { logError } from '@/utils/log'

interface RangeAdherenceState {
  /** The period of the last read: the app's global date filter. */
  range: DateRangeParams
  /** Fish, regulars or both: the opponent filter of the report. */
  opponent: OpponentFilter
  summary: AdherenceSummary | null
  selectedScenarioId: number | null
  detail: ScenarioDetail | null
  loading: boolean
  /** The scenario detail is being read (the summary is already there). */
  detailLoading: boolean
  /** The last summary read failed. */
  failed: boolean
  /** Reads the summary of `heroName` over `range`, then the selected scenario. */
  load: (heroName: string | null, range: DateRangeParams) => Promise<void>
  select: (scenarioId: number | null, heroName: string | null) => Promise<void>
  setOpponent: (opponent: OpponentFilter) => void
}

// Only the answer to the latest request is kept: a slow older one must not overwrite it.
let summaryRequest = 0
let detailRequest = 0

export const useRangeAdherenceStore = create<RangeAdherenceState>((set, get) => {
  const loadDetail = async (heroName: string, scenarioId: number | null) => {
    const request = ++detailRequest
    if (scenarioId === null) return set({ detail: null, detailLoading: false })
    const { dateFrom, dateTo } = get().range
    set({ detailLoading: true })
    try {
      const result = await ipcService.getRangeAdherenceScenario(scenarioId, heroName, dateFrom, dateTo)
      if (request === detailRequest) set({ detail: result.success ? (result.data as ScenarioDetail) : null })
    } catch (error) {
      logError('Failed to load the range detail:', error)
    } finally {
      if (request === detailRequest) set({ detailLoading: false })
    }
  }

  return {
    range: { dateFrom: null, dateTo: null },
    opponent: 'all',
    summary: null,
    selectedScenarioId: null,
    detail: null,
    loading: false,
    detailLoading: false,
    failed: false,

    load: async (heroName, range) => {
      const request = ++summaryRequest
      set({ range })
      if (!heroName) return set({ summary: null, detail: null, selectedScenarioId: null })
      set({ loading: true, failed: false })
      try {
        const result = await ipcService.getRangeAdherence(heroName, range.dateFrom, range.dateTo, get().opponent === 'all' ? null : get().opponent)
        if (request !== summaryRequest) return
        const summary = result.success ? (result.data as AdherenceSummary) : null
        if (!result.success) set({ failed: true })
        const current = get().selectedScenarioId
        const keep = summary?.scenarios.find((s) => s.scenarioId === current)
        const selected = keep?.scenarioId ?? summary?.scenarios[0]?.scenarioId ?? null
        set({ summary, selectedScenarioId: selected })
        await loadDetail(heroName, selected)
      } catch (error) {
        logError('Failed to load the range adherence:', error)
        if (request === summaryRequest) set({ failed: true })
      } finally {
        if (request === summaryRequest) set({ loading: false })
      }
    },

    setOpponent: (opponent) => set({ opponent }),

    select: async (scenarioId, heroName) => {
      set({ selectedScenarioId: scenarioId })
      if (heroName) await loadDetail(heroName, scenarioId)
    },
  }
})
