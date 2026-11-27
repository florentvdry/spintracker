/** The streets the backend gives an equity for. */
export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export interface PlayerEquities {
  name: string
  isHero: boolean
  equities: Record<Street, number | null>
}

export interface AllInValue {
  name: string
  isHero: boolean
  equity: number
  evBb: number
}

export interface HandEquities {
  handId: string
  players: PlayerEquities[]
  allIn: AllInValue[]
}

const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river']

/** The street of an action as the replay names it ("Preflop", "Flop"...), or null for an unknown one. */
export function streetOf(raw: unknown): Street | null {
  if (typeof raw !== 'string') return null
  const key = raw.toLowerCase()
  return (STREETS as readonly string[]).includes(key) ? (key as Street) : null
}

/** The equity of a player on a street, or null when it is not known yet (cards not seen). */
export function equityAt(player: PlayerEquities | undefined, street: Street): number | null {
  return player?.equities[street] ?? null
}

/** "62 %": the equity, rounded. */
export function formatEquity(value: number): string {
  return `${Math.round(value)} %`
}

/** "+2.5 bb" or "−1.0 bb": the all-in value in big blinds, signed. */
export function formatAllInEv(evBb: number): string {
  const sign = evBb > 0 ? '+' : evBb < 0 ? '−' : ''
  return `${sign}${Math.abs(evBb).toFixed(1)} bb`
}
