import { describe, expect, it } from 'vitest'
import { equitiesAt, formatAllInEv } from './replayEquity'

const actions = [
  { type: 'DealCards', street: 'Preflop', equity: { a: 60, b: 40 } },
  { type: 'Raise' },
  { type: 'DealCards', street: 'Flop', equity: { a: 20, b: 80 } },
  { type: 'Check' },
  { type: 'DealCards', street: 'Turn' },
]

describe('equitiesAt', () => {
  it('takes the equities of the last deal that has some', () => {
    expect(equitiesAt(actions, 1)).toEqual({ a: 60, b: 40 })
    expect(equitiesAt(actions, 2)).toEqual({ a: 60, b: 40 })
    expect(equitiesAt(actions, 3)).toEqual({ a: 20, b: 80 })
    expect(equitiesAt(actions, 5)).toEqual({ a: 20, b: 80 })
  })

  it('is empty before the first deal and for hands without equities', () => {
    expect(equitiesAt(actions, 0)).toBeNull()
    expect(equitiesAt([{ type: 'Fold' }], 1)).toBeNull()
    expect(equitiesAt([], 3)).toBeNull()
  })
})

describe('formatAllInEv', () => {
  it('signs and rounds to one decimal', () => {
    expect(formatAllInEv(1.84)).toBe('+1.8')
    expect(formatAllInEv(-0.36)).toBe('-0.4')
    expect(formatAllInEv(0)).toBe('0.0')
  })
})
