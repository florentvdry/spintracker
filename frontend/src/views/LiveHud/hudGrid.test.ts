import { describe, expect, it } from 'vitest'
import {
  buildCellView,
  cellRequests,
  defaultColors,
  figureKey,
  newGrid,
  pickColor,
  readFigure,
  requestsOf,
  resolveContext,
  sanitizeContext,
  sanitizeGrid,
  sanitizeHudLayout,
  statCell,
  validateLayout,
  type HudFigures,
  type HudGrid,
  type HudGridCell,
  type HudLayout,
} from './hudGrid'

const baselines = { VPIP: { target: 47, tolerance: 8 } }

const cell = (grid: HudGrid, row: number, col: number, content = statCell('preflop', 'VPIP')): HudGridCell => {
  const c: HudGridCell = { id: `c${row}-${col}`, row, col, rowSpan: 1, colSpan: 1, content, style: {} }
  grid.cells.push(c)
  return c
}

describe('resolveContext', () => {
  it('lets the most specific level win, field by field', () => {
    const grid = newGrid('g', 2, 2)
    grid.context = { column: 'tot', stack: { label: 'all', buckets: ['13+'] } }
    grid.cols[1].context = { column: 'btn' }
    grid.rows[1].context = { column: 'sb_hu' }
    const own = cell(grid, 1, 1, statCell('preflop', 'VPIP', { column: 'bb_hu' }))
    expect(resolveContext(grid, own)).toEqual({ column: 'bb_hu', stack: { label: 'all', buckets: ['13+'] } })
    own.content = statCell('preflop', 'VPIP')
    expect(resolveContext(grid, own).column).toBe('sb_hu')
    grid.rows[1].context = undefined
    expect(resolveContext(grid, own).column).toBe('btn')
    grid.cols[1].context = undefined
    expect(resolveContext(grid, own).column).toBe('tot')
  })

  it('clears an inherited value with null and leaves it alone with undefined', () => {
    const grid = newGrid('g', 1, 1)
    grid.context = { column: 'tot', stack: { label: 'x', buckets: ['13+'] } }
    grid.rows[0].context = { stack: null }
    const c = cell(grid, 0, 0)
    expect(resolveContext(grid, c)).toEqual({ column: 'tot', stack: null })
  })
})

describe('stack groups', () => {
  const figures: HudFigures = {
    [figureKey('preflop', 'VPIP', null, '13+')]: { pct: 100, num: 1, den: 1 },
    [figureKey('preflop', 'VPIP', null, '11-13')]: { pct: 0, num: 0, den: 9 },
  }
  const stack = { label: '11bb+', buckets: ['13+', '11-13'] }

  it('adds counts and works the percentage out again', () => {
    // 1 of 10, not the average of 100% and 0%.
    expect(readFigure(figures, 'preflop', 'VPIP', { column: null, stack })).toEqual({ pct: 10, num: 1, den: 10 })
  })

  it('has no percentage without opportunities', () => {
    expect(readFigure({}, 'preflop', 'VPIP', { column: null, stack }).pct).toBeNull()
  })

  it('counts hands by adding them', () => {
    const hands: HudFigures = {
      [figureKey('meta', 'hands', 'sb_hu', '13+')]: { pct: null, num: 4, den: 4 },
      [figureKey('meta', 'hands', 'sb_hu', '11-13')]: { pct: null, num: 3, den: 3 },
    }
    expect(readFigure(hands, 'meta', 'hands', { column: 'sb_hu', stack }).num).toBe(7)
  })
})

describe('colors', () => {
  const rule = {
    mode: 'bands' as const,
    minSample: 5,
    bands: [
      { from: 0, to: 30, color: '#111111' },
      { from: 30, to: 100, color: '#222222', bold: true },
    ],
  }

  it('picks the band holding the value, the last one up to 100 included', () => {
    expect(pickColor(rule, 29.9, 10, {})).toEqual({ color: '#111111', bold: false })
    expect(pickColor(rule, 30, 10, {})).toEqual({ color: '#222222', bold: true })
    expect(pickColor(rule, 100, 10, {})?.color).toBe('#222222')
  })

  it('judges nothing on a small sample or without a value', () => {
    expect(pickColor(rule, 50, 4, {})).toBeNull()
    expect(pickColor(rule, null, 50, {})).toBeNull()
    expect(pickColor({ ...rule, mode: 'none' }, 50, 50, {})).toBeNull()
  })

  it('follows a baseline: below, in and above the range', () => {
    const baseline = { mode: 'baseline' as const, bands: [], minSample: 0, baselineKey: 'VPIP' }
    expect(pickColor(baseline, 38.9, 10, baselines)?.color).toBe('#8db4ff')
    expect(pickColor(baseline, 39, 10, baselines)?.color).toBe('#e6e9ef')
    expect(pickColor(baseline, 55, 10, baselines)?.color).toBe('#e6e9ef')
    expect(pickColor(baseline, 55.1, 10, baselines)?.color).toBe('#ffa766')
  })

  it('colours a cell by another stat when asked', () => {
    const grid = newGrid('g', 1, 1)
    const stat = statCell('preflop', 'PFR')
    if (stat.kind === 'stat') {
      stat.colors = { mode: 'bands', minSample: 1, bands: [{ from: 0, to: 100, color: '#abcdef' }], sourceStat: { section: 'preflop', label: 'VPIP' } }
    }
    const c = cell(grid, 0, 0, stat)
    const noSource: HudFigures = { [figureKey('preflop', 'PFR', null, null)]: { pct: 10, num: 1, den: 10 } }
    expect(buildCellView(grid, c, noSource, { name: 'x' }, {}).fg).toBeUndefined()
    const withSource: HudFigures = { ...noSource, [figureKey('preflop', 'VPIP', null, null)]: { pct: 40, num: 4, den: 10 } }
    expect(buildCellView(grid, c, withSource, { name: 'x' }, {}).fg).toBe('#abcdef')
  })
})

describe('requests', () => {
  it('asks once for a figure shown many times, per bucket of a group, and for the colour source', () => {
    const grid = newGrid('g', 2, 2)
    grid.rows[0].context = { stack: { label: 'a', buckets: ['13+', '11-13'] } }
    cell(grid, 0, 0)
    cell(grid, 0, 1)
    const colored = statCell('preflop', 'PFR')
    if (colored.kind === 'stat') colored.colors = { mode: 'bands', bands: [], minSample: 0, sourceStat: { section: 'postflop', label: 'wtsd' } }
    cell(grid, 1, 0, colored)
    const popup = newGrid('p', 1, 1)
    cell(popup, 0, 0)
    const layout: HudLayout = { grids: [grid], popups: [popup] }
    const keys = requestsOf(layout).map((r) => figureKey(r.section, r.label, r.column, r.bucket))
    expect(keys).toEqual(['preflop:VPIP::13+', 'preflop:VPIP::11-13', 'preflop:PFR::', 'postflop:wtsd::', 'preflop:VPIP::'])
    expect(cellRequests(grid, grid.cells[2])).toHaveLength(2)
  })
})

describe('sanitizing', () => {
  it('drops colours that are not hexadecimal', () => {
    const grid = newGrid('g', 1, 1)
    const raw = JSON.parse(
      JSON.stringify({
        ...grid,
        cells: [{ id: 'a', row: 0, col: 0, rowSpan: 1, colSpan: 1, content: { kind: 'text', text: 'x' }, style: { fg: 'red;background:url(http://evil)', bg: '#12345' } }],
      }),
    )
    expect(sanitizeGrid(raw, new Set())?.cells[0].style).toEqual({})
  })

  it('removes overlapping and out-of-range cells', () => {
    const raw = {
      id: 'g',
      rows: [{}, {}],
      cols: [{}, {}],
      cells: [
        { id: 'a', row: 0, col: 0, rowSpan: 2, colSpan: 2, content: { kind: 'text', text: 'big' } },
        { id: 'a', row: 1, col: 1, content: { kind: 'text', text: 'overlap' } },
        { id: 'b', row: 5, col: 0, content: { kind: 'text', text: 'out' } },
      ],
    }
    expect(sanitizeGrid(raw, new Set())?.cells).toHaveLength(1)
  })

  it('survives garbage', () => {
    for (const garbage of [null, 3, 'x', [], { grids: 'no' }, { grids: [null, 1, { rows: 'x' }] }]) {
      expect(() => sanitizeHudLayout(garbage)).not.toThrow()
    }
  })

  it('drops links to popups that do not exist', () => {
    const grid = newGrid('g', 1, 1)
    const c = cell(grid, 0, 0)
    c.popupId = 'gone'
    const layout = sanitizeHudLayout(JSON.parse(JSON.stringify({ grids: [grid], popups: [] })))
    expect(layout?.grids[0].cells[0].popupId).toBeUndefined()
  })
})

describe('validateLayout', () => {
  it('reports an unknown stat, an unknown column and an empty grid', () => {
    const grid = newGrid('g', 1, 2)
    cell(grid, 0, 0, statCell('preflop', 'Nope'))
    cell(grid, 0, 1, statCell('preflop', 'VPIP', { column: 'moon' }))
    const empty = newGrid('e', 1, 1)
    const issues = validateLayout({ grids: [grid, empty], popups: [] }, new Set(['preflop:VPIP']))
    expect(issues.map((i) => i.code).sort()).toEqual(['emptyGrid', 'unknownColumn', 'unknownStat'])
  })

  it('reports too many figures', () => {
    const grid = newGrid('g', 30, 30)
    grid.rows.forEach((r) => (r.context = { stack: { label: 'x', buckets: ['13+', '11-13', '9-11', '7-9'] } }))
    for (let r = 0; r < 30; r++) for (let c = 0; c < 30; c++) cell(grid, r, c, statCell('postflop', `s${r}-${c}`))
    expect(validateLayout({ grids: [grid], popups: [] }, null).some((i) => i.code === 'tooManyStats')).toBe(true)
  })
})

describe('defaults', () => {
  it('has no colour rule by default', () => {
    expect(defaultColors().mode).toBe('none')
  })
})

describe('stack depths of the first versions', () => {
  it('point at the current depths they overlap', () => {
    expect(sanitizeContext({ stack: { label: '13+', buckets: ['13+'] } })?.stack?.buckets).toEqual(['20+', '16-20', '13-16'])
    expect(sanitizeContext({ stack: { label: '9-11', buckets: ['9-11', '11-13'] } })?.stack?.buckets).toEqual(['10-13', '8-10'])
    expect(sanitizeContext({ stack: { label: '16-20', buckets: ['16-20'] } })?.stack?.buckets).toEqual(['16-20'])
  })

  it('are dropped when no current depth covers them', () => {
    expect(sanitizeContext({ stack: { label: '0-3', buckets: ['0-3'] } })).toBeUndefined()
  })
})
