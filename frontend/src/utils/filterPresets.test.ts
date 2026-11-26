import { describe, expect, it } from 'vitest'
import { cleanName, MAX_PRESET_NAME, sanitizePresets, snapshotOf } from './filterPresets'

const base = { dateRange: 'month' as const, customDateFrom: '2026-01-01', customDateTo: '2026-01-31', buyIn: '5', position: 'all', result: 'all' }

describe('snapshotOf', () => {
  it('keeps the custom dates only for a custom period', () => {
    expect(snapshotOf(base)).toMatchObject({ dateRange: 'month', customDateFrom: null, customDateTo: null, buyIn: '5' })
    expect(snapshotOf({ ...base, dateRange: 'custom' })).toMatchObject({ dateRange: 'custom', customDateFrom: '2026-01-01', customDateTo: '2026-01-31' })
  })

  it('turns a single session into the whole period', () => {
    expect(snapshotOf({ ...base, dateRange: 'session' }).dateRange).toBe('all')
  })
})

describe('cleanName', () => {
  it('trims, squeezes spaces and cuts long names', () => {
    expect(cleanName('  Last   month  ')).toBe('Last month')
    expect(cleanName('   ')).toBeNull()
    expect(cleanName('x'.repeat(100))?.length).toBe(MAX_PRESET_NAME)
  })
})

describe('sanitizePresets', () => {
  it('drops what is not a preset and repairs unknown values', () => {
    const presets = sanitizePresets([
      { id: 'a', name: 'Nitro 5€', filters: { dateRange: 'week', customDateFrom: null, customDateTo: null, buyIn: 5, position: 'BTN', result: 'won' } },
      { id: 'b', name: '', filters: {} },
      { name: 'no id', filters: {} },
      'junk',
      { id: 'c', name: 'Odd', filters: { dateRange: 'forever' } },
    ])
    expect(presets.map((p) => p.id)).toEqual(['a', 'c'])
    expect(presets[1].filters).toMatchObject({ dateRange: 'all', buyIn: 'all', position: 'all', result: 'all' })
    expect(sanitizePresets(null)).toEqual([])
  })
})
