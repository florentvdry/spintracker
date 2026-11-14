/** Shapes and helpers of the spaced-review screen. */

/** Bar colour of each box, from 1 to 5 (data of the screen, not theme tokens). */
export const BOX_COLORS = ['#ff6b5b', '#f5a524', '#e0c341', '#7fd18f', '#34c27a'] as const
/** Days before a card of each box comes back; box 1 is every day. */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 21] as const
/** Due cards above this count turn amber in the table. */
export const DUE_WARNING_THRESHOLD = 5

export interface ReviewScenario {
  scenarioId: number
  spotId: number
  name: string
  stackBb: number
  cards: number
  mastered: number
  dueToday: number
  lastSession: string | null
}

export interface ReviewProgram {
  id: number
  name: string
  scenarios: number
  cards: number
  mastered: number
}

export interface HardHand {
  scenarioId: number
  handClass: string
  name: string
  stackBb: number
  missed: number
  attempts: number
}

export interface ReviewOverview {
  today: { due: number; newAvailable: number; minutes: number }
  boxes: number[]
  success7: { rate: number | null; answers: number }
  mastered: { count: number; total: number }
  programs: ReviewProgram[]
  scenarios: ReviewScenario[]
  hardest: HardHand[]
  newDeviations: number
}

/** The cards waiting today: due ones plus the new ones the daily quota allows. */
export function cardsToday(overview: Pick<ReviewOverview, 'today'>): number {
  return overview.today.due + overview.today.newAvailable
}

/** Width (0..100) of the bar of a box, relative to the fullest box. */
export function boxBarWidth(count: number, boxes: readonly number[]): number {
  const most = Math.max(0, ...boxes)
  return most === 0 ? 0 : Math.round((count / most) * 100)
}

/** Share of mastered cards (0..100); 0 when there is none. */
export function masteredShare(mastered: number, cards: number): number {
  return cards === 0 ? 0 : Math.round((mastered / cards) * 100)
}

/** The scenarios of a program, or all of them when no program is chosen. */
export function scenariosOf(overview: Pick<ReviewOverview, 'scenarios'>, spotIds: readonly number[] | null): ReviewScenario[] {
  return spotIds === null ? overview.scenarios : overview.scenarios.filter((s) => spotIds.includes(s.spotId))
}

/** A last-session date as a short day; empty for a card never answered. */
export function lastSessionDay(value: string | null): string | null {
  return value ? value.slice(0, 10) : null
}
