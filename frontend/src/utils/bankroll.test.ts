import { describe, expect, it } from 'vitest'
import { curvePath, recommendBuyIn, riskTable } from './bankroll'

// Risk grows as the buy-in grows: the fake simulation is only a monotonic function.
const riskAt = (buyIn: number) => buyIn / 100

describe('recommendBuyIn', () => {
  it('picks the largest buy-in whose risk stays within the threshold', () => {
    const result = recommendBuyIn(1000, [5, 20, 30, 60], riskAt, 0.25)
    expect(result).toEqual({ buyIn: 20, risk: 0.2 })
  })

  it('ignores buy-ins the bankroll does not cover', () => {
    const result = recommendBuyIn(100, [200, 50], riskAt, 0.9)
    expect(result?.buyIn).toBe(50)
  })

  it('returns null when no buy-in passes', () => {
    expect(recommendBuyIn(1000, [500], riskAt, 0.01)).toBeNull()
  })

  it('skips buy-ins whose risk is unknown', () => {
    const result = recommendBuyIn(1000, [50, 20], (b) => (b === 50 ? null : 0), 0.05)
    expect(result?.buyIn).toBe(20)
  })
})

describe('riskTable', () => {
  it('lists covered buy-ins from the largest, with their risk', () => {
    const rows = riskTable(1000, [10, 2000, 40], riskAt)
    expect(rows.map((r) => r.buyIn)).toEqual([40, 10])
  })
})

describe('curvePath', () => {
  it('is empty without points', () => {
    expect(curvePath([], 100, 50)).toBe('')
  })

  it('starts at the bottom-left for the lowest point and ends at the top-right for the highest', () => {
    const d = curvePath(
      [
        { time: 'a', balance: 0 },
        { time: 'b', balance: 10 },
      ],
      100,
      50,
    )
    expect(d).toBe('M0.0 50.0 L100.0 0.0')
  })
})
