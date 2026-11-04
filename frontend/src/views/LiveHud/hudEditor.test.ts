import { describe, expect, it } from 'vitest'
import { applyEdit, dragTo, emptyHistory, snapPosition, MAX_HISTORY, record, redo, undo, abbreviationOf, type EditorDoc } from './hudEditor'
import { cellAt, newGrid, statCell, type HudGrid } from './hudGrid'

const docWith = (grid: HudGrid): EditorDoc => ({ layout: { grids: [grid], popups: [] }, seats: { '+1': { [grid.id]: { x: 0.1, y: 0.1 } }, '+2': {} } })
const gridOf = (doc: EditorDoc) => doc.layout.grids[0]

describe('dropping content', () => {
  it('creates a cell where there was none and replaces the content where there is one', () => {
    const doc = docWith(newGrid('g', 2, 2))
    const id = gridOf(doc).id
    const withStat = applyEdit(doc, { type: 'dropContent', gridId: id, row: 1, col: 0, content: statCell('preflop', 'VPIP') })
    expect(cellAt(gridOf(withStat), 1, 0)?.content).toMatchObject({ kind: 'stat', label: 'VPIP' })
    const replaced = applyEdit(withStat, { type: 'dropContent', gridId: id, row: 1, col: 0, content: { kind: 'text', text: 'x' } })
    expect(gridOf(replaced).cells).toHaveLength(1)
    expect(cellAt(gridOf(replaced), 1, 0)?.content).toEqual({ kind: 'text', text: 'x' })
  })

  it('ignores a drop outside the grid and returns the same document', () => {
    const doc = docWith(newGrid('g', 1, 1))
    expect(applyEdit(doc, { type: 'dropContent', gridId: gridOf(doc).id, row: 4, col: 0, content: { kind: 'tag' } })).toBe(doc)
  })

  it('fills a column for each stack row and writes the header', () => {
    const grid = newGrid('g', 4, 2)
    grid.rows[1].context = { stack: { label: '13+', buckets: ['13+'] } }
    grid.rows[2].context = { stack: { label: '11-13', buckets: ['11-13'] } }
    const doc = applyEdit(docWith(grid), { type: 'dropOnHeader', gridId: grid.id, col: 1, section: 'huSb', label: 'Raise First In', abbr: 'RFI' })
    const result = gridOf(doc)
    expect(cellAt(result, 0, 1)?.content).toEqual({ kind: 'text', text: 'RFI' })
    expect(cellAt(result, 1, 1)?.content).toMatchObject({ kind: 'stat', label: 'Raise First In' })
    expect(cellAt(result, 2, 1)?.content).toMatchObject({ kind: 'stat' })
    expect(cellAt(result, 3, 1)).toBeUndefined()
  })
})

describe('moving cells', () => {
  const setup = () => {
    let doc = docWith(newGrid('g', 2, 2))
    const id = gridOf(doc).id
    doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 0, col: 0, content: { kind: 'text', text: 'a' } })
    doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 0, col: 1, content: { kind: 'text', text: 'b' } })
    return { doc, id }
  }

  it('moves into free space, swaps with an occupied cell and copies with a modifier', () => {
    const { doc, id } = setup()
    const a = cellAt(gridOf(doc), 0, 0)!
    const moved = applyEdit(doc, { type: 'moveCell', gridId: id, cellId: a.id, row: 1, col: 1, copy: false })
    expect(cellAt(gridOf(moved), 1, 1)?.id).toBe(a.id)
    expect(cellAt(gridOf(moved), 0, 0)).toBeUndefined()

    const swapped = applyEdit(doc, { type: 'moveCell', gridId: id, cellId: a.id, row: 0, col: 1, copy: false })
    expect(cellAt(gridOf(swapped), 0, 1)?.content).toEqual({ kind: 'text', text: 'a' })
    expect(cellAt(gridOf(swapped), 0, 0)?.content).toEqual({ kind: 'text', text: 'b' })

    const copied = applyEdit(doc, { type: 'moveCell', gridId: id, cellId: a.id, row: 1, col: 0, copy: true })
    expect(gridOf(copied).cells).toHaveLength(3)
    expect(cellAt(gridOf(copied), 0, 0)?.id).toBe(a.id)
    expect(cellAt(gridOf(copied), 1, 0)?.content).toEqual({ kind: 'text', text: 'a' })
    expect(cellAt(gridOf(copied), 1, 0)?.id).not.toBe(a.id)
  })
})

describe('tracks', () => {
  it('shifts cells and grows merged cells when a row is inserted, and shrinks them when one is removed', () => {
    let doc = docWith(newGrid('g', 3, 1))
    const id = gridOf(doc).id
    doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 0, col: 0, content: { kind: 'text', text: 'top' } })
    doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 2, col: 0, content: { kind: 'text', text: 'bottom' } })
    doc = applyEdit(doc, { type: 'patchTrack', gridId: id, axis: 'row', index: 1, patch: { size: 30 } })
    const added = applyEdit(doc, { type: 'addTrack', gridId: id, axis: 'row', index: 1 })
    expect(gridOf(added).rows).toHaveLength(4)
    expect(cellAt(gridOf(added), 3, 0)?.content).toEqual({ kind: 'text', text: 'bottom' })
    expect(gridOf(added).rows[2].size).toBe(30)

    const removed = applyEdit(added, { type: 'removeTrack', gridId: id, axis: 'row', index: 3 })
    expect(gridOf(removed).cells).toHaveLength(1)
  })

  it('reorders tracks and moves the cells with them', () => {
    let doc = docWith(newGrid('g', 1, 3))
    const id = gridOf(doc).id
    for (const [col, text] of ['a', 'b', 'c'].entries()) doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 0, col, content: { kind: 'text', text } })
    doc = applyEdit(doc, { type: 'moveTrack', gridId: id, axis: 'col', from: 0, to: 2 })
    expect([0, 1, 2].map((c) => (cellAt(gridOf(doc), 0, c)?.content as { text: string }).text)).toEqual(['b', 'c', 'a'])
  })

  it('refuses to cut a merged cell by moving a track', () => {
    let doc = docWith(newGrid('g', 1, 3))
    const id = gridOf(doc).id
    for (const col of [0, 1]) doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 0, col, content: { kind: 'text', text: 'x' } })
    doc = applyEdit(doc, { type: 'merge', gridId: id, cellIds: gridOf(doc).cells.map((c) => c.id) })
    expect(applyEdit(doc, { type: 'moveTrack', gridId: id, axis: 'col', from: 0, to: 2 })).toBe(doc)
  })
})

describe('merging', () => {
  it('merges selected cells into one that keeps the first content, and splits it again', () => {
    let doc = docWith(newGrid('g', 2, 2))
    const id = gridOf(doc).id
    doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 0, col: 1, content: { kind: 'text', text: 'keep' } })
    doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 1, col: 0, content: { kind: 'text', text: 'lose' } })
    const merged = applyEdit(doc, { type: 'merge', gridId: id, cellIds: gridOf(doc).cells.map((c) => c.id) })
    expect(gridOf(merged).cells).toHaveLength(1)
    expect(gridOf(merged).cells[0]).toMatchObject({ row: 0, col: 0, rowSpan: 2, colSpan: 2, content: { kind: 'text', text: 'keep' } })
    const split = applyEdit(merged, { type: 'split', gridId: id, cellId: gridOf(merged).cells[0].id })
    expect(gridOf(split).cells[0]).toMatchObject({ rowSpan: 1, colSpan: 1 })
  })
})

describe('patching a selection', () => {
  it('applies a style and a colour rule to every selected cell and leaves the others', () => {
    let doc = docWith(newGrid('g', 1, 3))
    const id = gridOf(doc).id
    for (const col of [0, 1, 2]) doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 0, col, content: statCell('preflop', 'VPIP') })
    const [a, b, c] = gridOf(doc).cells
    const rule = { mode: 'bands' as const, bands: [{ from: 0, to: 100, color: '#123456' }], minSample: 3 }
    const patched = applyEdit(doc, { type: 'patchCells', gridId: id, cellIds: [a.id, b.id], patch: { style: { bold: true, bg: '#101010' }, colors: rule } })
    const cells = gridOf(patched).cells
    expect(cells[0].style).toEqual({ bold: true, bg: '#101010' })
    expect(cells[0].content).toMatchObject({ colors: rule })
    expect(cells[2].style).toEqual({})
    expect(cells[2].content).toMatchObject({ colors: { mode: 'none' } })
    const cleared = applyEdit(patched, { type: 'patchCells', gridId: id, cellIds: [a.id], patch: { style: { bg: null } } })
    expect(gridOf(cleared).cells[0].style).toEqual({ bold: true })
    expect(c.id).toBe(cells[2].id)
  })

  it('clears cells', () => {
    let doc = docWith(newGrid('g', 1, 1))
    const id = gridOf(doc).id
    doc = applyEdit(doc, { type: 'dropContent', gridId: id, row: 0, col: 0, content: { kind: 'tag' } })
    expect(gridOf(applyEdit(doc, { type: 'clearCells', gridId: id, cellIds: [gridOf(doc).cells[0].id] })).cells).toHaveLength(0)
  })
})

describe('grids', () => {
  it('removes a grid with its positions and the links to it', () => {
    const popup = newGrid('popup', 1, 1)
    const grid = newGrid('g', 1, 1)
    grid.cells.push({ id: 'c', row: 0, col: 0, rowSpan: 1, colSpan: 1, content: { kind: 'tag' }, style: {}, popupId: popup.id })
    let doc: EditorDoc = { layout: { grids: [grid], popups: [popup] }, seats: { '+1': { [grid.id]: { x: 0, y: 0 } } } }
    doc = applyEdit(doc, { type: 'removeGrid', gridId: popup.id })
    expect(doc.layout.popups).toHaveLength(0)
    expect(doc.layout.grids[0].cells[0].popupId).toBeUndefined()
    doc = applyEdit(doc, { type: 'removeGrid', gridId: grid.id })
    expect(doc.seats['+1']).toEqual({})
  })

  it('duplicates with new ids next to the original, and keeps the lock off the copy', () => {
    let doc = docWith({ ...newGrid('g', 1, 1), locked: true })
    doc = applyEdit(doc, { type: 'duplicateGrid', gridId: gridOf(doc).id })
    expect(doc.layout.grids).toHaveLength(2)
    const copy = doc.layout.grids[1]
    expect(copy.id).not.toBe(doc.layout.grids[0].id)
    expect(copy.locked).toBeUndefined()
    expect(doc.seats['+1'][copy.id]).toEqual({ x: 0.13, y: 0.13 })
  })

  it('does not edit a locked grid, but lets it be unlocked', () => {
    const doc = docWith({ ...newGrid('g', 1, 1), locked: true })
    const id = gridOf(doc).id
    expect(applyEdit(doc, { type: 'dropContent', gridId: id, row: 0, col: 0, content: { kind: 'tag' } })).toBe(doc)
    expect(gridOf(applyEdit(doc, { type: 'patchGrid', gridId: id, patch: { locked: false } })).locked).toBe(false)
  })
})

describe('history', () => {
  const doc = (n: number): EditorDoc => ({ layout: { grids: [], popups: [] }, seats: { [`s${n}`]: {} } })

  it('undoes and redoes, and a new edit drops the redo stack', () => {
    let history = record(emptyHistory(), doc(1))
    history = record(history, doc(2))
    const back = undo(history, doc(3))!
    expect(back.doc).toEqual(doc(2))
    const forward = redo(back.history, back.doc)!
    expect(forward.doc).toEqual(doc(3))
    expect(record(back.history, back.doc).future).toHaveLength(0)
    expect(undo(emptyHistory(), doc(1))).toBeNull()
  })

  it('stays bounded', () => {
    let history = emptyHistory()
    for (let i = 0; i < MAX_HISTORY + 50; i++) history = record(history, doc(i))
    expect(history.past).toHaveLength(MAX_HISTORY)
  })
})

describe('abbreviations', () => {
  it('knows the usual stats and falls back to initials', () => {
    expect(abbreviationOf('Fold to 3-Bet')).toBe('F3B')
    expect(abbreviationOf('fold_to_cbet_flop')).toBe('FTCF')
    expect(abbreviationOf('Squeeze')).toBe('Sque')
  })
})

describe('snapping', () => {
  const size = { w: 0.2, h: 0.1 }
  it('rounds to the step and keeps the grid on the table', () => {
    expect(snapPosition({ x: 0.113, y: 0.5 }, size, [], 0.02)).toEqual({ x: 0.12, y: 0.5 })
    expect(snapPosition({ x: 0.95, y: 0.99 }, size, [], null)).toEqual({ x: 0.8, y: 0.9 })
  })

  it('lines up with the edge of a neighbour when close, and not when far', () => {
    const other = { x: 0.5, y: 0.3, w: 0.2, h: 0.1 }
    expect(snapPosition({ x: 0.705, y: 0.6 }, size, [other], null)).toEqual({ x: 0.7, y: 0.6 })
    expect(snapPosition({ x: 0.304, y: 0.2 }, size, [other], null).x).toBeCloseTo(0.3)
    expect(snapPosition({ x: 0.75, y: 0.6 }, size, [other], null).x).toBe(0.75)
  })
})

describe('dragTo', () => {
  it('moves by the pointer travel as a fraction of the window and stays inside it', () => {
    const size = { w: 0.2, h: 0.1 }
    expect(dragTo({ x: 0.1, y: 0.1 }, { x: 100, y: 50 }, { width: 1000, height: 500 }, size, [], null)).toEqual({ x: 0.2, y: 0.2 })
    expect(dragTo({ x: 0.1, y: 0.1 }, { x: 5000, y: -900 }, { width: 1000, height: 500 }, size, [], null)).toEqual({ x: 0.8, y: 0 })
  })

  it('snaps to the step, and not at all with the step off and edges off', () => {
    const size = { w: 0.2, h: 0.1 }
    expect(dragTo({ x: 0.1, y: 0.1 }, { x: 13, y: 0 }, { width: 1000, height: 500 }, size, [], 0.02).x).toBeCloseTo(0.12)
    expect(dragTo({ x: 0.1, y: 0.1 }, { x: 13, y: 0 }, { width: 1000, height: 500 }, size, [], null, false).x).toBeCloseTo(0.113)
  })
})
