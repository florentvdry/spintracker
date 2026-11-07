import { describe, expect, it } from 'vitest'
import { MAX_TABLE_SCALE, MIN_TABLE_SCALE, REFERENCE_TABLE_HEIGHT_PX, REFERENCE_TABLE_WIDTH_PX, tableScale } from './hudScale'

describe('the scale of the panels with the table window', () => {
  it('is 1 at the size the panels were drawn for', () => {
    expect(tableScale(REFERENCE_TABLE_WIDTH_PX, REFERENCE_TABLE_HEIGHT_PX)).toBe(1)
  })

  it('shrinks with the smaller side of a small table', () => {
    expect(tableScale(1350, 750)).toBeCloseTo(0.75)
    expect(tableScale(1350, 1000)).toBeCloseTo(0.75)
  })

  it('never goes below the readable minimum or above the maximum', () => {
    expect(tableScale(200, 100)).toBe(MIN_TABLE_SCALE)
    expect(tableScale(9000, 5000)).toBe(MAX_TABLE_SCALE)
  })

  it('keeps the smallest size the profile asks for', () => {
    expect(tableScale(600, 400, 0.5)).toBe(0.5)
    expect(tableScale(600, 400, 0.3)).toBeCloseTo(1 / 3)
  })

  it('stays at 1 when the window has no size yet', () => {
    expect(tableScale(0, 0)).toBe(1)
    expect(tableScale(Number.NaN, 800)).toBe(1)
  })
})
