/** The onboarding of "My ranges": its steps, the demo grid and the example ranges. */

import { HAND_CLASSES, RANKS } from '@/utils/ranges'

export const TOUR_STEPS = ['layout', 'palette', 'paint', 'scenarios', 'organize', 'adherence', 'training', 'review', 'start'] as const
export type TourStep = (typeof TOUR_STEPS)[number]

const TOUR_STORAGE_KEY = 'spintracker.rangesTourSeen'

/** Whether the player already went through (or skipped) the tour. Unreadable storage counts as seen. */
export function isTourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) !== null
  } catch {
    return true
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, '1')
  } catch {
    // Without storage the tour is only offered again on the next visit.
  }
}

const rankIndex = (rank: string) => RANKS.indexOf(rank as (typeof RANKS)[number])

/**
 * Expands a shorthand token into hand classes: `77+` (pairs up), `A2s+` / `K9o+` (the kicker goes up
 * to just below the first card) or a single class such as `76s`.
 */
export function expandToken(token: string): string[] {
  const plus = token.endsWith('+')
  const body = plus ? token.slice(0, -1) : token
  if (!plus) return [body]
  const [first, second] = [body[0], body[1]]
  if (first === second) return RANKS.slice(0, rankIndex(first) + 1).map((r) => r + r)
  const suffix = body.slice(2)
  return RANKS.slice(rankIndex(first) + 1, rankIndex(second) + 1).map((r) => first + r + suffix)
}

export function expandTokens(tokens: readonly string[]): string[] {
  return [...new Set(tokens.flatMap(expandToken))]
}

/** Hands of the practice grid, planted so the player has something to build on. */
export const DEMO_START: readonly string[] = expandTokens(['QQ+', 'AKs', 'AKo'])
export const DEMO_TARGET_COUNT = 12

export type DemoAction = 'shove' | 'fold'

export const DEMO_COLORS: Record<DemoAction, string> = { shove: '#ff6b5b', fold: '#2a2f39' }

/** The practice grid as cell colours; hands without an action keep the neutral cell. */
export function demoCells(hands: Readonly<Record<string, DemoAction>>, textFor: (color: string) => string) {
  return Object.fromEntries(Object.entries(hands).map(([hand, action]) => [hand, { color: DEMO_COLORS[action], textColor: textFor(DEMO_COLORS[action]) }]))
}

type ExampleLabel = 'Fold' | 'Check' | 'Limp' | 'Call' | 'Open 2bb' | 'Raise 3bb' | 'Shove'

/** Tokens painted with one action; later fills override earlier ones. */
type Fill = readonly [ExampleLabel, readonly string[]]

interface ExampleScenario {
  stackBb: number
  fills: readonly Fill[]
}

interface ExampleSpot {
  name: string
  hero: 'BTN' | 'SB' | 'BB'
  line: string
  /** The action every hand starts with before the fills are applied. */
  base: ExampleLabel
  scenarios: readonly ExampleScenario[]
}

const BTN_SHOVE_8 = ['22+', 'A2s+', 'A2o+', 'K2s+', 'K5o+', 'Q4s+', 'Q8o+', 'J6s+', 'J8o+', 'T6s+', 'T8o+', '96s+', '98o', '86s+', '75s+', '65s', '54s']
const BTN_SHOVE_12 = ['22+', 'A2s+', 'A4o+', 'K6s+', 'K9o+', 'Q8s+', 'QTo+', 'J8s+', 'JTo', 'T8s+', '98s', '87s', '76s']
const SB_SHOVE_8 = ['22+', 'A2s+', 'A2o+', 'K2s+', 'K2o+', 'Q2s+', 'Q5o+', 'J3s+', 'J7o+', 'T5s+', 'T7o+', '95s+', '97o+', '85s+', '87o', '74s+', '64s+', '54s']

/**
 * Illustrative Spin & Go shapes (3-max, short stacks), written by hand: approximate, never a
 * recommendation. The player is expected to rewrite them with their own strategy.
 */
const EXAMPLE_SPOTS: readonly ExampleSpot[] = [
  {
    name: 'Example · BTN first in',
    hero: 'BTN',
    line: '',
    base: 'Fold',
    scenarios: [
      { stackBb: 8, fills: [['Shove', BTN_SHOVE_8]] },
      { stackBb: 12, fills: [['Shove', BTN_SHOVE_12]] },
      {
        stackBb: 20,
        fills: [
          ['Open 2bb', ['22+', 'A2s+', 'A7o+', 'K7s+', 'KTo+', 'Q9s+', 'QTo+', 'J9s+', 'T9s', '98s', '87s', '76s']],
          ['Shove', ['99+', 'AJs+', 'AQo+']],
        ],
      },
    ],
  },
  {
    name: 'Example · SB first in',
    hero: 'SB',
    line: 'btn:fold',
    base: 'Fold',
    scenarios: [
      { stackBb: 8, fills: [['Shove', SB_SHOVE_8]] },
      {
        stackBb: 15,
        fills: [
          ['Limp', ['22+', 'A2s+', 'A2o+', 'K4s+', 'K8o+', 'Q6s+', 'Q9o+', 'J7s+', 'J9o+', 'T7s+', 'T9o', '97s+', '86s+', '76s', '65s']],
          ['Shove', ['55+', 'A8s+', 'ATo+', 'KTs+', 'KQo']],
        ],
      },
    ],
  },
  {
    name: 'Example · BB vs BTN shove',
    hero: 'BB',
    line: 'btn:all-in,sb:fold',
    base: 'Fold',
    scenarios: [
      { stackBb: 8, fills: [['Call', ['22+', 'A2s+', 'A5o+', 'K7s+', 'KTo+', 'Q9s+', 'QJo', 'J9s+', 'T9s']]] },
      { stackBb: 12, fills: [['Call', ['44+', 'A4s+', 'A9o+', 'K9s+', 'KQo', 'QTs+', 'JTs']]] },
    ],
  },
  {
    name: 'Example · SB vs BTN shove',
    hero: 'SB',
    line: 'btn:all-in',
    base: 'Fold',
    scenarios: [{ stackBb: 8, fills: [['Call', ['44+', 'A5s+', 'ATo+', 'KTs+', 'KQo', 'QJs']]] }],
  },
  {
    name: 'Example · BB vs SB shove',
    hero: 'BB',
    line: 'btn:fold,sb:all-in',
    base: 'Fold',
    scenarios: [{ stackBb: 8, fills: [['Call', ['22+', 'A2s+', 'A2o+', 'K2s+', 'K6o+', 'Q5s+', 'Q9o+', 'J7s+', 'J9o+', 'T7s+', 'T9o', '97s+', '87s', '76s']]] }],
  },
  {
    name: 'Example · BB vs BTN open',
    hero: 'BB',
    line: 'btn:raise,sb:fold',
    base: 'Fold',
    scenarios: [
      {
        stackBb: 20,
        fills: [
          ['Call', ['22+', 'A2s+', 'A8o+', 'K8s+', 'KTo+', 'Q9s+', 'J9s+', 'T9s', '98s', '87s', '76s']],
          ['Shove', ['JJ+', 'AQs+', 'AKo']],
        ],
      },
    ],
  },
  {
    name: 'Example · BB vs SB limp',
    hero: 'BB',
    line: 'btn:fold,sb:call',
    base: 'Check',
    scenarios: [
      {
        stackBb: 15,
        fills: [
          ['Raise 3bb', ['55+', 'A2s+', 'A9o+', 'KTs+', 'KQo', 'QJs']],
          ['Shove', ['99+', 'AJs+', 'AQo+']],
        ],
      },
    ],
  },
]

const EXAMPLE_ACTIONS = [
  { label: 'Fold', color: DEMO_COLORS.fold, immediate: 'fold', sizeValue: null, sizeUnit: null, response: 'none' },
  { label: 'Check', color: '#6b7280', immediate: 'check', sizeValue: null, sizeUnit: null, response: 'none' },
  { label: 'Limp', color: '#8e6bd8', immediate: 'limp', sizeValue: null, sizeUnit: null, response: 'none' },
  { label: 'Call', color: '#4caf50', immediate: 'call', sizeValue: null, sizeUnit: null, response: 'none' },
  { label: 'Open 2bb', color: '#5b8def', immediate: 'raise', sizeValue: 2, sizeUnit: 'bb', response: 'fold' },
  { label: 'Raise 3bb', color: '#2fb5c4', immediate: 'raise', sizeValue: 3, sizeUnit: 'bb', response: 'fold' },
  { label: 'Shove', color: DEMO_COLORS.shove, immediate: 'allin', sizeValue: null, sizeUnit: null, response: 'none' },
]

function handsOf(spot: ExampleSpot, scenario: ExampleScenario): Record<string, ExampleLabel> {
  const hands: Record<string, ExampleLabel> = Object.fromEntries(HAND_CLASSES.map((hand) => [hand, spot.base]))
  for (const [label, tokens] of scenario.fills) for (const hand of expandTokens(tokens)) hands[hand] = label
  return hands
}

/** The example ranges as an import file (`spintracker-ranges` v1), ready for the merge import. */
export function exampleRangesFile(): string {
  const spots = EXAMPLE_SPOTS.map((spot) => ({
    name: spot.name,
    format: '3max',
    heroPosition: spot.hero,
    line: spot.line,
    lineSizes: null,
    opponent: 'any',
    studyOnly: false,
    scenarios: spot.scenarios.map((scenario) => ({ stackBb: scenario.stackBb, hands: handsOf(spot, scenario) })),
  }))
  return JSON.stringify({ format: 'spintracker-ranges', version: 1, actions: EXAMPLE_ACTIONS, spots })
}

export const EXAMPLE_SPOT_COUNT = EXAMPLE_SPOTS.length
export const EXAMPLE_SCENARIO_COUNT = EXAMPLE_SPOTS.reduce((sum, spot) => sum + spot.scenarios.length, 0)
