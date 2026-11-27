import { describe, expect, it } from 'vitest'
import { equityAt, formatAllInEv, formatEquity, streetOf, type PlayerEquities } from './replayerEquity'

const hero: PlayerEquities = { name: 'Hero', isHero: true, equities: { preflop: 62.4, flop: null, turn: 70, river: null } }

describe('streetOf', () => {
  it('reads the street names of the replay, whatever the case', () => {
    expect(streetOf('Preflop')).toBe('preflop')
    expect(streetOf('RIVER')).toBe('river')
    expect(streetOf('showdown')).toBeNull()
    expect(streetOf(undefined)).toBeNull()
  })
})

describe('equityAt', () => {
  it('is the equity of the street, or null while it is unknown', () => {
    expect(equityAt(hero, 'preflop')).toBeCloseTo(62.4)
    expect(equityAt(hero, 'flop')).toBeNull()
    expect(equityAt(undefined, 'preflop')).toBeNull()
  })
})

describe('formatting', () => {
  it('rounds the equity to a whole percentage', () => {
    expect(formatEquity(62.4)).toBe('62 %')
  })

  it('signs the all-in value in big blinds', () => {
    expect(formatAllInEv(2.5)).toBe('+2.5 bb')
    expect(formatAllInEv(-1)).toBe('−1.0 bb')
    expect(formatAllInEv(0)).toBe('0.0 bb')
  })
})
