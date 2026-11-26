import type { Json } from '@/services/ipcService'

/** Equity (0..100) of each player still in the hand, by name. */
export type Equities = Record<string, number>

/**
 * The equities in force once `applied` actions are played: those of the last deal of cards that
 * carries some. `null` before any (a hand with fewer than two known hands has none).
 */
export function equitiesAt(actions: Json[], applied: number): Equities | null {
  for (let i = Math.min(applied, actions.length) - 1; i >= 0; i--) {
    const equity = actions[i]?.equity
    if (equity && typeof equity === 'object') return equity as Equities
  }
  return null
}

/** The all-in EV of the hero, in big blinds, as the badge shows it: `+1.8` or `-0.4`. */
export function formatAllInEv(diffBb: number): string {
  const rounded = Math.round(diffBb * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`
}
