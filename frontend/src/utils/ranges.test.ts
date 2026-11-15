import { describe, expect, it } from 'vitest'
import {
  actionStats,
  allScenarioIds,
  checkState,
  buildLine,
  changedHands,
  COLOR_SHADES,
  contrast,
  comboCount,
  defaultName,
  groupSpots,
  groupsOfFormat,
  countByFormat,
  handAt,
  HAND_CLASSES,
  lineSummary,
  overviewColumns,
  paint,
  beginStroke,
  strokePaint,
  rectBetween,
  redo,
  rowOf,
  shortName,
  startHistory,
  textColor,
  toggleScenarios,
  TOTAL_COMBOS,
  undo,
  type HandMap,
  type SpotSummary,
} from './ranges'

const all = (actionId: number): HandMap => Object.fromEntries(HAND_CLASSES.map((h) => [h, actionId]))

describe('the grid', () => {
  it('lists 169 classes whose combos make 1326', () => {
    expect(HAND_CLASSES).toHaveLength(169)
    expect(new Set(HAND_CLASSES).size).toBe(169)
    expect(HAND_CLASSES.reduce((sum, h) => sum + comboCount(h), 0)).toBe(TOTAL_COMBOS)
  })

  it('puts pairs on the diagonal, suited above and offsuit below', () => {
    expect(handAt(0, 0)).toBe('AA')
    expect(handAt(0, 1)).toBe('AKs')
    expect(handAt(1, 0)).toBe('AKo')
    expect(handAt(12, 12)).toBe('22')
  })
})

describe('painting', () => {
  it('paints a brush cell, a whole row and a rectangle', () => {
    expect(paint(all(1), ['AKs'], 2).AKs).toBe(2)
    expect(rowOf('KQs')).toHaveLength(13)
    expect(rowOf('KQs')[0]).toBe('AKo')
    const rect = rectBetween('AA', 'KQs')
    expect(rect.sort()).toEqual(['AA', 'AKs', 'AQs', 'AKo', 'KK', 'KQs'].sort())
    const painted = paint(all(1), rect, 3)
    expect(changedHands(painted, all(1))).toHaveLength(6)
  })

  it('does not modify the range it paints', () => {
    const base = all(1)
    paint(base, ['AA'], 2)
    expect(base.AA).toBe(1)
  })

  it('undoes and redoes a stroke as one step', () => {
    let history = startHistory(all(1))
    history = beginStroke(history)
    history = strokePaint(history, ['AA'], 2)
    history = strokePaint(history, ['KK'], 2)
    history = beginStroke(history)
    history = strokePaint(history, ['QQ'], 3)
    history = undo(history)
    expect(history.present.QQ).toBe(1)
    expect(history.present.KK).toBe(2)
    history = redo(history)
    expect(history.present.QQ).toBe(3)
    history = undo(undo(history))
    expect(history.present.AA).toBe(1)
    expect(history.present.KK).toBe(1)
  })

  it('skips strokes that changed nothing when undoing', () => {
    let history = startHistory(all(1))
    history = beginStroke(history)
    history = strokePaint(history, ['AA'], 2)
    history = beginStroke(history)
    history = strokePaint(history, ['AA'], 2)
    expect(undo(history).present.AA).toBe(1)
  })

  it('counts combos and shares per action', () => {
    const hands = { ...all(1), AA: 2, AKs: 2 }
    const stats = actionStats(hands)
    expect(stats.get(2)?.combos).toBe(10)
    expect((stats.get(1)?.combos ?? 0) + 10).toBe(TOTAL_COMBOS)
    expect(stats.get(2)?.percent).toBeCloseTo((10 / 1326) * 100)
  })
})

describe('colours', () => {
  it('keeps the text readable on every proposed shade', () => {
    for (const shade of COLOR_SHADES) expect(contrast(shade, textColor(shade))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('scenarios', () => {
  it('builds the line from the seats before the hero', () => {
    expect(buildLine('3max', 'BB', { BTN: 'fold', SB: 'call' })).toBe('btn:fold,sb:call')
    expect(buildLine('3max', 'BTN', {})).toBe('')
    expect(buildLine('hu', 'BB', { SB: 'raise' })).toBe('sb:raise')
    expect(lineSummary('btn:fold,sb:call')).toBe('BTN fold → SB limp')
  })

  it('names scenarios like the backend', () => {
    expect(defaultName('3max', 'BB', 'btn:fold,sb:call', 'reg')).toBe('BB vs SB limp · Reg')
    expect(defaultName('3max', 'BTN', '', 'any')).toBe('BTN first in')
    expect(defaultName('hu', 'BB', 'sb:raise', 'any')).toBe('BB (HU) vs SB open')
    expect(defaultName('3max', 'BB', 'btn:raise,sb:all-in', 'any')).toBe('BB vs BTN open, SB shove')
  })

  it('groups spots by format and position in table order', () => {
    const spot = (id: number, format: SpotSummary['format'], hero: SpotSummary['heroPosition'], line: string): SpotSummary => ({
      id, name: `s${id}`, format, heroPosition: hero, line, lineSizes: null, opponent: 'any', studyOnly: false, scenarios: [],
    })
    const groups = groupSpots([spot(1, 'hu', 'BB', 'sb:raise'), spot(2, '3max', 'BB', 'btn:fold,sb:call'), spot(3, '3max', 'BTN', '')])
    expect(groups.map((g) => g.key)).toEqual(['3max-BTN', '3max-BB', 'hu-BB'])
    expect(shortName({ format: '3max', heroPosition: 'BB', line: 'btn:fold,sb:call', opponent: 'reg' })).toBe('vs SB limp (Reg)')
    expect(shortName({ format: '3max', heroPosition: 'BTN', line: '', opponent: 'any' })).toBe('first in')
  })
})


describe('format switch', () => {
  const spot = (id: number, format: SpotSummary['format'], hero: SpotSummary['heroPosition'], line: string): SpotSummary => ({
    id, name: `s${id}`, format, heroPosition: hero, line, lineSizes: null, opponent: 'any', studyOnly: false, scenarios: [],
  })
  const spots = [spot(1, 'hu', 'BB', 'sb:raise'), spot(2, '3max', 'BB', 'btn:fold,sb:call'), spot(3, '3max', 'BTN', ''), spot(4, '3max', 'BB', 'btn:raise')]

  it('keeps only the groups of the chosen format, in table order', () => {
    expect(groupsOfFormat(groupSpots(spots), '3max').map((g) => g.key)).toEqual(['3max-BTN', '3max-BB'])
    expect(groupsOfFormat(groupSpots(spots), 'hu').map((g) => g.key)).toEqual(['hu-BB'])
  })

  it('counts the spots of each format', () => {
    expect(countByFormat(spots)).toEqual({ '3max': 3, hu: 1 })
    expect(countByFormat([])).toEqual({ '3max': 0, hu: 0 })
  })
})

describe('choosing ranges to export', () => {
  const withDepths = (id: number, format: SpotSummary['format'], hero: SpotSummary['heroPosition'], line: string, depths: number[]): SpotSummary => ({
    id, name: `s${id}`, format, heroPosition: hero, line, lineSizes: null, opponent: 'any', studyOnly: false,
    scenarios: depths.map((stackBb, i) => ({ id: id * 10 + i, stackBb })),
  })
  const spots = [withDepths(1, '3max', 'BTN', '', [25, 20]), withDepths(2, '3max', 'SB', 'btn:fold', [20, 10]), withDepths(3, 'hu', 'SB', '', [6])]

  it('selects every depth by default', () => {
    expect([...allScenarioIds(spots)].sort((a, b) => a - b)).toEqual([10, 11, 20, 21, 30])
  })

  it('reports none, some or all of a set of depths', () => {
    expect(checkState(new Set([10]), [10, 11])).toBe('some')
    expect(checkState(new Set([10, 11]), [10, 11])).toBe('all')
    expect(checkState(new Set(), [10, 11])).toBe('none')
  })

  it('toggling selects a partial set and clears a complete one', () => {
    expect([...toggleScenarios(new Set([10]), [10, 11])].sort()).toEqual([10, 11])
    expect(toggleScenarios(new Set([10, 11, 20]), [10, 11])).toEqual(new Set([20]))
  })

  it('does not change the set it is given', () => {
    const selected = new Set([10])
    toggleScenarios(selected, [10, 11])
    expect(selected).toEqual(new Set([10]))
  })

  describe('the overview columns', () => {
    it('has a column per spot of the format, in the order of the tree', () => {
      expect(overviewColumns(spots, '3max').map((c) => c.spot.id)).toEqual([1, 2])
    })

    it('lists the depths of each spot on its own, deepest first, without padding', () => {
      const columns = overviewColumns([withDepths(1, '3max', 'BTN', '', [10, 25, 20]), withDepths(2, '3max', 'SB', 'btn:fold', [8])], '3max')
      expect(columns.map((c) => c.depths.map((d) => d.stackBb))).toEqual([[25, 20, 10], [8]])
    })

    it('is empty for a format with no spot', () => {
      expect(overviewColumns([spots[0]], 'hu')).toEqual([])
    })
  })
})
