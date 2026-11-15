import { describe, expect, it } from 'vitest'
import { HAND_COUNT } from '@/utils/ranges'
import { exampleRangesFile, expandToken, expandTokens } from './rangesTour'

describe('shorthand tokens', () => {
  it('expands pairs, kickers and single hands', () => {
    expect(expandToken('99+')).toEqual(['AA', 'KK', 'QQ', 'JJ', 'TT', '99'])
    expect(expandToken('KTo+')).toEqual(['KQo', 'KJo', 'KTo'])
    expect(expandToken('A9s+')).toEqual(['AKs', 'AQs', 'AJs', 'ATs', 'A9s'])
    expect(expandToken('76s')).toEqual(['76s'])
  })

  it('removes duplicates across tokens', () => {
    expect(expandTokens(['QQ+', 'KK'])).toEqual(['AA', 'KK', 'QQ'])
  })
})

describe('example ranges file', () => {
  const file = JSON.parse(exampleRangesFile())

  it('uses the import format with complete ranges', () => {
    expect(file.format).toBe('spintracker-ranges')
    expect(file.version).toBe(1)
    for (const spot of file.spots) for (const scenario of spot.scenarios) expect(Object.keys(scenario.hands)).toHaveLength(HAND_COUNT)
  })

  it('only refers to actions it defines', () => {
    const labels = new Set(file.actions.map((a: { label: string }) => a.label))
    for (const spot of file.spots) for (const scenario of spot.scenarios) for (const label of Object.values<string>(scenario.hands)) expect(labels.has(label)).toBe(true)
  })

  it('covers several situations and depths with one line per spot', () => {
    expect(file.spots.length).toBeGreaterThan(3)
    expect(new Set(file.spots.map((spot: { name: string }) => spot.name)).size).toBe(file.spots.length)
    expect(file.spots[0].scenarios.map((s: { stackBb: number }) => s.stackBb)).toEqual([8, 12, 20])
  })

  it('shoves strong hands and folds weak ones', () => {
    const hands = file.spots[0].scenarios[0].hands
    expect(hands.AA).toBe('Shove')
    expect(hands['72o']).toBe('Fold')
  })
})
