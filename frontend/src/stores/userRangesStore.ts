import { create } from 'zustand'
import { ipcService, type ApiResult, type Json } from '@/services/ipcService'
import type { HandMap, ProgramSummary, RangeAction, SpotSummary } from '@/utils/ranges'

export interface RangeSettings {
  defaultStacks: number[]
  depthRule: 'nearest' | 'below'
  newCardsPerDay: number
  prioritizeBorderline: boolean
}

export interface ImportReport {
  actions: number
  spots: number
  scenarios: number
  programs: number
  warnings: string[]
}

/** The result of a change: an error message (or null) plus what the backend returned. */
export interface Outcome<T = undefined> {
  error: string | null
  /** The spot that clashes with the change, when the backend names one. */
  existingId?: number
  value?: T
}

const DEFAULT_SETTINGS: RangeSettings = { defaultStacks: [25, 20, 15, 10, 7], depthRule: 'nearest', newCardsPerDay: 20, prioritizeBorderline: true }

function outcome<T = undefined>(result: ApiResult<Json>, pick?: (data: Json) => T): Outcome<T> {
  if (!result.success) {
    return { error: result.error ?? result.message ?? 'error', existingId: typeof result.existingId === 'number' ? result.existingId : undefined }
  }
  return { error: null, value: pick ? pick(result.data) : undefined }
}

interface UserRangesState {
  actions: RangeAction[]
  spots: SpotSummary[]
  programs: ProgramSummary[]
  settings: RangeSettings
  loaded: boolean
  /** The program the tree is filtered by; null shows every scenario. */
  programFilter: number | null
  selectedSpotId: number | null
  selectedScenarioId: number | null
  load: () => Promise<void>
  select: (spotId: number | null, scenarioId?: number | null) => void
  setProgramFilter: (id: number | null) => void

  saveSpot: (spot: Json) => Promise<Outcome<number>>
  deleteSpot: (id: number) => Promise<Outcome>
  duplicateSpot: (id: number, opponent?: string) => Promise<Outcome<number>>
  addDepth: (spotId: number, stackBb: number, start: Json) => Promise<Outcome<number>>
  removeDepth: (scenarioId: number) => Promise<Outcome>
  loadScenario: (id: number) => Promise<HandMap | null>
  saveHands: (scenarioId: number, hands: HandMap) => Promise<Outcome>

  saveActions: (actions: Json[]) => Promise<Outcome>
  deleteAction: (id: number, replaceWith: number | null) => Promise<Outcome>
  saveProgram: (program: Json) => Promise<Outcome<number>>
  deleteProgram: (id: number) => Promise<Outcome>
  saveSettings: (patch: Partial<RangeSettings>) => Promise<Outcome>
  /** Without ids every depth is exported. */
  exportRanges: (scenarioIds?: readonly number[]) => Promise<Outcome<string>>
  /** A dry run only reports what the import would do. */
  importRanges: (content: string, mode: 'replace' | 'merge', dryRun?: boolean) => Promise<Outcome<ImportReport>>
}

export const useUserRangesStore = create<UserRangesState>((set, get) => {
  /** Runs a change, then reloads what it may have touched. */
  const change = async <T = undefined>(run: () => Promise<ApiResult<Json>>, pick?: (data: Json) => T): Promise<Outcome<T>> => {
    const result = outcome(await run(), pick)
    if (!result.error) await get().load()
    return result
  }

  return {
    actions: [],
    spots: [],
    programs: [],
    settings: DEFAULT_SETTINGS,
    loaded: false,
    programFilter: null,
    selectedSpotId: null,
    selectedScenarioId: null,

    load: async () => {
      const [tree, actions, settings] = await Promise.all([ipcService.getRangesTree(), ipcService.getRangeActions(), ipcService.getRangeSettings()])
      const spots: SpotSummary[] = tree.success ? (tree.data.spots as SpotSummary[]) : get().spots
      const programs: ProgramSummary[] = tree.success ? (tree.data.programs as ProgramSummary[]) : get().programs
      set((state) => {
        const spot = spots.find((s) => s.id === state.selectedSpotId) ?? spots[0] ?? null
        const scenario = spot?.scenarios.find((s) => s.id === state.selectedScenarioId) ?? spot?.scenarios[0] ?? null
        return {
          spots,
          programs,
          actions: actions.success ? (actions.data as RangeAction[]) : state.actions,
          settings: settings.success ? { ...DEFAULT_SETTINGS, ...(settings.data as RangeSettings) } : state.settings,
          loaded: true,
          selectedSpotId: spot?.id ?? null,
          selectedScenarioId: scenario?.id ?? null,
          programFilter: programs.some((p) => p.id === state.programFilter) ? state.programFilter : null,
        }
      })
    },

    select: (spotId, scenarioId) => {
      const spot = get().spots.find((s) => s.id === spotId)
      const scenario = spot?.scenarios.find((s) => s.id === scenarioId) ?? spot?.scenarios[0]
      set({ selectedSpotId: spotId, selectedScenarioId: scenario?.id ?? null })
    },

    setProgramFilter: (id) => set({ programFilter: id }),

    saveSpot: async (spot) => {
      const result = await change(() => ipcService.saveRangeSpot(spot), (data) => data.id as number)
      if (!result.error && result.value !== undefined) get().select(result.value)
      return result
    },
    deleteSpot: (id) => change(() => ipcService.deleteRangeSpot(id)),
    duplicateSpot: async (id, opponent) => {
      const result = await change(() => ipcService.duplicateRangeSpot(id, opponent), (data) => data.id as number)
      if (!result.error && result.value !== undefined) get().select(result.value)
      return result
    },
    addDepth: (spotId, stackBb, start) => change(() => ipcService.addRangeDepth(spotId, stackBb, start), (data) => data.id as number),
    removeDepth: (scenarioId) => change(() => ipcService.removeRangeDepth(scenarioId)),

    loadScenario: async (id) => {
      const result = await ipcService.getRangeScenario(id)
      return result.success ? (result.data.hands as HandMap) : null
    },
    saveHands: async (scenarioId, hands) => {
      const result = outcome(await ipcService.saveRangeHands(scenarioId, hands))
      if (!result.error) await get().load()
      return result
    },

    saveActions: (actions) => change(() => ipcService.saveRangeActions(actions)),
    deleteAction: (id, replaceWith) => change(() => ipcService.deleteRangeAction(id, replaceWith)),
    saveProgram: (program) => change(() => ipcService.saveRangeProgram(program), (data) => data.id as number),
    deleteProgram: (id) => change(() => ipcService.deleteRangeProgram(id)),
    saveSettings: (patch) => change(() => ipcService.saveRangeSettings(patch)),

    exportRanges: async (scenarioIds) => outcome(await ipcService.exportRanges(scenarioIds), (data) => JSON.stringify(data, null, 2)),
    importRanges: async (content, mode, dryRun = false) => {
      if (dryRun) return outcome(await ipcService.importRanges(content, mode, true), (data) => data as ImportReport)
      return change(() => ipcService.importRanges(content, mode), (data) => data as ImportReport)
    },
  }
})
