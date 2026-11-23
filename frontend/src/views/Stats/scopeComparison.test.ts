import { describe, expect, it } from 'vitest'
import { comparisonRows } from './scopeComparison'

const row = (stat: string, tot: number, den: number) => ({ stat, tot, samples: { tot: { num: 1, den } } })

describe('comparisonRows', () => {
  it('lines up the same stat across the hero, the regulars and the fish', () => {
    const rows = comparisonRows({
      me: { preflop: [row('VPIP', 62.5, 120), row('PFR', 40, 120)] },
      reg: { preflop: [row('VPIP', 55, 300), row('PFR', 45, 300)] },
      fish: { preflop: [row('VPIP', 71, 80), row('PFR', 20, 80)] },
    })
    expect(rows.map((r) => r.stat)).toEqual(['VPIP', 'PFR'])
    expect(rows[0].figures.me).toEqual({ value: 62.5, sample: 120 })
    expect(rows[0].figures.fish).toEqual({ value: 71, sample: 80 })
  })

  it('shows no figure for a scope without data, never a zero', () => {
    const rows = comparisonRows({ me: { preflop: [row('VPIP', 62.5, 120)] }, reg: null, fish: { preflop: [row('VPIP', 0, 0)] } })
    expect(rows[0].figures.reg).toEqual({ value: null, sample: 0 })
    expect(rows[0].figures.fish.value).toBeNull()
  })

  it('keeps every stat that appears in any scope', () => {
    const rows = comparisonRows({ me: { preflop: [row('VPIP', 1, 10)] }, reg: { preflop: [row('3-Bet', 5, 40)] }, fish: null })
    expect(rows.map((r) => r.stat)).toEqual(['VPIP', '3-Bet'])
  })
})
