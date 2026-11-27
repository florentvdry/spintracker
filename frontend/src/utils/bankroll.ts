import { runSimulation, type MultiplierWeight, type SharingRoom } from '@/utils/varianceSimulator'

/** Largest share of simulations that may end in ruin for a buy-in to be recommended. */
export const RISK_THRESHOLD = 0.05
/** Simulation size for each candidate buy-in; fixed, so the recommendation is reproducible. */
export const SIMULATION = { spins: 1000, simulations: 300, seed: 1 } as const
/** How many buy-ins are shown in the risk table. */
export const MAX_RISK_ROWS = 8

export interface BankrollPoint {
  time: string
  balance: number
}

export interface RiskRow {
  buyIn: number
  risk: number | null
}

/** Candidate buy-ins the bankroll can cover, largest first. */
function coverableBuyIns(bankroll: number, buyIns: number[]): number[] {
  return buyIns
    .filter((buyIn) => buyIn > 0 && buyIn <= bankroll)
    .sort((a, b) => b - a)
}

/** The largest buy-in whose risk of ruin stays within the threshold, or null when none does. */
export function recommendBuyIn(
  bankroll: number,
  buyIns: number[],
  riskAt: (buyIn: number) => number | null,
  threshold: number = RISK_THRESHOLD,
): RiskRow | null {
  for (const buyIn of coverableBuyIns(bankroll, buyIns)) {
    const risk = riskAt(buyIn)
    if (risk !== null && risk <= threshold) return { buyIn, risk }
  }
  return null
}

/** Risk of ruin at the largest buy-ins the bankroll covers, for display. */
export function riskTable(bankroll: number, buyIns: number[], riskAt: (buyIn: number) => number | null): RiskRow[] {
  return coverableBuyIns(bankroll, buyIns)
    .slice(0, MAX_RISK_ROWS)
    .map((buyIn) => ({ buyIn, risk: riskAt(buyIn) }))
}

/** Share of simulations that hit the ruin threshold, with the bankroll expressed in buy-ins. */
export function ruinShareAt(
  bankroll: number,
  buyIn: number,
  winRate: number,
  table: MultiplierWeight[],
  room: SharingRoom,
): number | null {
  const result = runSimulation({ ...SIMULATION, winRate, multipliers: table, room, bankroll: bankroll / buyIn })
  return result ? result.ruinShare : null
}

/**
 * SVG path of the bankroll curve in a `width` x `height` box. Points are spaced evenly by
 * order, not by time, so a long gap between two events does not stretch the curve.
 */
export function curvePath(points: BankrollPoint[], width: number, height: number): string {
  if (points.length === 0) return ''
  const balances = points.map((p) => p.balance)
  const min = Math.min(...balances)
  const max = Math.max(...balances)
  const span = max - min || 1
  const step = points.length > 1 ? width / (points.length - 1) : 0
  return points
    .map((p, index) => {
      const x = (index * step).toFixed(1)
      const y = (height - ((p.balance - min) / span) * height).toFixed(1)
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`
    })
    .join(' ')
}

export interface BankrollMovement {
  id: number
  occurredAt: string
  amount: number
  note: string
}

export interface BankrollOverview {
  totals: { deposits: number; withdrawals: number; profit: number; balance: number }
  curve: BankrollPoint[]
  movements: BankrollMovement[]
}

/** Parses a player-typed number; null when it is empty, not a number or outside `[min, max]`. */
export function parseBounded(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < min || value > max) return null
  return value
}
