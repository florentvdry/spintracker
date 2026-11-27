/** The stats shown beside a replayed hand: the ones every player has, read before the hand. */
export const AT_HAND_STATS = [
  { section: 'preflop', label: 'VPIP' },
  { section: 'preflop', label: 'PFR' },
] as const

export interface StatAtHand {
  num: number | null
  den: number | null
  pct: number | null
}

export interface PlayerStatsAtHand {
  name: string
  hands: number
  stats: StatAtHand[]
}

export interface StatsAtHand {
  handId: string
  players: PlayerStatsAtHand[]
}

/** "32 %", or a dash when nothing was counted. */
export function formatStatPct(pct: number | null): string {
  return pct === null ? '–' : `${Math.round(pct)} %`
}
