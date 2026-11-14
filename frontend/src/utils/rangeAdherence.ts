/** Shapes and helpers of the "respect de ta range" screen. A deviation is never an "error". */

import { textColor, type HandMap, type RangeAction } from '@/utils/ranges'

export type AdherencePeriod = '7' | '30' | 'all'

export interface TopDeviation {
  expectedActionId: number
  playedImmediate: string
  playedActionId: number | null
  playedResponse: string | null
  kind: 'immediate' | 'size' | 'response' | null
  count: number
}

export interface ScenarioRow {
  scenarioId: number
  spotId: number
  name: string
  format: 'hu' | '3max'
  heroPosition: string
  line: string
  opponent: string
  stackBb: number
  decisions: number
  matches: number
  respect: number
  evMatch: number | null
  evDeviation: number | null
  topDeviation: TopDeviation | null
}

export interface FrequentLine {
  format: 'hu' | '3max'
  heroPosition: 'BTN' | 'SB' | 'BB'
  line: string
  count: number
}

export interface AdherenceSummary {
  compared: number
  matches: number
  deviations: number
  responseDeviations: number
  noRange: number
  respect: number | null
  noRangeShare: number | null
  frequentLines: FrequentLine[]
  scenarios: ScenarioRow[]
}

export interface DeviationEntry {
  handId: string
  playedAt: string | null
  cards: string | null
  handClass: string
  expectedActionId: number | null
  playedImmediate: string
  playedActionId: number | null
  playedResponse: string | null
  kind: 'immediate' | 'size' | 'response' | null
}

export interface ScenarioDetail {
  scenarioId: number
  spotId: number
  name: string
  stackBb: number
  observedMinBb: number | null
  observedMaxBb: number | null
  hands: HandMap
  handStats: Record<string, { matches: number; deviations: number }>
  deviations: DeviationEntry[]
  deviationTotal: number
}

export type SortKey = 'name' | 'decisions' | 'respect' | 'evMatch' | 'evDeviation'

/** The table sorted by a column; names sort alphabetically, figures from the highest. */
export function sortScenarios(rows: readonly ScenarioRow[], key: SortKey, descending = true): ScenarioRow[] {
  const direction = descending ? -1 : 1
  const value = (row: ScenarioRow): number | string => {
    switch (key) {
      case 'name':
        return row.name.toLowerCase()
      case 'decisions':
        return row.decisions
      case 'respect':
        return row.respect
      case 'evMatch':
        return row.evMatch ?? Number.NEGATIVE_INFINITY
      default:
        return row.evDeviation ?? Number.NEGATIVE_INFINITY
    }
  }
  return [...rows].sort((a, b) => {
    const [x, y] = [value(a), value(b)]
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y) * direction
    return ((x as number) - (y as number)) * direction || a.name.localeCompare(b.name)
  })
}

/** First day of a period as "YYYY-MM-DD"; `null` for all time. */
export function periodStart(period: AdherencePeriod, now: Date): string | null {
  if (period === 'all') return null
  const start = new Date(now)
  start.setDate(start.getDate() - Number(period))
  return start.toISOString().slice(0, 10)
}

/** "A♦8♣" from "Ad 8c". */
export function formatCards(cards: string | null): string {
  if (!cards) return ''
  const suits: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
  return cards
    .split(' ')
    .filter(Boolean)
    .map((card) => `${card[0]}${suits[card[1]?.toLowerCase()] ?? card[1] ?? ''}`)
    .join('')
}

/** A signed figure in big blinds: "+0,21 bb". */
export function formatEv(value: number | null, language: string): string {
  if (value === null) return '–'
  const text = new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(value)
  return `${text} bb`
}

/** Cells of the scenario grid: the range's colours, dimmed where nothing deviated. */
export function deviationCells(
  detail: Pick<ScenarioDetail, 'hands' | 'handStats'>,
  actions: readonly RangeAction[],
): Record<string, { color: string; textColor: string; dim?: boolean; outline?: 'deviation'; badge?: number }> {
  const byId = new Map(actions.map((a) => [a.id, a]))
  const out: Record<string, { color: string; textColor: string; dim?: boolean; outline?: 'deviation'; badge?: number }> = {}
  for (const [hand, actionId] of Object.entries(detail.hands)) {
    const action = byId.get(actionId)
    if (!action) continue
    const deviations = detail.handStats[hand]?.deviations ?? 0
    out[hand] = deviations > 0
      ? { color: action.color, textColor: textColor(action.color), outline: 'deviation', badge: deviations }
      : { color: action.color, textColor: textColor(action.color), dim: true }
  }
  return out
}
