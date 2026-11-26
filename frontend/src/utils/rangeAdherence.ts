/** Shapes and helpers of the "respect de ta range" screen. A deviation is never an "error". */

import type { ReactNode } from 'react'
import { textColor, type HandMap, type RangeAction } from '@/utils/ranges'

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

/** Counts of the compared decisions of a group (a side, a position). */
export interface Tally {
  compared: number
  matches: number
  deviations: number
  noRange: number
}

export interface PositionTally extends Tally {
  format: 'hu' | '3max'
  heroPosition: 'BTN' | 'SB' | 'BB'
}

/** Which opponents the report looks at: fish ("any" variant), regulars, or both. */
export type OpponentFilter = 'all' | 'any' | 'reg'

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
  /** Both sides always, whatever the opponent filter. */
  byOpponent: { any: Tally; reg: Tally }
  byPosition: PositionTally[]
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

/** What was played instead of the plan for a hand, and how many times. */
export interface PlayedInstead {
  playedImmediate: string
  playedActionId: number | null
  playedResponse: string | null
  kind: DeviationEntry['kind']
  count: number
}

export interface HandStat {
  matches: number
  deviations: number
  /** The most frequent first; absent in older answers. */
  played?: PlayedInstead[]
}

export interface ScenarioDetail {
  scenarioId: number
  spotId: number
  name: string
  stackBb: number
  observedMinBb: number | null
  observedMaxBb: number | null
  hands: HandMap
  handStats: Record<string, HandStat>
  deviations: DeviationEntry[]
  deviationTotal: number
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

export interface DeviationCell {
  color: string
  textColor: string
  dim?: boolean
  outline?: 'deviation'
  badge?: number
  tip?: ReactNode
}

const NO_STAT: HandStat = { matches: 0, deviations: 0 }

/**
 * Cells of the scenario grid: the range's colours, dimmed where nothing deviated.
 * `tipOf` builds the card shown on hover from the planned action and what was played.
 */
export function deviationCells(
  detail: Pick<ScenarioDetail, 'hands' | 'handStats'>,
  actions: readonly RangeAction[],
  tipOf?: (hand: string, planned: RangeAction, stat: HandStat) => ReactNode,
): Record<string, DeviationCell> {
  const byId = new Map(actions.map((a) => [a.id, a]))
  const out: Record<string, DeviationCell> = {}
  for (const [hand, actionId] of Object.entries(detail.hands)) {
    const action = byId.get(actionId)
    if (!action) continue
    const stat = detail.handStats[hand] ?? NO_STAT
    const tip = tipOf?.(hand, action, stat)
    out[hand] =
      stat.deviations > 0
        ? { color: action.color, textColor: textColor(action.color), outline: 'deviation', badge: stat.deviations, tip }
        : { color: action.color, textColor: textColor(action.color), dim: true, tip }
  }
  return out
}

/** Share of followed decisions; `null` when nothing was compared. */
export function respectOf(tally: Pick<Tally, 'compared' | 'matches'>): number | null {
  return tally.compared > 0 ? tally.matches / tally.compared : null
}

export type RespectTone = 'good' | 'ok' | 'work'

/** Respect at or above this is "good", at or above the next one "ok". */
export const GOOD_RESPECT = 0.9
export const OK_RESPECT = 0.8

export type SortKey = 'name' | 'decisions' | 'respect' | 'deviations'

/** Spots sorted by a column; names alphabetically, figures from the highest (a missing respect last). */
export function sortSpots(spots: readonly SpotReport[], key: SortKey, descending = true): SpotReport[] {
  const direction = descending ? -1 : 1
  const value = (spot: SpotReport): number | string => {
    switch (key) {
      case 'name':
        return spot.name.toLowerCase()
      case 'decisions':
        return spot.decisions
      case 'respect':
        return spot.respect ?? Number.NEGATIVE_INFINITY
      default:
        return spot.deviations
    }
  }
  return [...spots].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y) * direction
    return ((x as number) - (y as number)) * direction || a.name.localeCompare(b.name)
  })
}

/** A position of the table with its spots, in seating order (3-handed first, then heads-up). */
export interface PositionGroup {
  key: string
  format: 'hu' | '3max'
  heroPosition: string
  spots: SpotReport[]
  decisions: number
  matches: number
  respect: number | null
}

const SEAT_ORDER = ['BTN', 'SB', 'BB']

export function groupByPosition(spots: readonly SpotReport[]): PositionGroup[] {
  const groups = new Map<string, PositionGroup>()
  for (const spot of spots) {
    const key = `${spot.format}-${spot.heroPosition}`
    const group = groups.get(key) ?? { key, format: spot.format, heroPosition: spot.heroPosition, spots: [], decisions: 0, matches: 0, respect: null }
    group.spots.push(spot)
    group.decisions += spot.decisions
    group.matches += spot.matches
    groups.set(key, group)
  }
  const rank = (g: PositionGroup) => (g.format === 'hu' ? SEAT_ORDER.length : 0) + SEAT_ORDER.indexOf(g.heroPosition)
  return [...groups.values()].map((g) => ({ ...g, respect: respectOf({ compared: g.decisions, matches: g.matches }) })).sort((a, b) => rank(a) - rank(b))
}

/** Colours of the tones, shared by the rings, the bars and the big figure. */
export const RESPECT_COLORS: Record<RespectTone, string> = { good: '#2fd45a', ok: '#a6c93a', work: '#e8962d' }

export function respectTone(respect: number): RespectTone {
  if (respect >= GOOD_RESPECT) return 'good'
  return respect >= OK_RESPECT ? 'ok' : 'work'
}

/** Below this many decisions a percentage moves by several points with a few hands. */
export const MIN_RELIABLE_DECISIONS = 300

export function isReliable(decisions: number): boolean {
  return decisions >= MIN_RELIABLE_DECISIONS
}

/** A situation with all its depths: the "per range" line of the report. */
export interface SpotReport {
  spotId: number
  name: string
  format: 'hu' | '3max'
  heroPosition: string
  line: string
  opponent: string
  decisions: number
  matches: number
  deviations: number
  respect: number | null
  /** Deepest first. */
  depths: ScenarioRow[]
}

/** Scenarios grouped by spot, the one with the most deviations first. */
export function groupBySpot(scenarios: readonly ScenarioRow[]): SpotReport[] {
  const spots = new Map<number, SpotReport>()
  for (const row of scenarios) {
    const spot =
      spots.get(row.spotId) ??
      ({ spotId: row.spotId, name: row.name, format: row.format, heroPosition: row.heroPosition, line: row.line, opponent: row.opponent, decisions: 0, matches: 0, deviations: 0, respect: null, depths: [] } satisfies SpotReport)
    spot.decisions += row.decisions
    spot.matches += row.matches
    spot.deviations += row.decisions - row.matches
    spot.depths.push(row)
    spots.set(row.spotId, spot)
  }
  return [...spots.values()]
    .map((spot) => ({ ...spot, respect: respectOf({ compared: spot.decisions, matches: spot.matches }), depths: [...spot.depths].sort((a, b) => b.stackBb - a.stackBb) }))
    .sort((a, b) => b.deviations - a.deviations || a.name.localeCompare(b.name))
}

/** One line of the deviation list: a hand class, what the range plans and what was played instead. */
export interface DeviationRow {
  hand: string
  plannedActionId: number
  playedImmediate: string
  playedActionId: number | null
  playedResponse: string | null
  kind: PlayedInstead['kind']
  count: number
}

/** Deviations of a scenario grouped by hand class and played action, the most frequent first. */
export function deviationRows(detail: Pick<ScenarioDetail, 'hands' | 'handStats'>): DeviationRow[] {
  const rows: DeviationRow[] = []
  for (const [hand, stat] of Object.entries(detail.handStats)) {
    const planned = detail.hands[hand]
    if (planned === undefined) continue
    for (const played of stat.played ?? []) {
      rows.push({
        hand,
        plannedActionId: planned,
        playedImmediate: played.playedImmediate,
        playedActionId: played.playedActionId,
        playedResponse: played.playedResponse,
        kind: played.kind,
        count: played.count,
      })
    }
  }
  return rows.sort((a, b) => b.count - a.count || a.hand.localeCompare(b.hand))
}
