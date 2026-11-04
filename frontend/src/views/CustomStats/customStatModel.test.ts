import { describe, expect, it } from 'vitest'
import {
  cleanDefinition, copyOf, countLeaves, flagLabel, isSituationFlag, defaultLeaf, depthOf, emptyDefinition, humanizeFlag, parseBound, validateDefinition, type Cond,
} from './customStatModel'

const options = { flags: ['Vpip', 'Rfi'], limits: { nameChars: 10, depth: 3, leaves: 3, stats: 100 } }

describe('validateDefinition', () => {
  it('accepts the default definition once it is named', () => {
    const def = { ...emptyDefinition(), name: 'Mine' }
    expect(validateDefinition(def, options)).toBeNull()
  })

  it('refuses empty and too long names', () => {
    expect(validateDefinition(emptyDefinition(), options)).toBe('name')
    expect(validateDefinition({ ...emptyDefinition(), name: 'x'.repeat(11) }, options)).toBe('name')
  })

  it('refuses unknown flags, empty groups and impossible combinations', () => {
    const base = { ...emptyDefinition(), name: 'Mine' }
    expect(validateDefinition({ ...base, numerator: { type: 'flag', name: 'Nope' } }, options)).toBe('unknown_flag')
    expect(validateDefinition({ ...base, numerator: { type: 'and', items: [] } }, options)).toBe('empty_group')
    expect(validateDefinition({ ...base, numerator: { type: 'action', street: 'preflop', action: 'check' } }, options)).toBe('preflop_check')
    expect(validateDefinition({ ...base, numerator: { type: 'betSizePercentPot', street: 'preflop', range: {} } }, options)).toBe('preflop_bet_size')
  })

  it('checks ranges', () => {
    const base = { ...emptyDefinition(), name: 'Mine' }
    expect(validateDefinition({ ...base, numerator: { type: 'raiseSizeBb', range: { min: 5, max: 2 } } }, options)).toBe('range_order')
    expect(validateDefinition({ ...base, numerator: { type: 'limpersBefore', range: { max: 9 } } }, options)).toBe('range_bounds')
    expect(validateDefinition({ ...base, filters: { ...base.filters, stackBb: { min: -1 } } }, options)).toBe('range_bounds')
  })

  it('limits leaves and depth across both sides', () => {
    const leaf = defaultLeaf('flag')
    const base = { ...emptyDefinition(), name: 'Mine' }
    const four: Cond = { type: 'or', items: [leaf, leaf, leaf, leaf] }
    expect(validateDefinition({ ...base, numerator: four }, options)).toBe('leaves')
    expect(validateDefinition({ ...base, numerator: { type: 'or', items: [leaf, leaf] }, denominator: { type: 'or', items: [leaf, leaf] } }, options)).toBe('leaves')
    const deep: Cond = { type: 'not', item: { type: 'not', item: { type: 'not', item: leaf } } }
    expect(depthOf(deep)).toBe(4)
    expect(validateDefinition({ ...base, numerator: deep }, options)).toBe('depth')
  })
})

describe('helpers', () => {
  it('counts leaves through groups and negations', () => {
    expect(countLeaves({ type: 'and', items: [defaultLeaf('flag'), { type: 'not', item: defaultLeaf('action') }] })).toBe(2)
  })

  it('parses range bounds', () => {
    expect(parseBound('')).toBeNull()
    expect(parseBound(' 2,5 ')).toBe(2.5)
    expect(parseBound('abc')).toBeUndefined()
  })

  it('makes flag names readable', () => {
    expect(humanizeFlag('FoldTo3BetOpp')).toBe('Fold To 3 Bet Opp')
    expect(humanizeFlag('Vpip')).toBe('Vpip')
  })

  it('tells situations from actions and shortens copies', () => {
    expect(isSituationFlag('RfiOpp')).toBe(true)
    expect(isSituationFlag('Rfi')).toBe(false)
    expect(flagLabel('FoldTo3BetOpp')).toBe('Fold To 3 Bet')
    expect(copyOf({ ...emptyDefinition(), name: 'abcdefghij' }, '(copy)', 12).name).toBe('abcdefghij (')
    expect(validateDefinition({ ...emptyDefinition(), name: 'Mine', numerator: { type: 'inPosition' } }, options)).toBeNull()
  })

  it('drops an empty stack range and trims the name', () => {
    const cleaned = cleanDefinition({ ...emptyDefinition(), name: '  Mine ', filters: { positions: ['BTN'], tableSizes: [], stackBb: {} } })
    expect(cleaned.name).toBe('Mine')
    expect(cleaned.filters).toEqual({ positions: ['BTN'], tableSizes: [] })
  })
})
