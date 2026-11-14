import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import { periodStart, type AdherencePeriod, type AdherenceSummary, type ScenarioDetail } from '@/utils/rangeAdherence'
import { logError } from '@/utils/log'

interface RangeAdherenceState {
  period: AdherencePeriod
  summary: AdherenceSummary | null
  selectedScenarioId: number | null
  detail: ScenarioDetail | null
  loading: boolean
  /** Reads the summary of `heroName` over the chosen period, then the selected scenario. */
  load: (heroName: string | null) => Promise<void>
  setPeriod: (period: AdherencePeriod) => void
  select: (scenarioId: number | null, heroName: string | null) => Promise<void>
}

// Only the answer to the latest request is kept: a slow older one must not overwrite it.
let summaryRequest = 0
let detailRequest = 0

export const useRangeAdherenceStore = create<RangeAdherenceState>((set, get) => {
  const loadDetail = async (heroName: string, scenarioId: number | null) => {
    const request = ++detailRequest
    if (scenarioId === null) return set({ detail: null })
    const from = periodStart(get().period, new Date())
    try {
      const result = await ipcService.getRangeAdherenceScenario(scenarioId, heroName, from)
      if (request === detailRequest) set({ detail: result.success ? (result.data as ScenarioDetail) : null })
    } catch (error) {
      logError('Failed to load the range detail:', error)
    }
  }

  return {
    period: '30',
    summary: null,
    selectedScenarioId: null,
    detail: null,
    loading: false,

    load: async (heroName) => {
      const request = ++summaryRequest
      if (!heroName) return set({ summary: null, detail: null, selectedScenarioId: null })
      set({ loading: true })
      try {
        const result = await ipcService.getRangeAdherence(heroName, periodStart(get().period, new Date()))
        if (request !== summaryRequest) return
        const summary = result.success ? (result.data as AdherenceSummary) : null
        const current = get().selectedScenarioId
        const keep = summary?.scenarios.find((s) => s.scenarioId === current)
        const selected = keep?.scenarioId ?? summary?.scenarios[0]?.scenarioId ?? null
        set({ summary, selectedScenarioId: selected })
        await loadDetail(heroName, selected)
      } catch (error) {
        logError('Failed to load the range adherence:', error)
      } finally {
        if (request === summaryRequest) set({ loading: false })
      }
    },

    setPeriod: (period) => set({ period }),

    select: async (scenarioId, heroName) => {
      set({ selectedScenarioId: scenarioId })
      if (heroName) await loadDetail(heroName, scenarioId)
    },
  }
})
