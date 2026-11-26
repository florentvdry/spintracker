import { describe, expect, it } from 'vitest'
import { cellGrid, cellValue, heatColor, maxAbs, type TimeCell } from './heatmap'

const cell = (overrides: Partial<TimeCell>): TimeCell => ({ weekday: 0, hour: 0, tournaments: 4, euro: 8, ev_chips: 40, fish_share: 0.75, ...overrides })

describe('time heatmap', () => {
  it('reads each metric from a cell', () => {
    expect(cellValue(cell({}), 'euro')).toBe(8)
    expect(cellValue(cell({}), 'cev')).toBe(10)
    expect(cellValue(cell({}), 'fish')).toBe(75)
    expect(cellValue(cell({ fish_share: null }), 'fish')).toBeNull()
  })

  it('places cells on the weekday x hour grid and ignores out-of-range ones', () => {
    const grid = cellGrid([cell({ weekday: 2, hour: 21 }), cell({ weekday: 9, hour: 3 })])
    expect(grid[2][21]?.tournaments).toBe(4)
    expect(grid.flat().filter(Boolean)).toHaveLength(1)
  })

  it('colours positive results green, negative red and scales with the maximum', () => {
    const max = maxAbs([cell({ euro: 10 }), cell({ euro: -20 })], 'euro')
    expect(max).toBe(20)
    expect(heatColor(10, max, 'euro')).toContain('52, 194, 122')
    expect(heatColor(-20, max, 'euro')).toContain('255, 122, 107')
    expect(heatColor(null, max, 'euro')).toBe('transparent')
    expect(heatColor(5, 0, 'euro')).toBe('transparent')
  })
})
