import { describe, expect, it } from 'vitest'
import { deviationCells, formatCards, formatEv, periodStart, sortScenarios, type ScenarioRow } from './rangeAdherence'
import type { RangeAction } from './ranges'

const row = (name: string, decisions: number, respect: number, evMatch: number | null = null): ScenarioRow => ({
  scenarioId: decisions,
  spotId: 1,
  name,
  format: '3max',
  heroPosition: 'BTN',
  line: '',
  opponent: 'any',
  stackBb: 15,
  decisions,
  matches: 0,
  respect,
  evMatch,
  evDeviation: null,
  topDeviation: null,
})

describe('sorting the scenario table', () => {
  const rows = [row('B', 10, 0.9, 0.1), row('A', 30, 0.5, -0.2), row('C', 20, 0.7)]

  it('puts the busiest scenario first by default', () => {
    expect(sortScenarios(rows, 'decisions').map((r) => r.name)).toEqual(['A', 'C', 'B'])
  })

  it('sorts names alphabetically and figures from the highest, in both directions', () => {
    expect(sortScenarios(rows, 'name', false).map((r) => r.name)).toEqual(['A', 'B', 'C'])
    expect(sortScenarios(rows, 'respect').map((r) => r.name)).toEqual(['B', 'C', 'A'])
    expect(sortScenarios(rows, 'respect', false).map((r) => r.name)).toEqual(['A', 'C', 'B'])
  })

  it('leaves a missing figure last', () => {
    expect(sortScenarios(rows, 'evMatch').map((r) => r.name)).toEqual(['B', 'A', 'C'])
  })
})

describe('formatting', () => {
  it('starts a period before today and leaves "all" open', () => {
    expect(periodStart('7', new Date('2026-11-14T12:00:00Z'))).toBe('2026-11-07')
    expect(periodStart('30', new Date('2026-11-14T12:00:00Z'))).toBe('2026-10-15')
    expect(periodStart('all', new Date())).toBeNull()
  })

  it('writes the cards with suit symbols', () => {
    expect(formatCards('Ad 8c')).toBe('A♦8♣')
    expect(formatCards(null)).toBe('')
  })

  it('signs the figures in big blinds', () => {
    expect(formatEv(0.213, 'en')).toBe('+0.21 bb')
    expect(formatEv(-1, 'en')).toBe('-1.00 bb')
    expect(formatEv(null, 'en')).toBe('–')
  })
})

describe('the deviation grid', () => {
  const action = (id: number, color: string): RangeAction => ({ id, label: `a${id}`, color, immediate: 'raise', sizeValue: null, sizeUnit: null, response: 'none', sortOrder: id, usedHands: 0 })

  it('dims hands that were followed and flags the others with their count', () => {
    const cells = deviationCells({ hands: { AA: 1, KK: 2 }, handStats: { AA: { matches: 3, deviations: 0 }, KK: { matches: 1, deviations: 2 } } }, [action(1, '#4caf50'), action(2, '#5b8def')])
    expect(cells.AA).toMatchObject({ dim: true })
    expect(cells.KK).toMatchObject({ outline: 'deviation', badge: 2 })
    expect(cells.AA.outline).toBeUndefined()
  })
})
