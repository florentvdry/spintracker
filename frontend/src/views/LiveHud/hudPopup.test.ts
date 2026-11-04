import { describe, expect, it } from 'vitest'
import { placePopup } from './hudPopup'

const viewport = { width: 1000, height: 600 }
const size = { width: 200, height: 150 }

describe('placePopup', () => {
  it('opens under the clicked cell', () => {
    expect(placePopup({ left: 100, top: 100, width: 30, height: 18 }, size, viewport)).toEqual({ left: 100, top: 120 })
  })

  it('opens over the cell when there is no room below', () => {
    expect(placePopup({ left: 100, top: 540, width: 30, height: 18 }, size, viewport)).toEqual({ left: 100, top: 388 })
  })

  it('stays inside the window on the right and on a small window', () => {
    expect(placePopup({ left: 950, top: 100, width: 30, height: 18 }, size, viewport).left).toBe(800)
    expect(placePopup({ left: 10, top: 10, width: 30, height: 18 }, { width: 2000, height: 900 }, viewport)).toEqual({ left: 0, top: 0 })
  })
})
