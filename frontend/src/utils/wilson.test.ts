import { describe, expect, it } from 'vitest'
import { formatInterval, wilsonInterval } from './wilson'

describe('wilsonInterval', () => {
  it('has no interval without opportunities or with impossible counts', () => {
    expect(wilsonInterval(0, 0)).toBeNull()
    expect(wilsonInterval(5, 3)).toBeNull()
    expect(wilsonInterval(-1, 10)).toBeNull()
    expect(wilsonInterval(Number.NaN, 10)).toBeNull()
  })

  it('matches known values', () => {
    const half = wilsonInterval(50, 100)!
    expect(half.low).toBeCloseTo(40.38, 1)
    expect(half.high).toBeCloseTo(59.62, 1)
    const few = wilsonInterval(3, 10)!
    expect(few.low).toBeCloseTo(10.78, 1)
    expect(few.high).toBeCloseTo(60.32, 1)
  })

  it('stays within 0 and 100, even for all or nothing', () => {
    const none = wilsonInterval(0, 5)!
    const all = wilsonInterval(5, 5)!
    expect(none.low).toBe(0)
    expect(none.high).toBeGreaterThan(0)
    expect(all.high).toBe(100)
    expect(all.low).toBeLessThan(100)
  })

  it('narrows as the sample grows', () => {
    const width = (n: number) => {
      const i = wilsonInterval(n / 2, n)!
      return i.high - i.low
    }
    expect(width(1000)).toBeLessThan(width(100))
    expect(width(100)).toBeLessThan(width(10))
  })
})

describe('formatInterval', () => {
  it('is empty without an interval', () => expect(formatInterval(null)).toBe(''))
  it('rounds both ends', () => expect(formatInterval({ low: 24.4, high: 47.6 })).toBe('24-48 %'))
})
