import { describe, expect, it } from 'vitest'
import { buildBankrollSeries, highestStakeUnder, recommendStakes, STAKE_LADDER } from './bankroll'

describe('bankroll series', () => {
  it('adds deposits to the results and carries the last result over quiet days', () => {
    const series = buildBankrollSeries(
      [
        { id: 1, occurredOn: '2026-01-01', amount: 100, note: '' },
        { id: 2, occurredOn: '2026-01-04', amount: -30, note: '' },
      ],
      [
        { date: '2026-01-02 10:00:00', euro: 5 },
        { date: '2026-01-02 22:30:00', euro: 12 },
        { date: '2026-01-03T09:00:00', euro: 8 },
      ],
    )
    expect(series).toEqual([
      { day: '2026-01-01', bankroll: 100 },
      { day: '2026-01-02', bankroll: 112 },
      { day: '2026-01-03', bankroll: 108 },
      { day: '2026-01-04', bankroll: 78 },
    ])
  })

  it('is empty without data', () => {
    expect(buildBankrollSeries([], [])).toEqual([])
  })
})

describe('stake recommendation', () => {
  const table = [
    { multiplier: 2, weight: 60 },
    { multiplier: 3, weight: 27 },
    { multiplier: 4, weight: 8 },
    { multiplier: 5, weight: 5 },
  ]

  it('risks more of the bankroll as the buy-in grows', () => {
    const recommendations = recommendStakes({ bankroll: 200, chipEv: 50, table, room: 'winamax', spins: 400 })
    expect(recommendations.map((r) => r.buyIn)).toEqual(STAKE_LADDER)
    const risk = (buyIn: number) => recommendations.find((r) => r.buyIn === buyIn)?.ruinRisk ?? NaN
    expect(risk(0.25)).toBeLessThanOrEqual(risk(10))
    expect(risk(100)).toBeGreaterThan(0.5)
  })

  it('picks the highest buy-in under the limit', () => {
    const picked = highestStakeUnder(
      [
        { buyIn: 1, ruinRisk: 0 },
        { buyIn: 5, ruinRisk: 0.03 },
        { buyIn: 10, ruinRisk: 0.4 },
      ],
      0.05,
    )
    expect(picked).toBe(5)
    expect(highestStakeUnder([{ buyIn: 1, ruinRisk: 0.9 }], 0.05)).toBeNull()
  })
})
