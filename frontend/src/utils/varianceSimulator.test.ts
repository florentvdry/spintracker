import { describe, expect, it } from 'vitest'
import {
  expectedMultiplier, expectedProfitPerSpin, MAX_SPINS, runSimulation, sampleCurve, stdDevPerSpin, tournamentCurve, validateInput, winRateFromChipEv, estimateRank, breakevenChipEv,
  type MultiplierWeight, type SimulationInput,
} from './varianceSimulator'

const TABLE: MultiplierWeight[] = [
  { multiplier: 2, weight: 60 },
  { multiplier: 4, weight: 30 },
  { multiplier: 25, weight: 10 },
]

const baseInput: SimulationInput = { spins: 500, simulations: 400, winRate: 0.36, multipliers: TABLE, bankroll: null, seed: 42 }

describe('theoretical moments', () => {
  it('computes the expected multiplier and ROI from a weight table', () => {
    expect(expectedMultiplier(TABLE)).toBeCloseTo(0.6 * 2 + 0.3 * 4 + 0.1 * 25, 10)
    expect(expectedProfitPerSpin(0.36, TABLE)).toBeCloseTo(0.36 * 4.9 - 1, 10)
  })

  it('has no variance for a certain win of one buy-in', () => {
    expect(stdDevPerSpin(1, [{ multiplier: 1, weight: 1 }])).toBeCloseTo(0, 10)
  })

  it('ignores invalid rows and rejects an empty table', () => {
    expect(expectedMultiplier([{ multiplier: 2, weight: 0 }, { multiplier: -1, weight: 5 }])).toBeNull()
  })
})

describe('runSimulation', () => {
  it('is reproducible for the same seed', () => {
    expect(runSimulation(baseInput)).toEqual(runSimulation(baseInput))
  })

  it('samples the curves from zero to the last spin', () => {
    const result = runSimulation(baseInput)!
    expect(result.checkpoints[0]).toBe(0)
    expect(result.checkpoints.at(-1)).toBe(500)
    expect(result.bands.p50).toHaveLength(result.checkpoints.length)
    expect(result.bands.p50[0]).toBe(0)
  })

  it('keeps the percentile bands ordered', () => {
    const { bands } = runSimulation(baseInput)!
    bands.p50.forEach((_, i) => {
      expect(bands.p10[i]).toBeLessThanOrEqual(bands.p25[i])
      expect(bands.p25[i]).toBeLessThanOrEqual(bands.p50[i])
      expect(bands.p50[i]).toBeLessThanOrEqual(bands.p75[i])
      expect(bands.p75[i]).toBeLessThanOrEqual(bands.p90[i])
    })
  })

  it('matches the theoretical spread of the total profit', () => {
    const result = runSimulation({ ...baseInput, spins: 1000, simulations: 2000 })!
    const spread = result.bands.p90.at(-1)! - result.bands.p10.at(-1)!
    // The 10-90 band of a near-normal total spans about 2.56 standard deviations.
    expect(spread / result.stdDevProfit).toBeGreaterThan(2.2)
    expect(spread / result.stdDevProfit).toBeLessThan(3)
  })

  it('reports a sure ruin when nothing is ever won and none when everything is', () => {
    const lose = runSimulation({ ...baseInput, winRate: 0, bankroll: 10, simulations: 50, spins: 20 })!
    expect(lose.ruinShare).toBe(1)
    expect(lose.losingShare).toBe(1)
    expect(lose.roi).toBe(-1)
    const win = runSimulation({ ...baseInput, winRate: 1, bankroll: 10, simulations: 50, spins: 20 })!
    expect(win.ruinShare).toBe(0)
    expect(win.losingShare).toBe(0)
  })

  it('reports the whole losing streak as the drawdown when every spin is lost', () => {
    const result = runSimulation({ ...baseInput, winRate: 0, spins: 30, simulations: 10 })!
    expect(result.medianMaxDrawdown).toBe(30)
  })

  it('returns a lucky and an unlucky run ending near the 90th and 10th percentiles', () => {
    const result = runSimulation({ ...baseInput, simulations: 1000 })!
    expect(result.luckyPath).toHaveLength(result.checkpoints.length)
    expect(result.unluckyPath).toHaveLength(result.checkpoints.length)
    expect(result.luckyPath.at(-1)!).toBeGreaterThan(result.unluckyPath.at(-1)!)
    expect(Math.abs(result.luckyPath.at(-1)! - result.bands.p90.at(-1)!)).toBeLessThan(result.stdDevProfit * 0.1)
    expect(Math.abs(result.unluckyPath.at(-1)! - result.bands.p10.at(-1)!)).toBeLessThan(result.stdDevProfit * 0.1)
  })

  it('returns no ruin share without a bankroll', () => {
    expect(runSimulation(baseInput)!.ruinShare).toBeNull()
  })
})

describe('validateInput', () => {
  it('accepts a normal input', () => {
    expect(validateInput(baseInput)).toBeNull()
  })

  it('rejects out of range values', () => {
    expect(validateInput({ ...baseInput, spins: 0 })).toBe('spins')
    expect(validateInput({ ...baseInput, spins: MAX_SPINS + 1 })).toBe('spins')
    expect(validateInput({ ...baseInput, simulations: 0 })).toBe('simulations')
    expect(validateInput({ ...baseInput, winRate: 1.2 })).toBe('winRate')
    expect(validateInput({ ...baseInput, multipliers: [] })).toBe('multipliers')
    expect(validateInput({ ...baseInput, bankroll: 0 })).toBe('bankroll')
    expect(validateInput({ ...baseInput, spins: MAX_SPINS, simulations: 5000 })).toBe('work')
    expect(runSimulation({ ...baseInput, spins: 1.5 })).toBeNull()
  })
})

describe('real results curve', () => {
  it('keeps one point per tournament result, starting at zero', () => {
    // Three hands of a first tournament (still 0 until it ends), then two tournaments.
    expect(tournamentCurve([0, 0, -5, -5, 15, 15, 10])).toEqual([0, -5, 15, 10])
  })

  it('is just the origin without any result', () => {
    expect(tournamentCurve([])).toEqual([0])
  })

  it('samples the curve and stops after its last tournament', () => {
    expect(sampleCurve([0, -5, 15], [0, 1, 2, 3, 4])).toEqual([0, -5, 15, null, null])
  })
})

describe('winRateFromChipEv', () => {
  it('gives one third with no chip EV', () => {
    expect(winRateFromChipEv(0)).toBeCloseTo(1 / 3, 10)
  })

  it('adds the chip EV to the starting stack share', () => {
    expect(winRateFromChipEv(100)).toBeCloseTo(0.4, 10)
    expect(winRateFromChipEv(-100)).toBeCloseTo(4 / 15, 10)
  })

  it('stays within 0 and 1 and rejects non numbers', () => {
    expect(winRateFromChipEv(5000)).toBe(1)
    expect(winRateFromChipEv(-5000)).toBe(0)
    expect(winRateFromChipEv(Number.NaN)).toBeNaN()
  })
})

describe('estimateRank', () => {
  const band = { p10: -100, p25: -50, p50: 0, p75: 50, p90: 100 }

  it('returns the known percentiles and interpolates between them', () => {
    expect(estimateRank(0, band)).toEqual({ kind: 'within', percentile: 50 })
    expect(estimateRank(25, band)).toEqual({ kind: 'within', percentile: 62.5 })
    expect(estimateRank(-75, band)).toEqual({ kind: 'within', percentile: 17.5 })
  })

  it('only knows the side beyond the 10th and 90th percentiles', () => {
    expect(estimateRank(-101, band)).toEqual({ kind: 'below' })
    expect(estimateRank(101, band)).toEqual({ kind: 'above' })
  })

  it('copes with a flat band', () => {
    const flat = { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 }
    const rank = estimateRank(0, flat)
    expect(rank.kind).toBe('within')
    expect(Number.isFinite((rank as { percentile: number }).percentile)).toBe(true)
  })
})

describe('breakevenChipEv', () => {
  it('matches the break-even published for a 7% rake', () => {
    // x2.79 on average is x3 minus a 7% rake; forums quote about 38 chips.
    expect(breakevenChipEv(3 * 0.93)).toBeCloseTo(37.6, 1)
  })

  it('needs no chip EV when the pool is fully paid back', () => {
    expect(breakevenChipEv(3)).toBeCloseTo(0, 10)
  })

  it('gives a zero ROI at the break-even chip EV', () => {
    const average = 2.8
    const rate = winRateFromChipEv(breakevenChipEv(average))
    expect(rate * average - 1).toBeCloseTo(0, 10)
  })
})
