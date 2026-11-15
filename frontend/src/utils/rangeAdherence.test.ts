import { describe, expect, it } from 'vitest'
import { deviationCells, formatCards, formatEv, groupByPosition, groupBySpot, isReliable, respectOf, respectTone, sortSpots, type ScenarioRow } from './rangeAdherence'
import type { RangeAction } from './ranges'

describe('formatting', () => {
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

  it('hands the planned action and what was played to the hover card builder, for every hand of the range', () => {
    const played = [{ playedImmediate: 'check', playedActionId: null, playedResponse: null, kind: 'immediate' as const, count: 2 }]
    const seen: [string, number, number, number][] = []
    const cells = deviationCells(
      { hands: { AA: 1, KK: 2 }, handStats: { KK: { matches: 1, deviations: 2, played } } },
      [action(1, '#4caf50'), action(2, '#5b8def')],
      (hand, planned, stat) => {
        seen.push([hand, planned.id, stat.matches, stat.played?.[0]?.count ?? 0])
        return `tip ${hand}`
      },
    )
    expect(seen).toEqual([['AA', 1, 0, 0], ['KK', 2, 1, 2]])
    expect(cells.AA.tip).toBe('tip AA')
    expect(cells.KK.tip).toBe('tip KK')
  })
})

describe('the report', () => {
  const row = (scenarioId: number, spotId: number, name: string, stackBb: number, decisions: number, matches: number): ScenarioRow => ({
    scenarioId, spotId, name, format: '3max', heroPosition: 'BB', line: 'btn:raise', opponent: 'any', stackBb, decisions, matches, respect: decisions ? matches / decisions : 0, evMatch: null, evDeviation: null, topDeviation: null,
  })

  it('computes the respect of a group, nothing when it is empty', () => {
    expect(respectOf({ compared: 4, matches: 3 })).toBe(0.75)
    expect(respectOf({ compared: 0, matches: 0 })).toBeNull()
  })

  it('names the tone of a respect', () => {
    expect(respectTone(0.96)).toBe('good')
    expect(respectTone(0.9)).toBe('good')
    expect(respectTone(0.85)).toBe('ok')
    expect(respectTone(0.79)).toBe('work')
  })

  it('calls a figure reliable from 300 decisions', () => {
    expect(isReliable(299)).toBe(false)
    expect(isReliable(300)).toBe(true)
  })

  it('sorts spots by name, decisions, respect or deviations', () => {
    const spots = groupBySpot([row(1, 1, 'B', 10, 100, 90), row(2, 2, 'A', 10, 40, 10), row(3, 3, 'C', 10, 60, 45)])
    expect(sortSpots(spots, 'name', false).map((s) => s.name)).toEqual(['A', 'B', 'C'])
    expect(sortSpots(spots, 'decisions').map((s) => s.name)).toEqual(['B', 'C', 'A'])
    expect(sortSpots(spots, 'respect').map((s) => s.name)).toEqual(['B', 'C', 'A'])
    expect(sortSpots(spots, 'deviations').map((s) => s.name)).toEqual(['A', 'C', 'B'])
  })

  it('groups spots by position in seating order, 3-handed before heads-up', () => {
    const at = (spotId: number, format: 'hu' | '3max', position: string, decisions: number, matches: number): ScenarioRow => ({ ...row(spotId, spotId, 'S' + spotId, 10, decisions, matches), format, heroPosition: position })
    const groups = groupByPosition(groupBySpot([at(1, 'hu', 'BB', 10, 5), at(2, '3max', 'BB', 100, 90), at(3, '3max', 'BTN', 50, 25), at(4, '3max', 'BB', 100, 70)]))
    expect(groups.map((g) => g.key)).toEqual(['3max-BTN', '3max-BB', 'hu-BB'])
    expect(groups[1]).toMatchObject({ decisions: 200, matches: 160, respect: 0.8 })
    expect(groups[1].spots).toHaveLength(2)
  })

  it('groups the depths of a spot and puts the most deviations first', () => {
    const spots = groupBySpot([row(1, 10, 'BB vs BTN open', 10, 100, 90), row(2, 20, 'BTN first in', 15, 50, 20), row(3, 10, 'BB vs BTN open', 20, 100, 70)])
    expect(spots.map((s) => s.name)).toEqual(['BB vs BTN open', 'BTN first in'])
    expect(spots[0]).toMatchObject({ decisions: 200, matches: 160, deviations: 40, respect: 0.8 })
    expect(spots[0].depths.map((d) => d.stackBb)).toEqual([20, 10])
    expect(spots[1].deviations).toBe(30)
  })
})
