import { describe, expect, it } from 'vitest'
import { fishShare, maxAbsProfit, shadeOpacity, type ResultCell } from './hourly'

describe('shadeOpacity', () => {
  it('is the faintest for empty cells and the strongest at the maximum', () => {
    expect(shadeOpacity(0, 10)).toBeCloseTo(0.15)
    expect(shadeOpacity(10, 10)).toBeCloseTo(1)
    expect(shadeOpacity(-10, 10)).toBeCloseTo(1)
  })

  it('stays faint when the grid has no value at all', () => {
    expect(shadeOpacity(5, 0)).toBeCloseTo(0.15)
  })
})

describe('maxAbsProfit', () => {
  it('takes the largest absolute profit across the grid', () => {
    const grid: ResultCell[][] = [
      [{ tournaments: 1, profit: -7 }, { tournaments: 1, profit: 3 }],
      [{ tournaments: 0, profit: 0 }, { tournaments: 2, profit: 5 }],
    ]
    expect(maxAbsProfit(grid)).toBe(7)
  })
})

describe('fishShare', () => {
  it('is the percentage of fish among the opponents', () => {
    expect(fishShare({ opponents: 4, fish: 3 })).toBeCloseTo(75)
  })

  it('is null when no opponent was seen', () => {
    expect(fishShare({ opponents: 0, fish: 0 })).toBeNull()
  })
})
