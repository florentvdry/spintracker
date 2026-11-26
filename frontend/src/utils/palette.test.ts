import { describe, expect, it } from 'vitest'
import { isPaletteName, PALETTES, PALETTE_NAMES, rgbTriplet } from './palette'

describe('palettes', () => {
  it('turns a colour into the triplet the CSS variables hold', () => {
    expect(rgbTriplet('#56b4e9')).toBe('86 180 233')
    expect(rgbTriplet('#000000')).toBe('0 0 0')
  })

  it('recognises the palette names only', () => {
    expect(isPaletteName('colorblind')).toBe(true)
    expect(isPaletteName('rainbow')).toBe(false)
    expect(isPaletteName(undefined)).toBe(false)
  })

  it('never uses the same colour for a gain and a loss, nor for a loss and a deviation', () => {
    for (const name of PALETTE_NAMES) {
      const palette = PALETTES[name]
      expect(palette.positive).not.toBe(palette.negative)
      expect(palette.deviation).not.toBe(palette.negative)
      expect(palette.poolAbove).not.toBe(palette.poolBelow)
    }
  })

  it('has valid hex colours everywhere', () => {
    const hex = /^#[0-9a-f]{6}$/
    for (const name of PALETTE_NAMES) {
      const palette = PALETTES[name]
      const colors = [palette.positive, palette.negative, palette.deviation, palette.poolAbove, palette.poolBelow, palette.secondary, ...Object.values(palette.respect)]
      for (const color of colors) expect(color).toMatch(hex)
    }
  })
})
