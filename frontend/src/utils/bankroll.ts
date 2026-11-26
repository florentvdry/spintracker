import { runSimulation, winRateFromChipEv, type MultiplierWeight, type SharingRoom } from '@/utils/varianceSimulator'

export interface BankrollTransaction {
  id: number
  occurredOn: string
  /** Positive for a deposit, negative for a withdrawal. */
  amount: number
  note: string
}

export interface EuroPoint {
  /** Date of the point, with or without a time. */
  date: string
  /** Cumulative result in euros at that point. */
  euro: number
}

export interface BankrollPoint {
  day: string
  bankroll: number
}

/** Buy-ins a recommendation is computed for. */
export const STAKE_LADDER = [0.25, 0.5, 1, 2, 3, 5, 10, 15, 25, 50, 100]
/** Risk of ruin under which a buy-in is called comfortable, and under which it is still acceptable. */
export const COMFORTABLE_RISK = 0.01
export const ACCEPTABLE_RISK = 0.05
const RECOMMENDATION_SIMULATIONS = 1500
const RECOMMENDATION_SPINS = 1000
const RECOMMENDATION_SEED = 20_260_101

const dayOf = (date: string) => date.slice(0, 10)

/** Bankroll at the end of each day with activity: deposits and withdrawals plus the results so far. */
export function buildBankrollSeries(transactions: BankrollTransaction[], points: EuroPoint[]): BankrollPoint[] {
  const euroByDay = new Map<string, number>()
  for (const point of points) euroByDay.set(dayOf(point.date), point.euro)
  const flowByDay = new Map<string, number>()
  for (const tx of transactions) flowByDay.set(dayOf(tx.occurredOn), (flowByDay.get(dayOf(tx.occurredOn)) ?? 0) + tx.amount)

  const days = [...new Set([...euroByDay.keys(), ...flowByDay.keys()])].sort()
  let deposits = 0
  let euro = 0
  return days.map((day) => {
    deposits += flowByDay.get(day) ?? 0
    euro = euroByDay.get(day) ?? euro
    return { day, bankroll: deposits + euro }
  })
}

export interface StakeRecommendation {
  buyIn: number
  /** Risk of ruin over the simulated spins, 0..1, `null` when it could not be simulated. */
  ruinRisk: number | null
}

export interface RecommendationInput {
  bankroll: number
  chipEv: number
  table: MultiplierWeight[]
  room: SharingRoom
  spins?: number
}

/** Risk of ruin at each buy-in of the ladder, from the variance simulator. */
export function recommendStakes(input: RecommendationInput): StakeRecommendation[] {
  const winRate = winRateFromChipEv(input.chipEv)
  return STAKE_LADDER.map((buyIn) => {
    const result = runSimulation({
      spins: input.spins ?? RECOMMENDATION_SPINS,
      simulations: RECOMMENDATION_SIMULATIONS,
      winRate,
      multipliers: input.table,
      room: input.room,
      bankroll: input.bankroll / buyIn,
      seed: RECOMMENDATION_SEED,
    })
    return { buyIn, ruinRisk: result?.ruinShare ?? null }
  })
}

/** Highest buy-in whose risk of ruin stays under the limit, `null` when none does. */
export function highestStakeUnder(recommendations: StakeRecommendation[], limit: number): number | null {
  const fitting = recommendations.filter((r) => r.ruinRisk !== null && r.ruinRisk <= limit)
  return fitting.length > 0 ? Math.max(...fitting.map((r) => r.buyIn)) : null
}
