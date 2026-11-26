import { describe, expect, it } from 'vitest'
import { parseRakebackPercent, totalFees, totalRakeback, type RoomRakeback } from './rakeback'

describe('parseRakebackPercent', () => {
  it('accepts a decimal typed with a comma or a dot', () => {
    expect(parseRakebackPercent('12,5')).toBe(12.5)
    expect(parseRakebackPercent(' 10.25 ')).toBe(10.25)
  })

  it('accepts the bounds 0 and 100', () => {
    expect(parseRakebackPercent('0')).toBe(0)
    expect(parseRakebackPercent('100')).toBe(100)
  })

  it('rejects empty, non-numeric and out-of-range values', () => {
    expect(parseRakebackPercent('')).toBeNull()
    expect(parseRakebackPercent('abc')).toBeNull()
    expect(parseRakebackPercent('-1')).toBeNull()
    expect(parseRakebackPercent('100.1')).toBeNull()
    expect(parseRakebackPercent('Infinity')).toBeNull()
  })
})

describe('rakeback totals', () => {
  const rows: RoomRakeback[] = [
    { room: 'Winamax', tournaments: 10, totalFees: 20, percent: 10, rakeback: 2 },
    { room: 'Betclic', tournaments: 5, totalFees: 15, percent: 0, rakeback: 0 },
  ]

  it('sums rakeback and fees across rooms', () => {
    expect(totalRakeback(rows)).toBeCloseTo(2)
    expect(totalFees(rows)).toBeCloseTo(35)
  })

  it('is zero for no rooms', () => {
    expect(totalRakeback([])).toBe(0)
    expect(totalFees([])).toBe(0)
  })
})
