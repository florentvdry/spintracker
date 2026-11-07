import { describe, expect, it } from 'vitest'
import { expectedMultiplier } from '@/utils/varianceSimulator'
import { MULTIPLIER_PRESETS, type PresetKey } from './multiplierPresets'

const SEVEN_PERCENT_RAKE_MEAN = 3 * 0.93

describe('multiplier presets', () => {
  it.each(Object.keys(MULTIPLIER_PRESETS) as PresetKey[])('%s frequencies add up to 100%%', (key) => {
    const total = MULTIPLIER_PRESETS[key].reduce((sum, row) => sum + Number(row.weight), 0)
    expect(total).toBeCloseTo(100, 4)
  })

  it.each(Object.keys(MULTIPLIER_PRESETS) as PresetKey[])('%s pays back the three buy-ins minus a 7%% rake', (key) => {
    const mean = expectedMultiplier(MULTIPLIER_PRESETS[key].map((row) => ({ multiplier: Number(row.multiplier), weight: Number(row.weight) })))
    expect(mean).toBeCloseTo(SEVEN_PERCENT_RAKE_MEAN, 2)
  })
})
