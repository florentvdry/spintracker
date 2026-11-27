import { describe, expect, it } from 'vitest'
import { colorsOf, hexToRgbTriplet, isPaletteName, respectColor } from './palette'

describe('hexToRgbTriplet', () => {
  it('turns a hex colour into space-separated channels', () => {
    expect(hexToRgbTriplet('#3fd49a')).toBe('63 212 154')
    expect(hexToRgbTriplet('#000000')).toBe('0 0 0')
  })
})

describe('isPaletteName', () => {
  it('accepts the known palettes only', () => {
    expect(isPaletteName('colorblind')).toBe(true)
    expect(isPaletteName('blue')).toBe(false)
    expect(isPaletteName(null)).toBe(false)
  })
})

describe('palettes', () => {
  it('the colour-blind palette does not use the red/green pair', () => {
    const standard = colorsOf('standard')
    const colorblind = colorsOf('colorblind')
    expect(colorblind.profit).not.toBe(standard.profit)
    expect(colorblind.loss).not.toBe(standard.loss)
    expect(colorblind.profit).not.toBe(colorblind.loss)
  })

  it('adherence tones are distinct in each palette', () => {
    for (const name of ['standard', 'colorblind'] as const) {
      const tones = [respectColor('good', name), respectColor('ok', name), respectColor('work', name)]
      expect(new Set(tones).size).toBe(3)
    }
  })
})
