/** Settings version 2 described a panel as a strip and tables; version 3 describes grids. This turns the former into the latter. */
import {
  defaultColors,
  defaultDisplay,
  HUD_COLORS,
  newId,
  STACK_BUCKETS,
  type CellContent,
  type ColorBand,
  type CellStyle,
  type ColorRule,
  type HudGrid,
  type HudGridCell,
  type HudLayout,
  type StatContext,
  type Track,
} from './hudGrid'

export type LegacyFamily = 'open' | 'limp' | 'shove' | 'defense' | 'threeBet' | 'postflop' | 'showdown' | 'count'

export interface LegacyCell {
  section: string
  label: string
  column: string | null
  abbr: string
  family: LegacyFamily
  below: number | null
  above: number | null
  minSample: number
}

export interface LegacyTable {
  id: string
  title: string
  rows: 'stack' | 'single'
  column: string | null
  cells: LegacyCell[]
}

export interface LegacyLayout {
  strip: LegacyCell[]
  tables: LegacyTable[]
}

const MAX_LEGACY_CELLS = 12
const MAX_LEGACY_TABLES = 8
const LEGACY_DEFAULT_MIN_SAMPLE = 5
const FAMILIES: LegacyFamily[] = ['open', 'limp', 'shove', 'defense', 'threeBet', 'postflop', 'showdown', 'count']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const limit = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null)

function parseCell(raw: unknown): LegacyCell | null {
  if (!isRecord(raw) || typeof raw.section !== 'string' || typeof raw.label !== 'string') return null
  const abbr = typeof raw.abbr === 'string' && raw.abbr.trim() ? raw.abbr.trim() : raw.label
  return {
    section: raw.section.slice(0, 40),
    label: raw.label.slice(0, 60),
    column: typeof raw.column === 'string' ? raw.column.slice(0, 20) : null,
    abbr: abbr.slice(0, 6),
    family: FAMILIES.includes(raw.family as LegacyFamily) ? (raw.family as LegacyFamily) : 'open',
    below: limit(raw.below),
    above: limit(raw.above),
    minSample: typeof raw.minSample === 'number' && Number.isFinite(raw.minSample) ? Math.min(100000, Math.max(0, Math.round(raw.minSample))) : LEGACY_DEFAULT_MIN_SAMPLE,
  }
}

const parseCells = (raw: unknown) => (Array.isArray(raw) ? raw.slice(0, MAX_LEGACY_CELLS) : []).map(parseCell).filter((c): c is LegacyCell => c !== null)

/** A version 2 layout, or `null` when `raw` does not look like one. */
export function parseLegacyLayout(raw: unknown): LegacyLayout | null {
  if (!isRecord(raw) || (!Array.isArray(raw.strip) && !Array.isArray(raw.tables))) return null
  const tables: LegacyTable[] = []
  for (const [index, t] of (Array.isArray(raw.tables) ? raw.tables.slice(0, MAX_LEGACY_TABLES) : []).entries()) {
    if (!isRecord(t)) continue
    const cells = parseCells(t.cells)
    if (cells.length === 0) continue
    tables.push({
      id: typeof t.id === 'string' ? t.id.slice(0, 30) : `t${index}`,
      title: typeof t.title === 'string' && t.title.trim() ? t.title.trim().slice(0, 12) : `T${index + 1}`,
      rows: t.rows === 'stack' ? 'stack' : 'single',
      column: typeof t.column === 'string' ? t.column.slice(0, 20) : null,
      cells,
    })
  }
  return { strip: parseCells(raw.strip), tables }
}

// --- Conversion

/** Header colour by what the figure measures, as the version 2 panel did. */
const FAMILY_BG: Record<LegacyFamily, string | undefined> = {
  open: '#6d4fc9',
  threeBet: '#2d5cba',
  limp: '#7d5f10',
  shove: '#9c3650',
  defense: '#1c6a5e',
  postflop: '#1c6a5e',
  showdown: '#2f3646',
  count: undefined,
}

const HEADER_STYLE = (family: LegacyFamily): CellStyle => ({ bg: FAMILY_BG[family], fg: '#ffffff', align: 'center', fontSize: 10 })

/** The two thresholds of a version 2 figure as colour bands: below the range, in it, above it. */
function legacyColors(cell: LegacyCell): ColorRule {
  if (cell.below === null && cell.above === null) return { ...defaultColors(), minSample: cell.minSample }
  const bands: ColorBand[] = []
  // "Above" meant strictly above the threshold; one-decimal percentages make half a step enough.
  const aboveFrom = cell.above === null ? 100 : cell.above + 0.05
  if (cell.below !== null) bands.push({ from: 0, to: cell.below, color: HUD_COLORS.below })
  bands.push({ from: cell.below ?? 0, to: aboveFrom, color: HUD_COLORS.text })
  if (cell.above !== null) bands.push({ from: aboveFrom, to: 100, color: HUD_COLORS.above })
  return { mode: 'bands', bands: bands.filter((band) => band.from < band.to), minSample: cell.minSample }
}

function valueContent(cell: LegacyCell, tableColumn: string | null): CellContent {
  // A table's column wins over the figure's own, as before.
  const own = tableColumn === null ? cell.column : null
  const context: StatContext | undefined = own !== null ? { column: own } : undefined
  if (cell.section === 'meta') return { kind: 'hands', ...(context ? { context } : {}) }
  return {
    kind: 'stat',
    section: cell.section,
    label: cell.label,
    ...(context ? { context } : {}),
    display: { ...defaultDisplay(), showSample: 'always' },
    colors: legacyColors(cell),
  }
}

const makeCell = (row: number, col: number, content: CellContent, style: CellStyle = {}, rowSpan = 1, colSpan = 1): HudGridCell => ({
  id: newId('c'),
  row,
  col,
  rowSpan,
  colSpan,
  content,
  style,
})

const auto = (count: number): Track[] => Array.from({ length: count }, () => ({ size: 'auto' as const }))
const text = (value: string): CellContent => ({ kind: 'text', text: value })
const VALUE_STYLE: CellStyle = { align: 'center' }
const COUNT_STYLE: CellStyle = { align: 'center', fg: HUD_COLORS.sample }
const styleOf = (cell: LegacyCell): CellStyle => (cell.section === 'meta' ? COUNT_STYLE : VALUE_STYLE)

/** The strip: the player's name, then a header over a figure for each figure of the strip. */
function stripGrid(strip: LegacyCell[]): HudGrid {
  const width = Math.max(1, strip.length)
  const cells: HudGridCell[] = [makeCell(0, 0, { kind: 'playerName' }, { bold: true }, 1, width)]
  strip.forEach((c, i) => {
    cells.push(makeCell(1, i, text(c.abbr), HEADER_STYLE(c.family)))
    cells.push(makeCell(2, i, valueContent(c, null), styleOf(c)))
  })
  return { id: newId('g'), name: 'Player', rows: auto(strip.length > 0 ? 3 : 1), cols: auto(width), cells, context: {}, style: {} }
}

function stackGrid(table: LegacyTable): HudGrid {
  const cols = table.cells.length + 2
  const cells: HudGridCell[] = [makeCell(0, 0, text(table.title), { bold: true, fg: '#4fd1c5' }), makeCell(0, 1, text('H'), { align: 'center', fg: HUD_COLORS.textSecondary })]
  table.cells.forEach((c, i) => cells.push(makeCell(0, i + 2, text(c.abbr), HEADER_STYLE(c.family))))
  const rows: Track[] = [{ size: 'auto' }]
  STACK_BUCKETS.forEach((bucket, r) => {
    rows.push({ size: 'auto', context: { stack: { label: bucket, buckets: [bucket] } } })
    cells.push(makeCell(r + 1, 0, { kind: 'stackLabel' }, { fg: HUD_COLORS.textSecondary }))
    cells.push(makeCell(r + 1, 1, { kind: 'hands' }, COUNT_STYLE))
    table.cells.forEach((c, i) => cells.push(makeCell(r + 1, i + 2, valueContent(c, table.column), VALUE_STYLE)))
  })
  return { id: newId('g'), name: table.title, rows, cols: auto(cols), cells, context: { column: table.column }, style: { zebra: true } }
}

function singleGrid(table: LegacyTable): HudGrid {
  const cells: HudGridCell[] = [makeCell(0, 0, text(table.title), { bold: true, fg: '#4fd1c5' }, 2, 1)]
  table.cells.forEach((c, i) => {
    cells.push(makeCell(0, i + 1, text(c.abbr), HEADER_STYLE(c.family)))
    cells.push(makeCell(1, i + 1, valueContent(c, table.column), styleOf(c)))
  })
  return { id: newId('g'), name: table.title, rows: auto(2), cols: auto(table.cells.length + 1), cells, context: { column: table.column }, style: {} }
}

/** A version 2 layout as grids, without losing a figure, a threshold or a stack-depth row. */
export function migrateLayout(legacy: LegacyLayout): HudLayout {
  const grids = [stripGrid(legacy.strip), ...legacy.tables.map((t) => (t.rows === 'stack' ? stackGrid(t) : singleGrid(t)))]
  return { grids, popups: [] }
}
