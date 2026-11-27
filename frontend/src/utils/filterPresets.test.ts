import { describe, expect, it } from 'vitest'
import { makePreset, validPresetName, type FilterPresetValues } from './filterPresets'

const values: FilterPresetValues = {
  dateRange: 'week',
  customDateFrom: null,
  customDateTo: null,
  selectedSession: null,
  buyIn: '5',
  position: 'all',
  result: 'all',
}

describe('validPresetName', () => {
  it('trims the name and rejects an empty or very long one', () => {
    expect(validPresetName('  Sundays  ')).toBe('Sundays')
    expect(validPresetName('   ')).toBeNull()
    expect(validPresetName('x'.repeat(41))).toBeNull()
  })
})

describe('makePreset', () => {
  it('keeps the filter values and copies them, so later changes do not leak into the preset', () => {
    const preset = makePreset('Sundays', values, 'p1')
    values.buyIn = '20'
    expect(preset.values.buyIn).toBe('5')
    expect(preset).toEqual({ id: 'p1', name: 'Sundays', values: { ...values, buyIn: '5' } })
  })
})
