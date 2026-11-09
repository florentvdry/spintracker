/**
 * Monte Carlo variance simulator for Spin & Go style lotteries.
 *
 * Every amount is expressed in buy-ins so the result does not depend on the stake.
 * A spin costs one buy-in. The hero wins it with probability `winRate`; the multiplier is drawn
 * from the prize pool distribution independently of who wins (the draw happens before the cards).
 * From a high enough multiplier the rooms share the pool between the three places, so the second
 * and third places can pay too (see `prizeShares`).
 */

/** Rooms whose prize sharing is known, or `none` for a winner-takes-all pool. */
export type SharingRoom = 'none' | 'winamax' | 'unibet' | 'betclic'

/** Shares of the prize pool paid to the first, second and third place. */
export type PrizeShares = [number, number, number]

const WINNER_TAKES_ALL: PrizeShares = [1, 0, 0]
const SHARES_75_15_10: PrizeShares = [0.75, 0.15, 0.1]
const SHARES_80_12_8: PrizeShares = [0.8, 0.12, 0.08]
const SHARES_80_10_10: PrizeShares = [0.8, 0.1, 0.1]
/** Smallest multipliers from which each room shares the pool; below them the winner takes it all. */
const WINAMAX_SHARING_MULTIPLIER = 100
const UNIBET_SHARING_MULTIPLIER = 100
const UNIBET_SMALL_SHARING_MULTIPLIER = 10
const BETCLIC_SHARING_MULTIPLIER = 20

/** How a room splits a prize pool of the given multiplier. Mirrors `prize_shares` in the Rust backend. */
export function prizeShares(room: SharingRoom, multiplier: number): PrizeShares {
  if (room === 'winamax' && multiplier >= WINAMAX_SHARING_MULTIPLIER) return SHARES_80_12_8
  if (room === 'unibet' && multiplier >= UNIBET_SHARING_MULTIPLIER) return SHARES_80_12_8
  if (room === 'unibet' && multiplier >= UNIBET_SMALL_SHARING_MULTIPLIER) return SHARES_80_10_10
  if (room === 'betclic' && multiplier >= BETCLIC_SHARING_MULTIPLIER) return SHARES_75_15_10
  return WINNER_TAKES_ALL
}

/**
 * Chances of finishing first, second and third given the chance of winning.
 * The two opponents are taken as equally strong (Harville), as in the Rust backend.
 */
export function placeProbabilities(winRate: number): PrizeShares {
  const second = (2 * winRate * (1 - winRate)) / (1 + winRate)
  return [winRate, second, Math.max(0, 1 - winRate - second)]
}

export interface MultiplierWeight {
  multiplier: number
  /** Relative weight; the table is normalized, so counts or percentages both work. */
  weight: number
}

export interface SimulationInput {
  spins: number
  simulations: number
  /** Probability (0..1) of finishing first. */
  winRate: number
  multipliers: MultiplierWeight[]
  /** How the prize pool is shared; defaults to winner takes all. */
  room?: SharingRoom
  /** Starting bankroll in buy-ins, or null to skip the risk of ruin. */
  bankroll: number | null
  seed: number
}

export const BAND_KEYS = ['p10', 'p25', 'p50', 'p75', 'p90'] as const
export type BandKey = (typeof BAND_KEYS)[number]

export interface SimulationResult {
  /** Spin counts at which the curves are sampled, starting at 0. */
  checkpoints: number[]
  /** Profit percentiles in buy-ins at each checkpoint. */
  bands: Record<BandKey, number[]>
  /** A few raw trajectories, sampled at the checkpoints. */
  samplePaths: number[][]
  /** The simulated run that ends closest to the 90th percentile. */
  luckyPath: number[]
  /** The simulated run that ends closest to the 10th percentile. */
  unluckyPath: number[]
  expectedProfit: number
  /** Expected profit per spin, in buy-ins (the ROI as a fraction). */
  roi: number
  /** Theoretical standard deviation of the total profit. */
  stdDevProfit: number
  /** Share (0..1) of simulations ending below zero. */
  losingShare: number
  /** Share (0..1) of simulations that hit the ruin threshold, null without a bankroll. */
  ruinShare: number | null
  medianMaxDrawdown: number
  p95MaxDrawdown: number
}

export const MAX_SPINS = 100_000
export const MAX_SIMULATIONS = 5_000
/** Upper bound on spins x simulations, which keeps a run under about a second. */
export const MAX_WORK = 20_000_000
const CHECKPOINT_COUNT = 200
const SAMPLE_PATH_COUNT = 12

const BAND_QUANTILES: Record<BandKey, number> = { p10: 0.1, p25: 0.25, p50: 0.5, p75: 0.75, p90: 0.9 }
const P95 = 0.95
const MEDIAN = 0.5

/** Small seeded generator (mulberry32) so runs are reproducible. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface NormalizedTable {
  multipliers: number[]
  /** Cumulative probabilities, the last one being exactly 1. */
  cumulative: number[]
  probabilities: number[]
}

function normalize(table: MultiplierWeight[]): NormalizedTable | null {
  const rows = table.filter((row) => row.weight > 0 && Number.isFinite(row.weight) && row.multiplier > 0 && Number.isFinite(row.multiplier))
  const total = rows.reduce((sum, row) => sum + row.weight, 0)
  if (rows.length === 0 || total <= 0) return null
  const probabilities = rows.map((row) => row.weight / total)
  let running = 0
  const cumulative = probabilities.map((p) => (running += p))
  cumulative[cumulative.length - 1] = 1
  return { multipliers: rows.map((row) => row.multiplier), cumulative, probabilities }
}

/** Expected prize multiplier of the table, or null when it is empty. */
export function expectedMultiplier(table: MultiplierWeight[]): number | null {
  const normalized = normalize(table)
  if (!normalized) return null
  return normalized.multipliers.reduce((sum, m, i) => sum + m * normalized.probabilities[i], 0)
}

/** Profit in buy-ins of finishing first, second and third in a pool of the given multiplier. */
function placePayoffs(room: SharingRoom, multiplier: number): PrizeShares {
  const [first, second, third] = prizeShares(room, multiplier)
  return [multiplier * first - 1, multiplier * second - 1, multiplier * third - 1]
}

/** First two moments of the profit of one spin, in buy-ins. */
function spinMoments(winRate: number, normalized: NormalizedTable, room: SharingRoom): { mean: number; secondMoment: number } {
  const odds = placeProbabilities(winRate)
  let mean = 0
  let secondMoment = 0
  normalized.multipliers.forEach((multiplier, row) => {
    placePayoffs(room, multiplier).forEach((payoff, place) => {
      const weight = normalized.probabilities[row] * odds[place]
      mean += weight * payoff
      secondMoment += weight * payoff * payoff
    })
  })
  return { mean, secondMoment }
}

/** Expected profit per spin, in buy-ins. */
export function expectedProfitPerSpin(winRate: number, table: MultiplierWeight[], room: SharingRoom = 'none'): number | null {
  const normalized = normalize(table)
  return normalized ? spinMoments(winRate, normalized, room).mean : null
}

/** Theoretical standard deviation of one spin, in buy-ins. */
export function stdDevPerSpin(winRate: number, table: MultiplierWeight[], room: SharingRoom = 'none'): number | null {
  const normalized = normalize(table)
  if (!normalized) return null
  const { mean, secondMoment } = spinMoments(winRate, normalized, room)
  return Math.sqrt(Math.max(0, secondMoment - mean * mean))
}

function quantile(sorted: Float32Array | number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

/** Returns the name of the invalid field, or null when the input can be simulated. */
export function validateInput(input: SimulationInput): string | null {
  if (!Number.isInteger(input.spins) || input.spins < 1 || input.spins > MAX_SPINS) return 'spins'
  if (!Number.isInteger(input.simulations) || input.simulations < 1 || input.simulations > MAX_SIMULATIONS) return 'simulations'
  if (input.spins * input.simulations > MAX_WORK) return 'work'
  if (!(input.winRate >= 0 && input.winRate <= 1)) return 'winRate'
  if (normalize(input.multipliers) === null) return 'multipliers'
  if (input.bankroll !== null && !(input.bankroll > 0)) return 'bankroll'
  return null
}

export function runSimulation(input: SimulationInput): SimulationResult | null {
  if (validateInput(input) !== null) return null
  const table = normalize(input.multipliers)
  if (!table) return null

  const { spins, simulations, winRate, bankroll } = input
  const random = createRandom(input.seed)
  const tableSize = table.multipliers.length
  const room = input.room ?? 'none'
  const shares = room !== 'none'
  const odds = placeProbabilities(winRate)
  const payoffs = table.multipliers.map((multiplier) => placePayoffs(room, multiplier))

  const checkpointCount = Math.min(spins, CHECKPOINT_COUNT)
  const checkpoints = Array.from({ length: checkpointCount + 1 }, (_, k) => Math.round((spins * k) / checkpointCount))
  // values[k * simulations + s] is the profit of simulation s at checkpoint k.
  const values = new Float32Array((checkpointCount + 1) * simulations)
  const drawdowns = new Float32Array(simulations)
  let ruined = 0
  let losing = 0

  for (let s = 0; s < simulations; s++) {
    let profit = 0
    let peak = 0
    let maxDrawdown = 0
    let lowest = 0
    let next = 1
    for (let spin = 1; spin <= spins; spin++) {
      const draw = random()
      const place = draw < odds[0] ? 0 : draw < odds[0] + odds[1] ? 1 : 2
      // Without sharing only the winner is paid, so the multiplier is only needed then.
      if (place === 0 || shares) {
        const multiplierDraw = random()
        let index = 0
        while (index < tableSize - 1 && multiplierDraw >= table.cumulative[index]) index++
        profit += payoffs[index][place]
      } else {
        profit -= 1
      }
      if (profit > peak) peak = profit
      if (peak - profit > maxDrawdown) maxDrawdown = peak - profit
      if (profit < lowest) lowest = profit
      if (spin === checkpoints[next]) {
        values[next * simulations + s] = profit
        next++
      }
    }
    drawdowns[s] = maxDrawdown
    if (profit < 0) losing++
    if (bankroll !== null && lowest <= -bankroll) ruined++
  }

  const samplePaths: number[][] = []
  for (let s = 0; s < Math.min(SAMPLE_PATH_COUNT, simulations); s++) {
    samplePaths.push(checkpoints.map((_, k) => values[k * simulations + s]))
  }

  const bands = { p10: [], p25: [], p50: [], p75: [], p90: [] } as Record<BandKey, number[]>
  for (let k = 0; k <= checkpointCount; k++) {
    const slice = values.slice(k * simulations, (k + 1) * simulations).sort()
    for (const key of BAND_KEYS) bands[key].push(quantile(slice, BAND_QUANTILES[key]))
  }
  drawdowns.sort()

  const last = checkpointCount
  const pathEndingNear = (target: number): number[] => {
    let best = 0
    for (let s = 1; s < simulations; s++) {
      if (Math.abs(values[last * simulations + s] - target) < Math.abs(values[last * simulations + best] - target)) best = s
    }
    return checkpoints.map((_, k) => values[k * simulations + best])
  }

  const perSpin = expectedProfitPerSpin(winRate, input.multipliers, room) ?? 0
  const perSpinDeviation = stdDevPerSpin(winRate, input.multipliers, room) ?? 0

  return {
    checkpoints,
    bands,
    samplePaths,
    luckyPath: pathEndingNear(bands.p90[last]),
    unluckyPath: pathEndingNear(bands.p10[last]),
    expectedProfit: perSpin * spins,
    roi: perSpin,
    stdDevProfit: perSpinDeviation * Math.sqrt(spins),
    losingShare: losing / simulations,
    ruinShare: bankroll === null ? null : ruined / simulations,
    medianMaxDrawdown: quantile(drawdowns, MEDIAN),
    p95MaxDrawdown: quantile(drawdowns, P95),
  }
}

/**
 * Turns a per-hand cumulative euro series into a per-tournament one, starting at 0.
 * A tournament's result is booked on its last hand, so the value only moves there.
 */
export function tournamentCurve(cumulativePerHand: number[]): number[] {
  const curve = [0]
  for (const value of cumulativePerHand) {
    if (Number.isFinite(value) && value !== curve[curve.length - 1]) curve.push(value)
  }
  return curve
}

/** Samples a curve (one value per tournament) at the given tournament counts, null past its end. */
export function sampleCurve(curve: number[], at: number[]): (number | null)[] {
  return at.map((count) => (count < curve.length ? curve[count] : null))
}

/** Chips each player starts a Spin with. */
export const STARTING_STACK_CHIPS = 500
const PLAYERS_PER_SPIN = 3

/**
 * Probability of winning a Spin implied by an average chip EV per tournament.
 * The prize goes to a single player, so the chance of winning equals the share of chips
 * one is expected to end with: (stack + chip EV) out of all the chips in play.
 */
export function winRateFromChipEv(chipEv: number, startingStack = STARTING_STACK_CHIPS): number {
  if (!Number.isFinite(chipEv)) return Number.NaN
  const share = (startingStack + chipEv) / (startingStack * PLAYERS_PER_SPIN)
  return Math.min(1, Math.max(0, share))
}

export type RunRank = { kind: 'above' } | { kind: 'below' } | { kind: 'within'; percentile: number }

const RANK_POINTS: { key: BandKey; percentile: number }[] = [
  { key: 'p10', percentile: 10 },
  { key: 'p25', percentile: 25 },
  { key: 'p50', percentile: 50 },
  { key: 'p75', percentile: 75 },
  { key: 'p90', percentile: 90 },
]

/**
 * Where a result stands among the simulated runs, interpolated between the known percentiles.
 * Past the 10th or 90th percentile only the side is known.
 */
export function estimateRank(value: number, band: Record<BandKey, number>): RunRank {
  if (value < band.p10) return { kind: 'below' }
  if (value > band.p90) return { kind: 'above' }
  for (let i = 1; i < RANK_POINTS.length; i++) {
    const low = RANK_POINTS[i - 1]
    const high = RANK_POINTS[i]
    const lowValue = band[low.key]
    const highValue = band[high.key]
    if (value <= highValue) {
      const ratio = highValue === lowValue ? 0 : (value - lowValue) / (highValue - lowValue)
      return { kind: 'within', percentile: low.percentile + ratio * (high.percentile - low.percentile) }
    }
  }
  return { kind: 'above' }
}

/**
 * Chip EV per tournament at which a player breaks even for a given average multiplier.
 * Break-even needs a win probability of 1 / multiplier, and a win probability is (stack + cEV) / (3 stacks).
 */
export function breakevenChipEv(averageMultiplier: number, startingStack = STARTING_STACK_CHIPS): number {
  return (startingStack * PLAYERS_PER_SPIN) / averageMultiplier - startingStack
}

const BREAKEVEN_ITERATIONS = 60

/**
 * Same break-even for a whole table and a sharing room. The profit only grows with the chance of
 * winning, so it is found by bisection. Null when even a certain win would not break even.
 */
export function breakevenChipEvForTable(table: MultiplierWeight[], room: SharingRoom, startingStack = STARTING_STACK_CHIPS): number | null {
  const profitAt = (winRate: number) => expectedProfitPerSpin(winRate, table, room)
  const best = profitAt(1)
  if (best === null || best < 0) return null
  let low = 0
  let high = 1
  for (let i = 0; i < BREAKEVEN_ITERATIONS; i++) {
    const middle = (low + high) / 2
    if ((profitAt(middle) ?? 0) < 0) low = middle
    else high = middle
  }
  return high * startingStack * PLAYERS_PER_SPIN - startingStack
}
