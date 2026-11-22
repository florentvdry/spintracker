import { describe, expect, it } from 'vitest'
import { MULTIPLIER_PRESETS } from '@/views/VarianceSimulator/multiplierPresets'
import { defaultPoolEvTables, fromStoredTables, meanMultiplier, toStoredTables } from './poolEv'

describe('poolEv tables', () => {
  it('seeds the rooms from the simulator presets without sharing their rows', () => {
    const tables = defaultPoolEvTables()
    expect(tables.winamax).toEqual(MULTIPLIER_PRESETS.winamax)
    expect(tables.winamax[0]).not.toBe(MULTIPLIER_PRESETS.winamax[0])
    expect(tables.unibet).toEqual([])
  })

  it('the preset means match the published x2.79 average', () => {
    const tables = defaultPoolEvTables()
    expect(meanMultiplier(tables.winamax)).toBeCloseTo(2.79, 1)
    expect(meanMultiplier(tables.betclic)).toBeCloseTo(2.79, 1)
  })

  it('ignores unusable lines in the mean', () => {
    expect(meanMultiplier([{ multiplier: '2', weight: '0' }, { multiplier: 'x', weight: '5' }])).toBeNull()
    expect(meanMultiplier([{ multiplier: '2', weight: '1' }, { multiplier: '4', weight: '1' }])).toBe(3)
  })

  it('round-trips through the stored form and drops empty tables', () => {
    const stored = toStoredTables({ winamax: [{ multiplier: '2', weight: '60' }], unibet: [] })
    expect(stored).toEqual({ winamax: [{ multiplier: 2, weight: 60 }] })
    expect(fromStoredTables(stored)).toEqual({ winamax: [{ multiplier: '2', weight: '60' }] })
    expect(fromStoredTables(null)).toBeNull()
    expect(fromStoredTables({})).toBeNull()
  })
})
