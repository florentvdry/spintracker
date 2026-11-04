/**
 * Editing actions of the HUD editor, without React. The editor's whole state is one `EditorDoc`
 * (the layout of a format and where its grids sit on the table); every edit is a pure function
 * `(doc, action) → doc` and the store persists the result. An action that changes nothing returns
 * the same object, so that it adds no step to the undo history.
 */
import {
  cellAt,
  MAX_COLS,
  MAX_GRIDS,
  MAX_POPUPS,
  MAX_ROWS,
  newId,
  statCell,
  type CellContent,
  type CellStyle,
  type ColorRule,
  type GridPosition,
  type HudGrid,
  type HudGridCell,
  type HudLayout,
  type StatContext,
  type StatDisplay,
  type Track,
} from './hudGrid'
import type { SeatPlacements } from './hudProfile'

export interface EditorDoc {
  layout: HudLayout
  /** Seat → grid id → position, for the room and format being edited. */
  seats: Record<string, SeatPlacements>
}

export type Axis = 'row' | 'col'

/** `null` removes a field of the style. */
export type CellStylePatch = { [K in keyof CellStyle]?: CellStyle[K] | null }

export interface CellPatch {
  style?: CellStylePatch
  /** Replaces the colour rule of the stat cells among the targets. */
  colors?: ColorRule
  display?: Partial<StatDisplay>
  /** `null` removes the link to a popup. */
  popupId?: string | null
  /** Context of the stat cells among the targets. */
  context?: StatContext | null
}

export type EditAction =
  | { type: 'addGrid'; grid: HudGrid; popup?: boolean; positions?: Record<string, GridPosition> }
  | { type: 'removeGrid'; gridId: string }
  | { type: 'duplicateGrid'; gridId: string }
  | { type: 'patchGrid'; gridId: string; patch: Partial<Pick<HudGrid, 'name' | 'locked' | 'context' | 'style'>> }
  | { type: 'replaceGrids'; grids: HudGrid[]; popups: HudGrid[]; positions: Record<string, SeatPlacements> }
  | { type: 'dropContent'; gridId: string; row: number; col: number; content: CellContent }
  | { type: 'dropOnHeader'; gridId: string; col: number; section: string; label: string; abbr: string }
  | { type: 'setContent'; gridId: string; cellId: string; content: CellContent }
  | { type: 'patchCells'; gridId: string; cellIds: string[]; patch: CellPatch }
  | { type: 'moveCell'; gridId: string; cellId: string; row: number; col: number; copy: boolean }
  | { type: 'clearCells'; gridId: string; cellIds: string[] }
  | { type: 'addTrack'; gridId: string; axis: Axis; index: number }
  | { type: 'removeTrack'; gridId: string; axis: Axis; index: number }
  | { type: 'moveTrack'; gridId: string; axis: Axis; from: number; to: number }
  | { type: 'patchTrack'; gridId: string; axis: Axis; index: number; patch: Partial<Track> }
  | { type: 'merge'; gridId: string; cellIds: string[] }
  | { type: 'split'; gridId: string; cellId: string }

// --- Abbreviations of the stats, for the header a dropped column creates

const ABBREVIATIONS: Record<string, string> = {
  VPIP: 'VP',
  PFR: 'PFR',
  'Raise First In': 'RFI',
  'Open Limp': 'L',
  'Call Open': 'CO',
  '3-Bet': '3B',
  '3-Bet Non-All-In': '3BN',
  '3-Bet Shove': '3BS',
  'Fold to 3-Bet': 'F3B',
  'Fold to 3-Bet Non-All-In': 'F3BN',
  'Fold to 3-Bet Shove': 'F3BS',
  '4-Bet': '4B',
  'Fold to 4-Bet': 'F4B',
  'Limp-Fold': 'LF',
  'Limp-Fold vs Non-All-In': 'LFN',
  'Limp-Fold vs All-In': 'LFA',
  'Limp-Fold vs Raise': 'LF',
  'Limp-Call vs Raise': 'LC',
  'Limp-Raise vs Raise': 'LR',
  'Limp-Raise': 'LR',
  'Hands vs Raise': 'HvR',
  'Fold vs Raise': 'FvR',
  'Call vs Raise': 'CvR',
  'Iso Raise': 'ISO',
  'Iso Non-All-In': 'ISN',
  'Iso All-In': 'ISA',
  'vs Raise Fold': 'FvR',
  'vs Raise Call': 'CvR',
  'vs Raise 3-Bet': '3B',
  'vs Limp Check': 'X',
  'vs Limp Raise': 'ISO',
  'Open Shove': 'OS',
  'Iso Shove': 'IS',
  Rejam: 'RJ',
  'Call Shove': 'COS',
  'Fold vs Shove': 'FvS',
  hands: 'H',
  wtsd: 'WTSD',
  wwsf: 'WWSF',
  wsd: 'W$SD',
}

/** A short header for a stat: a known one, or the initials of its words. */
export function abbreviationOf(label: string): string {
  const known = ABBREVIATIONS[label]
  if (known) return known
  const words = label.split(/[\s_-]+/).filter(Boolean)
  const initials = words.map((w) => w[0].toUpperCase()).join('')
  return (words.length > 1 ? initials : label.slice(0, 4)).slice(0, 6)
}

/** Header colour by what a stat measures. */
export function headerStyleFor(section: string, label: string): CellStyle {
  const family = section === 'shove' ? '#9c3650' : /limp/i.test(label) ? '#7d5f10' : /3-?bet|raise 3|4-?bet|iso/i.test(label) ? '#2d5cba' : /fold|vs |call/i.test(label) || section === 'postflop' ? '#1c6a5e' : '#6d4fc9'
  return { bg: family, fg: '#ffffff', align: 'center', fontSize: 10 }
}

// --- Baselines

/** Key in `hudBaselines` of the GTO frequency matching a catalog stat, when there is one. */
const BASELINE_KEYS: Record<string, string> = {
  'preflop:VPIP': 'VPIP',
  'preflop:Raise First In': 'OR',
  'preflop:Open Raise 2x': '2x',
  'preflop:Open Raise 2x+': '2x+',
  'preflop:Open Raise 2.5x': '2.5x',
  'preflop:Open Raise 3x': '3x',
  'preflop:Open Raise 3.5x+': '3.5x+',
  'preflop:Open Limp': 'Limp',
  'preflop:3-Bet': '3Bet',
  'preflop:3-Bet Non-All-In': '3BN',
  'preflop:3-Bet Shove': '3BS',
  'preflop:Fold to 3-Bet': 'F3B',
  'preflop:Fold to 3-Bet Non-All-In': 'F3BN',
  'preflop:Fold to 3-Bet Shove': 'F3BS',
  'preflop:Limp-Fold': 'LF',
  'preflop:Limp-Fold vs Non-All-In': 'LFN',
  'preflop:Limp-Fold vs All-In': 'LFA',
  'preflop:Limp-Raise': 'LR',
  'preflop:Fold vs Raise': 'FvR',
  'preflop:Call vs Raise': 'CvR',
  'preflop:Fold vs 2x': 'Fv2x',
  'preflop:Fold vs 2x+': 'Fv2x+',
  'preflop:Fold vs 2.5x': 'Fv2.5x',
  'preflop:Fold vs 3x': 'Fv3x',
  'preflop:Fold vs 3.5x+': 'Fv3.5x+',
  'preflop:Call vs 2x': 'Cv2x',
  'preflop:Call vs 2x+': 'Cv2x+',
  'preflop:Call vs 2.5x': 'Cv2.5x',
  'preflop:Call vs 3x': 'Cv3x',
  'preflop:Call vs 3.5x+': 'Cv3.5x+',
  'preflop:Iso Raise': 'ISO',
  'preflop:Iso Non-All-In': 'ISN',
  'preflop:Iso All-In': 'ISA',
  'huSb:Open Limp': 'L',
  'huSb:Limp-Fold vs Raise': 'LF',
  'huSb:Limp-Raise vs Raise': 'LR',
  'huBb:vs Raise Fold': 'FvR',
  'huBb:vs Limp Check': 'X',
  'shove:Open Shove': 'OS',
  'shove:Call Shove': 'COS',
  'postflop:cbet_flop': 'CBet',
  'postflop:wtsd': 'WTSD',
  'postflop:wwsf': 'WWSF',
  'postflop:wsd': 'W$SD',
}

export const baselineKeyFor = (section: string, label: string): string | undefined => BASELINE_KEYS[`${section}:${label}`]

// --- Helpers

const clone = <T,>(value: T): T => structuredClone(value)

const gridsOf = (doc: EditorDoc) => [...doc.layout.grids, ...doc.layout.popups]

export const findGrid = (layout: HudLayout, id: string): HudGrid | undefined => layout.grids.find((g) => g.id === id) ?? layout.popups.find((g) => g.id === id)

function updateGrid(doc: EditorDoc, gridId: string, change: (grid: HudGrid) => HudGrid, allowLocked = false): EditorDoc {
  const isPopup = !doc.layout.grids.some((g) => g.id === gridId)
  const list = isPopup ? doc.layout.popups : doc.layout.grids
  const index = list.findIndex((g) => g.id === gridId)
  if (index < 0) return doc
  if (list[index].locked && !allowLocked) return doc
  const next = change(list[index])
  if (next === list[index]) return doc
  const updated = list.map((g, i) => (i === index ? next : g))
  return { ...doc, layout: isPopup ? { ...doc.layout, popups: updated } : { ...doc.layout, grids: updated } }
}

const overlaps = (a: HudGridCell, b: Pick<HudGridCell, 'row' | 'col' | 'rowSpan' | 'colSpan'>) =>
  a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan && a.col < b.col + b.colSpan && b.col < a.col + a.colSpan

const newCell = (row: number, col: number, content: CellContent, style: CellStyle = {}): HudGridCell => ({ id: newId('c'), row, col, rowSpan: 1, colSpan: 1, content, style })

const inside = (grid: HudGrid, row: number, col: number) => row >= 0 && col >= 0 && row < grid.rows.length && col < grid.cols.length

/** Puts a cell of content at a position; an existing cell there keeps its style and span. */
function putContent(grid: HudGrid, row: number, col: number, content: CellContent, style?: CellStyle): HudGrid {
  if (!inside(grid, row, col)) return grid
  const existing = cellAt(grid, row, col)
  if (existing) return { ...grid, cells: grid.cells.map((c) => (c === existing ? { ...c, content, ...(style ? { style } : {}) } : c)) }
  return { ...grid, cells: [...grid.cells, newCell(row, col, content, style)] }
}

function applyStylePatch(style: CellStyle, patch: CellStylePatch): CellStyle {
  const next: Record<string, unknown> = { ...style }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key]
    else next[key] = value
  }
  return next as CellStyle
}

function patchCell(cell: HudGridCell, patch: CellPatch): HudGridCell {
  let next = cell
  if (patch.style) next = { ...next, style: applyStylePatch(next.style, patch.style) }
  if (patch.popupId !== undefined) {
    const { popupId: _removed, ...rest } = next
    next = patch.popupId === null ? rest : { ...rest, popupId: patch.popupId }
  }
  if (next.content.kind === 'stat') {
    const content = next.content
    if (patch.colors) next = { ...next, content: { ...content, colors: patch.colors } }
    if (patch.display) next = { ...next, content: { ...(next.content as typeof content), display: { ...content.display, ...patch.display } } }
  }
  if (patch.context !== undefined && (next.content.kind === 'stat' || next.content.kind === 'hands')) {
    const { context: _old, ...content } = next.content as typeof next.content & { context?: StatContext }
    next = { ...next, content: (patch.context === null ? content : { ...content, context: patch.context }) as CellContent }
  }
  return next
}

// --- Tracks

/** Shifts the cells for a track inserted at `index`: cells after it move, cells across it grow. */
function insertTrack(grid: HudGrid, axis: Axis, index: number): HudGrid {
  const tracks = axis === 'row' ? grid.rows : grid.cols
  if (tracks.length >= (axis === 'row' ? MAX_ROWS : MAX_COLS)) return grid
  const at = Math.min(Math.max(index, 0), tracks.length)
  const added = [...tracks.slice(0, at), { size: 'auto' as const }, ...tracks.slice(at)]
  const cells = grid.cells.map((c) => {
    const start = axis === 'row' ? c.row : c.col
    const span = axis === 'row' ? c.rowSpan : c.colSpan
    if (start >= at) return axis === 'row' ? { ...c, row: c.row + 1 } : { ...c, col: c.col + 1 }
    if (start + span > at) return axis === 'row' ? { ...c, rowSpan: c.rowSpan + 1 } : { ...c, colSpan: c.colSpan + 1 }
    return c
  })
  return axis === 'row' ? { ...grid, rows: added, cells } : { ...grid, cols: added, cells }
}

function deleteTrack(grid: HudGrid, axis: Axis, index: number): HudGrid {
  const tracks = axis === 'row' ? grid.rows : grid.cols
  if (tracks.length <= 1 || index < 0 || index >= tracks.length) return grid
  const cells: HudGridCell[] = []
  for (const c of grid.cells) {
    const start = axis === 'row' ? c.row : c.col
    const span = axis === 'row' ? c.rowSpan : c.colSpan
    if (index < start) cells.push(axis === 'row' ? { ...c, row: c.row - 1 } : { ...c, col: c.col - 1 })
    else if (index >= start + span) cells.push(c)
    else if (span > 1) cells.push(axis === 'row' ? { ...c, rowSpan: c.rowSpan - 1 } : { ...c, colSpan: c.colSpan - 1 })
    // A cell that only lived in the removed track goes with it.
  }
  const rest = tracks.filter((_, i) => i !== index)
  return axis === 'row' ? { ...grid, rows: rest, cells } : { ...grid, cols: rest, cells }
}

/** Moves a track; refused when a merged cell spans it, which would tear the cell apart. */
function relocateTrack(grid: HudGrid, axis: Axis, from: number, to: number): HudGrid {
  const tracks = axis === 'row' ? grid.rows : grid.cols
  if (from === to || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length) return grid
  const low = Math.min(from, to)
  const high = Math.max(from, to)
  const spans = grid.cells.some((c) => (axis === 'row' ? c.rowSpan : c.colSpan) > 1 && (axis === 'row' ? c.row + c.rowSpan > low && c.row <= high : c.col + c.colSpan > low && c.col <= high))
  if (spans) return grid
  const order = tracks.map((_, i) => i)
  order.splice(to, 0, order.splice(from, 1)[0])
  const newIndex = (old: number) => order.indexOf(old)
  const moved = order.map((i) => tracks[i])
  const cells = grid.cells.map((c) => (axis === 'row' ? { ...c, row: newIndex(c.row) } : { ...c, col: newIndex(c.col) }))
  return axis === 'row' ? { ...grid, rows: moved, cells } : { ...grid, cols: moved, cells }
}

// --- Merging

function mergeCells(grid: HudGrid, cellIds: string[]): HudGrid {
  const chosen = grid.cells.filter((c) => cellIds.includes(c.id))
  if (chosen.length < 2) return grid
  let box = {
    row: Math.min(...chosen.map((c) => c.row)),
    col: Math.min(...chosen.map((c) => c.col)),
    rowEnd: Math.max(...chosen.map((c) => c.row + c.rowSpan)),
    colEnd: Math.max(...chosen.map((c) => c.col + c.colSpan)),
  }
  // Any cell that only partly lies in the box is taken in whole, until the box is stable.
  for (let changed = true; changed; ) {
    changed = false
    for (const c of grid.cells) {
      const hit = overlaps(c, { row: box.row, col: box.col, rowSpan: box.rowEnd - box.row, colSpan: box.colEnd - box.col })
      if (!hit) continue
      const next = {
        row: Math.min(box.row, c.row),
        col: Math.min(box.col, c.col),
        rowEnd: Math.max(box.rowEnd, c.row + c.rowSpan),
        colEnd: Math.max(box.colEnd, c.col + c.colSpan),
      }
      if (next.row !== box.row || next.col !== box.col || next.rowEnd !== box.rowEnd || next.colEnd !== box.colEnd) {
        box = next
        changed = true
      }
    }
  }
  const area = { row: box.row, col: box.col, rowSpan: box.rowEnd - box.row, colSpan: box.colEnd - box.col }
  const absorbed = grid.cells.filter((c) => overlaps(c, area))
  // The merged cell keeps the first cell that holds something, in reading order.
  const ordered = [...absorbed].sort((a, b) => a.row - b.row || a.col - b.col)
  const keep = ordered.find((c) => c.content.kind !== 'empty') ?? ordered[0]
  const merged: HudGridCell = { ...keep, ...area }
  return { ...grid, cells: [...grid.cells.filter((c) => !absorbed.includes(c)), merged] }
}

// --- Header drops

/** The rows a dropped column fills: the stack-depth rows, or every row under the header. */
function bodyRows(grid: HudGrid): number[] {
  const withStack = grid.rows.map((r, i) => (r.context?.stack ? i : -1)).filter((i) => i >= 0)
  if (withStack.length > 0) return withStack
  return grid.rows.length > 1 ? grid.rows.map((_, i) => i).slice(1) : []
}

function dropColumn(grid: HudGrid, col: number, section: string, label: string, abbr: string): HudGrid {
  if (col < 0 || col >= grid.cols.length) return grid
  const content: CellContent = section === 'meta' ? { kind: 'hands' } : statCell(section, label)
  let next = putContent(grid, 0, col, { kind: 'text', text: abbr }, headerStyleFor(section, label))
  for (const row of bodyRows(grid)) next = putContent(next, row, col, content, { align: 'center' })
  return next
}

// --- Placement

const CLAMP = (value: number) => Math.min(1, Math.max(0, value))

const DUPLICATE_OFFSET = 0.03

function withoutGrid(doc: EditorDoc, gridId: string): EditorDoc {
  const strip = (g: HudGrid): HudGrid => (g.cells.some((c) => c.popupId === gridId) ? { ...g, cells: g.cells.map((c) => (c.popupId === gridId ? (({ popupId: _gone, ...rest }) => rest)(c) : c)) } : g)
  const seats = Object.fromEntries(Object.entries(doc.seats).map(([seat, positions]) => [seat, Object.fromEntries(Object.entries(positions).filter(([id]) => id !== gridId))]))
  return {
    layout: { grids: doc.layout.grids.filter((g) => g.id !== gridId).map(strip), popups: doc.layout.popups.filter((g) => g.id !== gridId).map(strip) },
    seats,
  }
}

// --- The reducer

export function applyEdit(doc: EditorDoc, action: EditAction): EditorDoc {
  switch (action.type) {
    case 'addGrid': {
      const list = action.popup ? doc.layout.popups : doc.layout.grids
      if (list.length >= (action.popup ? MAX_POPUPS : MAX_GRIDS)) return doc
      const layout = action.popup ? { ...doc.layout, popups: [...list, action.grid] } : { ...doc.layout, grids: [...list, action.grid] }
      const seats = { ...doc.seats }
      for (const [seat, position] of Object.entries(action.positions ?? {})) seats[seat] = { ...(seats[seat] ?? {}), [action.grid.id]: position }
      return { layout, seats }
    }
    case 'removeGrid':
      return gridsOf(doc).some((g) => g.id === action.gridId) ? withoutGrid(doc, action.gridId) : doc
    case 'duplicateGrid': {
      const source = findGrid(doc.layout, action.gridId)
      if (!source) return doc
      const isPopup = !doc.layout.grids.some((g) => g.id === source.id)
      if ((isPopup ? doc.layout.popups : doc.layout.grids).length >= (isPopup ? MAX_POPUPS : MAX_GRIDS)) return doc
      const copy: HudGrid = { ...clone(source), id: newId('g'), name: `${source.name} (2)`, locked: undefined, cells: source.cells.map((c) => ({ ...clone(c), id: newId('c') })) }
      if (!copy.locked) delete copy.locked
      const seats = Object.fromEntries(
        Object.entries(doc.seats).map(([seat, positions]) => {
          const origin = positions[source.id]
          return [seat, origin ? { ...positions, [copy.id]: { x: CLAMP(origin.x + DUPLICATE_OFFSET), y: CLAMP(origin.y + DUPLICATE_OFFSET) } } : positions]
        }),
      )
      const layout = isPopup ? { ...doc.layout, popups: [...doc.layout.popups, copy] } : { ...doc.layout, grids: [...doc.layout.grids, copy] }
      return { layout, seats }
    }
    case 'patchGrid':
      return updateGrid(doc, action.gridId, (g) => ({ ...g, ...action.patch }), true)
    case 'replaceGrids': {
      const seats = Object.fromEntries(Object.entries(action.positions))
      return { layout: { grids: action.grids.slice(0, MAX_GRIDS), popups: action.popups.slice(0, MAX_POPUPS) }, seats: { ...Object.fromEntries(Object.keys(doc.seats).map((s) => [s, {}])), ...seats } }
    }
    case 'dropContent':
      return updateGrid(doc, action.gridId, (g) => putContent(g, action.row, action.col, action.content))
    case 'dropOnHeader':
      return updateGrid(doc, action.gridId, (g) => dropColumn(g, action.col, action.section, action.label, action.abbr))
    case 'setContent':
      return updateGrid(doc, action.gridId, (g) => ({ ...g, cells: g.cells.map((c) => (c.id === action.cellId ? { ...c, content: action.content } : c)) }))
    case 'patchCells':
      return updateGrid(doc, action.gridId, (g) => {
        const ids = new Set(action.cellIds)
        return g.cells.some((c) => ids.has(c.id)) ? { ...g, cells: g.cells.map((c) => (ids.has(c.id) ? patchCell(c, action.patch) : c)) } : g
      })
    case 'clearCells':
      return updateGrid(doc, action.gridId, (g) => {
        const ids = new Set(action.cellIds)
        return g.cells.some((c) => ids.has(c.id)) ? { ...g, cells: g.cells.filter((c) => !ids.has(c.id)) } : g
      })
    case 'moveCell':
      return updateGrid(doc, action.gridId, (g) => moveCell(g, action.cellId, action.row, action.col, action.copy))
    case 'addTrack':
      return updateGrid(doc, action.gridId, (g) => insertTrack(g, action.axis, action.index))
    case 'removeTrack':
      return updateGrid(doc, action.gridId, (g) => deleteTrack(g, action.axis, action.index))
    case 'moveTrack':
      return updateGrid(doc, action.gridId, (g) => relocateTrack(g, action.axis, action.from, action.to))
    case 'patchTrack':
      return updateGrid(doc, action.gridId, (g) => {
        const tracks = action.axis === 'row' ? g.rows : g.cols
        if (action.index < 0 || action.index >= tracks.length) return g
        const next = tracks.map((t, i) => (i === action.index ? { ...t, ...action.patch } : t))
        return action.axis === 'row' ? { ...g, rows: next } : { ...g, cols: next }
      })
    case 'merge':
      return updateGrid(doc, action.gridId, (g) => mergeCells(g, action.cellIds))
    case 'split':
      return updateGrid(doc, action.gridId, (g) => {
        const target = g.cells.find((c) => c.id === action.cellId)
        if (!target || (target.rowSpan === 1 && target.colSpan === 1)) return g
        return { ...g, cells: g.cells.map((c) => (c === target ? { ...c, rowSpan: 1, colSpan: 1 } : c)) }
      })
  }
}

function moveCell(grid: HudGrid, cellId: string, row: number, col: number, copy: boolean): HudGrid {
  const source = grid.cells.find((c) => c.id === cellId)
  if (!source || !inside(grid, row, col)) return grid
  const target = cellAt(grid, row, col)
  if (target === source) return grid
  if (copy) {
    const duplicate = (at: { row: number; col: number }): HudGridCell => ({ ...clone(source), id: newId('c'), row: at.row, col: at.col })
    if (!target) return source.rowSpan === 1 && source.colSpan === 1 ? { ...grid, cells: [...grid.cells, duplicate({ row, col })] } : grid
    if (target.rowSpan !== 1 || target.colSpan !== 1 || source.rowSpan !== 1 || source.colSpan !== 1) return grid
    return { ...grid, cells: [...grid.cells.filter((c) => c !== target), duplicate({ row: target.row, col: target.col })] }
  }
  if (!target) {
    // Into free space: the cell keeps its size where it fits.
    const moved = { ...source, row, col }
    const fits = row + source.rowSpan <= grid.rows.length && col + source.colSpan <= grid.cols.length && !grid.cells.some((c) => c !== source && overlaps(c, moved))
    return fits ? { ...grid, cells: grid.cells.map((c) => (c === source ? moved : c)) } : grid
  }
  if (target.rowSpan !== 1 || target.colSpan !== 1 || source.rowSpan !== 1 || source.colSpan !== 1) return grid
  return {
    ...grid,
    cells: grid.cells.map((c) => (c === source ? { ...c, row: target.row, col: target.col } : c === target ? { ...c, row: source.row, col: source.col } : c)),
  }
}

// --- Snapping

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Magnetism range, as a fraction of the table: close edges of two grids line up. */
export const EDGE_SNAP = 0.008

function snapAxis(value: number, size: number, others: [number, number][], step: number | null): number {
  let best = step === null ? value : Math.round(value / step) * step
  let distance = EDGE_SNAP
  for (const [start, length] of others) {
    // Left edge to left edge, right to right, and each against the other's far side.
    for (const candidate of [start, start + length, start - size, start + length - size]) {
      const d = Math.abs(value - candidate)
      if (d < distance) {
        distance = d
        best = candidate
      }
    }
  }
  return best
}

/** Rounds a position to the placement step and lines it up with the edges of the other grids. */
export function snapPosition(position: GridPosition, size: { w: number; h: number }, others: Rect[], step: number | null, edges = true): GridPosition {
  const near = edges ? others : []
  const x = snapAxis(position.x, size.w, near.map((o) => [o.x, o.w]), step)
  const y = snapAxis(position.y, size.h, near.map((o) => [o.y, o.h]), step)
  return { x: Math.min(Math.max(0, x), Math.max(0, 1 - size.w)), y: Math.min(Math.max(0, y), Math.max(0, 1 - size.h)) }
}

/**
 * Where a grid dragged on the table lands: its start plus the pointer's travel, snapped, and kept
 * inside the window. `delta` and `window` are in pixels, `size` and `others` in fractions of it.
 */
export function dragTo(start: GridPosition, delta: { x: number; y: number }, window: { width: number; height: number }, size: { w: number; h: number }, others: Rect[], step: number | null, edges = true): GridPosition {
  const raw = { x: start.x + delta.x / window.width, y: start.y + delta.y / window.height }
  return snapPosition(raw, size, others, step, edges)
}

// --- History

export const MAX_HISTORY = 100

export interface EditorHistory {
  past: EditorDoc[]
  future: EditorDoc[]
}

export const emptyHistory = (): EditorHistory => ({ past: [], future: [] })

/** Records `before` as the state to return to; a new edit drops what could have been redone. */
export function record(history: EditorHistory, before: EditorDoc): EditorHistory {
  return { past: [...history.past, before].slice(-MAX_HISTORY), future: [] }
}

export function undo(history: EditorHistory, present: EditorDoc): { history: EditorHistory; doc: EditorDoc } | null {
  const doc = history.past[history.past.length - 1]
  if (!doc) return null
  return { doc, history: { past: history.past.slice(0, -1), future: [present, ...history.future].slice(0, MAX_HISTORY) } }
}

export function redo(history: EditorHistory, present: EditorDoc): { history: EditorHistory; doc: EditorDoc } | null {
  const [doc, ...future] = history.future
  if (!doc) return null
  return { doc, history: { past: [...history.past, present].slice(-MAX_HISTORY), future } }
}
