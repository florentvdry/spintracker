import { describe, expect, it } from 'vitest'
import { parseBounded, sortedMultipliers, type CevBucket } from './cevBreakdown'

describe('parseBounded', () => {
  it('accepts a number inside the bounds, with a comma or a dot', () => {
    expect(parseBounded('12', 1, 100)).toBe(12)
    expect(parseBounded('60,5', 0, 100)).toBe(60.5)
  })

  it('rejects empty, non-numeric and out-of-range input', () => {
    expect(parseBounded('', 1, 100)).toBeNull()
    expect(parseBounded('x', 1, 100)).toBeNull()
    expect(parseBounded('0', 1, 100)).toBeNull()
    expect(parseBounded('101', 0, 100)).toBeNull()
    expect(parseBounded('Infinity', 0, 100)).toBeNull()
  })
})

describe('sortedMultipliers', () => {
  it('orders multipliers numerically, not as strings', () => {
    const bucket: CevBucket = { hands: 1, ev: 0 }
    const sorted = sortedMultipliers({ '100': bucket, '10': bucket, '2': bucket })
    expect(sorted.map(([m]) => m)).toEqual([2, 10, 100])
  })
})
