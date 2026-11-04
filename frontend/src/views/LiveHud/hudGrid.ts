/**
 * The grid model of the table HUD, without React: what a grid is made of, which backend figures
 * it needs, what each cell shows and in which colour. Stored and imported files are untrusted
 * input, so everything read back goes through `sanitizeGrid`.
 */

// --- Constants

/** Stack depths (big blinds) a table can be split by, deepest first; the backend names them the same way. */
export const STACK_BUCKETS = ['13+', '11-13', '9-11', '7-9', '5-7', '3-5', '0-3'] as const

/** Table columns the backend counts figures in (`GET /hud/catalog` does not list them). */
export const STAT_COLUMNS = ['tot', 'hu', 'three_way', 'btn', 'sb_hu', 'sb_3w', 'bb_hu', 'bb_3w', 'sb'] as const

/** Sections whose stats exist in several table columns; the whole-table column is the default. */
export const SECTIONS_WITH_COLUMNS = ['preflop', 'steal', 'vsSteal']

export const MAX_GRIDS = 24
export const MAX_POPUPS = 8
export const MAX_ROWS = 40
export const MAX_COLS = 30
export const MAX_CELLS_PER_GRID = 600
/** Figures one layout may ask for; the backend refuses more than `MAX_STATS` (services/hud.rs) per request. */
export const MAX_REQUESTED_STATS = 1800
export const DEFAULT_MIN_SAMPLE = 5
export const DEFAULT_LOW_SAMPLE = 20
export const MAX_TEXT_LENGTH = 60
export const MIN_FONT_SIZE = 7
export const MAX_FONT_SIZE = 32
export const MIN_TRACK_SIZE = 8
export const MAX_TRACK_SIZE = 400
export const BASE_FONT_SIZE = 12

/** Colours of the HUD; the only ones the rendering ever uses besides those the user picked (validated). */
export const HUD_COLORS = {
  text: '#e6e9ef',
  textSecondary: '#aeb6c4',
  sample: '#8db4ff',
  aggressive: '#e5594f',
  passive: '#34c27a',
  average: '#facc15',
  below: '#8db4ff',
  above: '#ffa766',
  zebra: '#191d25',
  panel: 'rgba(11,13,17,0.92)',
  border: '#2f3646',
  keyBorder: '#aeb6c4',
} as const

export const TAG_COLORS: Record<string, string> = {
  red: '#ef4444',
  orange: '#fb923c',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
}

// --- Types

export interface HudStackGroup {
  label: string
  /** Backend bucket names whose counts are added up (`13+` and `11-13` for "12bb+"). */
  buckets: string[]
}

/** `undefined` inherits from the level above; `null` clears the value for this level and below. */
export interface StatContext {
  column?: string | null
  stack?: HudStackGroup | null
}

export interface Track {
  size: 'auto' | number
  context?: StatContext
}

export interface StatRef {
  section: string
  label: string
  column?: string | null
}

export interface StatDisplay {
  decimals: number
  padZero: boolean
  placeholder: string
  showSample: 'never' | 'lowOnly' | 'always'
  /** Below this many opportunities the sample counts as low. */
  lowSampleBelow: number
  /** Below this many opportunities the figure is replaced by the placeholder. */
  hideBelowSample: number
}

export interface ColorBand {
  from: number
  to: number
  color: string
  bold?: boolean
}

export interface ColorRule {
  mode: 'none' | 'bands' | 'baseline'
  bands: ColorBand[]
  /** Opportunities needed before a colour is applied. */
  minSample: number
  /** Colours the figure by another stat's value (same context). */
  sourceStat?: StatRef
  /** Key in `hudBaselines` for the `baseline` mode. */
  baselineKey?: string
}

export interface CellBorder {
  top?: boolean
  right?: boolean
  bottom?: boolean
  left?: boolean
}

export interface CellStyle {
  bg?: string
  fg?: string
  fontSize?: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  border?: CellBorder
}

export type CellContent =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'stat'; section: string; label: string; context?: StatContext; display: StatDisplay; colors: ColorRule }
  | { kind: 'playerName' }
  | { kind: 'hands'; context?: StatContext }
  | { kind: 'tag' }
  | { kind: 'stackLabel' }

export interface HudGridCell {
  id: string
  row: number
  col: number
  rowSpan: number
  colSpan: number
  content: CellContent
  style: CellStyle
  /** Clicking the cell opens this popup grid (a grid of `HudLayout.popups`). */
  popupId?: string
}

export interface GridStyle {
  bg?: string
  /** Base font size in pixels; cells scale from it. */
  fontSize?: number
  /** Alternate rows get a slightly lighter background. */
  zebra?: boolean
  /** Thin border around the whole grid. */
  frame?: boolean
}

export interface HudGrid {
  id: string
  name: string
  locked?: boolean
  rows: Track[]
  cols: Track[]
  cells: HudGridCell[]
  context: StatContext
  style: GridStyle
}

export interface HudLayout {
  grids: HudGrid[]
  popups: HudGrid[]
}

export interface HudStatRequest {
  section: string
  label: string
  column: string | null
  bucket: string | null
}

/** A player's figure: its percentage, and the counts behind it. */
export interface HudFigure {
  pct: number | null
  num: number
  den: number
}

export type HudFigures = Record<string, HudFigure | undefined>

export interface ResolvedContext {
  column: string | null
  stack: HudStackGroup | null
}

// --- Defaults and ids

let idCounter = 0
/** Unique enough within a settings file; collisions are repaired on load. */
export const newId = (prefix = 'g') => `${prefix}-${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

export const defaultDisplay = (): StatDisplay => ({
  decimals: 0,
  padZero: false,
  placeholder: '–',
  showSample: 'lowOnly',
  lowSampleBelow: DEFAULT_LOW_SAMPLE,
  hideBelowSample: 0,
})

export const defaultColors = (): ColorRule => ({ mode: 'none', bands: [], minSample: DEFAULT_MIN_SAMPLE })

export const statCell = (section: string, label: string, context?: StatContext): CellContent => ({
  kind: 'stat',
  section,
  label,
  ...(context ? { context } : {}),
  display: defaultDisplay(),
  colors: defaultColors(),
})

export function newGrid(name: string, rows: number, cols: number): HudGrid {
  return {
    id: newId('g'),
    name,
    rows: Array.from({ length: rows }, () => ({ size: 'auto' as const })),
    cols: Array.from({ length: cols }, () => ({ size: 'auto' as const })),
    cells: [],
    context: {},
    style: { zebra: true },
  }
}

// --- Context

/**
 * The context a cell counts in. Levels are merged field by field in the order grid, column, row,
 * cell: the most specific level that sets a field wins.
 */
export function resolveContext(grid: HudGrid, cell: Pick<HudGridCell, 'row' | 'col' | 'content'>): ResolvedContext {
  const own = cell.content.kind === 'stat' || cell.content.kind === 'hands' ? cell.content.context : undefined
  const levels = [grid.context, grid.cols[cell.col]?.context, grid.rows[cell.row]?.context, own]
  let column: string | null = null
  let stack: HudStackGroup | null = null
  for (const level of levels) {
    if (!level) continue
    if (level.column !== undefined) column = level.column
    if (level.stack !== undefined) stack = level.stack
  }
  return { column, stack }
}

// --- Requests

/** Identifies a figure in a player's answer. */
export const figureKey = (section: string, label: string, column: string | null, bucket: string | null) =>
  `${section}:${label}:${column ?? ''}:${bucket ?? ''}`

const META = 'meta'

/** The backend requests behind one stat in a context: one per bucket of its stack group. */
export function requestsFor(section: string, label: string, context: ResolvedContext): HudStatRequest[] {
  const buckets: (string | null)[] = context.stack && context.stack.buckets.length > 0 ? context.stack.buckets : [null]
  return buckets.map((bucket) => ({ section, label, column: context.column, bucket }))
}

/** What a cell asks of the backend (its figure, and the stat it is coloured by). */
export function cellRequests(grid: HudGrid, cell: HudGridCell): HudStatRequest[] {
  const context = resolveContext(grid, cell)
  const { content } = cell
  if (content.kind === 'hands') return requestsFor(META, 'hands', context)
  if (content.kind !== 'stat') return []
  const out = requestsFor(content.section, content.label, context)
  const source = content.colors.mode !== 'none' ? content.colors.sourceStat : undefined
  if (source) out.push(...requestsFor(source.section, source.label, { ...context, column: source.column ?? context.column }))
  return out
}

/** Every figure a layout shows, once each, as the `POST /hud/players` request wants them. */
export function requestsOf(layout: HudLayout): HudStatRequest[] {
  const seen = new Set<string>()
  const out: HudStatRequest[] = []
  for (const grid of [...layout.grids, ...layout.popups]) {
    for (const cell of grid.cells) {
      for (const r of cellRequests(grid, cell)) {
        const key = figureKey(r.section, r.label, r.column, r.bucket)
        if (!seen.has(key)) {
          seen.add(key)
          out.push(r)
        }
      }
    }
  }
  return out
}

// --- Values

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * A stat in a context. Buckets of a group are added up as counts (`num` and `den`) and the
 * percentage is worked out again: percentages are never added or averaged.
 */
export function readFigure(figures: HudFigures, section: string, label: string, context: ResolvedContext): HudFigure {
  let num = 0
  let den = 0
  for (const r of requestsFor(section, label, context)) {
    const figure = figures[figureKey(r.section, r.label, r.column, r.bucket)]
    if (!figure) continue
    num += figure.num
    den += figure.den
  }
  const counts = section === META
  return { pct: counts || den === 0 ? null : round1((100 * num) / den), num, den }
}

/** The text of a figure. `figure` is `null` when the player has no data. */
export function formatFigure(display: StatDisplay, figure: HudFigure | null, isCount: boolean): { text: string; low: boolean; hidden: boolean } {
  if (isCount) return { text: figure ? String(figure.num) : display.placeholder, low: false, hidden: false }
  if (!figure || figure.pct === null || figure.den === 0 || figure.den < display.hideBelowSample) {
    return { text: display.placeholder, low: false, hidden: true }
  }
  let text = figure.pct.toFixed(Math.min(2, Math.max(0, display.decimals)))
  if (display.padZero && text.split('.')[0].length < 2) text = `0${text}`
  return { text, low: figure.den < display.lowSampleBelow, hidden: false }
}

// --- Colours

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** A colour that is safe to put in CSS: a hexadecimal one and nothing else. */
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX_COLOR.test(value)

export const BASELINE_BELOW_COLOR = HUD_COLORS.below
export const BASELINE_ABOVE_COLOR = HUD_COLORS.above

/** Half a step of the one-decimal percentages the backend rounds to. */
const BAND_EPSILON = 0.05

export interface Baseline {
  target: number
  tolerance: number
}

/** Bands "below the range", "in the range", "above the range" around a GTO baseline. */
export function baselineBands(baseline: Baseline | undefined): ColorBand[] {
  if (!baseline) return []
  const low = Math.max(0, baseline.target - baseline.tolerance)
  const high = Math.min(100, baseline.target + baseline.tolerance)
  return [
    { from: 0, to: low, color: BASELINE_BELOW_COLOR },
    { from: low, to: high + BAND_EPSILON, color: HUD_COLORS.text },
    { from: high + BAND_EPSILON, to: 100, color: BASELINE_ABOVE_COLOR },
  ]
}

export const PRESET_RED_GREEN: ColorBand[] = [
  { from: 0, to: 33, color: HUD_COLORS.passive },
  { from: 33, to: 66, color: HUD_COLORS.average },
  { from: 66, to: 100, color: HUD_COLORS.aggressive },
]

/** Blue / orange, readable with the common forms of colour blindness. */
export const PRESET_BLUE_ORANGE: ColorBand[] = [
  { from: 0, to: 33, color: '#5aa9ff' },
  { from: 33, to: 66, color: HUD_COLORS.text },
  { from: 66, to: 100, color: '#ffa14a' },
]

export interface ColorChoice {
  color: string
  bold: boolean
}

/** The bands in force: the stored ones, or those of the baseline. */
export function effectiveBands(rule: ColorRule, baselines: Record<string, Baseline>): ColorBand[] {
  if (rule.mode === 'baseline') return baselineBands(rule.baselineKey ? baselines[rule.baselineKey] : undefined)
  return rule.mode === 'bands' ? rule.bands : []
}

/**
 * The colour of a value, or `null` when none applies. Nothing is judged on a sample smaller than
 * the rule's minimum: a figure with little behind it must not look reliable.
 */
export function pickColor(rule: ColorRule, value: number | null, sample: number, baselines: Record<string, Baseline>): ColorChoice | null {
  if (rule.mode === 'none' || value === null || sample === 0 || sample < rule.minSample) return null
  for (const band of effectiveBands(rule, baselines)) {
    const inside = value >= band.from && (value < band.to || (band.to >= 100 && value <= 100))
    if (inside) return { color: band.color, bold: band.bold === true }
  }
  return null
}

// --- What a cell shows

export interface HudPlayerInfo {
  name: string
  /** Manual colour tag set by the user (`red`, `green`...). */
  tag?: string
}

export interface CellView {
  id: string
  row: number
  col: number
  rowSpan: number
  colSpan: number
  kind: CellContent['kind']
  text: string
  /** Small figure next to the value: how many opportunities it rests on. */
  sample: string | null
  fg?: string
  bg?: string
  bold: boolean
  fontSize?: number
  align?: CellStyle['align']
  border?: CellBorder
  popupId?: string
  /** Colour of the player's tag, for `tag` cells. */
  tagColor?: string
  numeric: boolean
}

export function buildCellView(grid: HudGrid, cell: HudGridCell, figures: HudFigures, player: HudPlayerInfo, baselines: Record<string, Baseline>): CellView {
  const { content } = cell
  const view: CellView = {
    id: cell.id,
    row: cell.row,
    col: cell.col,
    rowSpan: cell.rowSpan,
    colSpan: cell.colSpan,
    kind: content.kind,
    text: '',
    sample: null,
    fg: cell.style.fg,
    bg: cell.style.bg,
    bold: cell.style.bold === true,
    fontSize: cell.style.fontSize,
    align: cell.style.align,
    border: cell.style.border,
    popupId: cell.popupId,
    numeric: false,
  }
  const context = resolveContext(grid, cell)
  switch (content.kind) {
    case 'text':
      view.text = content.text
      break
    case 'playerName':
      view.text = player.name
      break
    case 'tag':
      view.tagColor = player.tag ? TAG_COLORS[player.tag] : undefined
      break
    case 'stackLabel':
      view.text = context.stack?.label ?? ''
      view.numeric = true
      break
    case 'hands': {
      const figure = readFigure(figures, META, 'hands', context)
      view.text = formatFigure(defaultDisplay(), figure, true).text
      view.numeric = true
      break
    }
    case 'stat': {
      const figure = readFigure(figures, content.section, content.label, context)
      const shown = formatFigure(content.display, figure, content.section === META)
      view.text = shown.text
      view.numeric = true
      const { showSample } = content.display
      if (!shown.hidden && figure.den > 0 && (showSample === 'always' || (showSample === 'lowOnly' && shown.low))) view.sample = String(figure.den)
      if (!shown.hidden) {
        const source = content.colors.mode !== 'none' ? content.colors.sourceStat : undefined
        const judged = source ? readFigure(figures, source.section, source.label, { ...context, column: source.column ?? context.column }) : figure
        const choice = pickColor(content.colors, judged.pct, judged.den, baselines)
        if (choice) {
          view.fg = choice.color
          view.bold = view.bold || choice.bold
        }
      }
      break
    }
    case 'empty':
      break
  }
  return view
}

export function buildCellViews(grid: HudGrid, figures: HudFigures, player: HudPlayerInfo, baselines: Record<string, Baseline>): CellView[] {
  return grid.cells.filter((c) => c.content.kind !== 'empty' || hasVisibleStyle(c)).map((c) => buildCellView(grid, c, figures, player, baselines))
}

const hasVisibleStyle = (cell: HudGridCell) => cell.style.bg !== undefined || cell.style.border !== undefined

// --- Geometry

export const cellAt = (grid: HudGrid, row: number, col: number): HudGridCell | undefined =>
  grid.cells.find((c) => row >= c.row && row < c.row + c.rowSpan && col >= c.col && col < c.col + c.colSpan)

/** Rough height of a grid in pixels at scale 1, for placing grids one under another. */
export function estimateGridSize(grid: HudGrid): { width: number; height: number } {
  const fontSize = grid.style.fontSize ?? BASE_FONT_SIZE
  const track = (t: Track, fallback: number) => (t.size === 'auto' ? fallback : t.size)
  return {
    width: grid.cols.reduce((sum, c) => sum + track(c, fontSize * 2.6), 0),
    height: grid.rows.reduce((sum, r) => sum + track(r, fontSize * 1.5), 0),
  }
}

// --- Validation of a layout (live, in the editor)

export type HudIssueCode = 'unknownStat' | 'unknownColumn' | 'unknownBucket' | 'emptyGrid' | 'tooManyStats' | 'missingPopup'

export interface HudIssue {
  code: HudIssueCode
  gridId?: string
  cellId?: string
  detail?: string
}

/** `catalog` holds the ids (`section:label`) of the stats the backend offers; `null` while it is unknown. */
export function validateLayout(layout: HudLayout, catalog: ReadonlySet<string> | null): HudIssue[] {
  const issues: HudIssue[] = []
  const popupIds = new Set(layout.popups.map((p) => p.id))
  for (const grid of [...layout.grids, ...layout.popups]) {
    if (!grid.cells.some((c) => c.content.kind !== 'empty')) issues.push({ code: 'emptyGrid', gridId: grid.id })
    for (const cell of grid.cells) {
      const base = { gridId: grid.id, cellId: cell.id }
      if (cell.popupId && !popupIds.has(cell.popupId)) issues.push({ code: 'missingPopup', ...base })
      if (cell.content.kind === 'stat' && catalog && !catalog.has(`${cell.content.section}:${cell.content.label}`) && cell.content.section !== META) {
        issues.push({ code: 'unknownStat', detail: cell.content.label, ...base })
      }
      if (cell.content.kind !== 'stat' && cell.content.kind !== 'hands') continue
      const context = resolveContext(grid, cell)
      if (context.column !== null && !(STAT_COLUMNS as readonly string[]).includes(context.column)) issues.push({ code: 'unknownColumn', detail: context.column, ...base })
      for (const bucket of context.stack?.buckets ?? []) {
        if (!(STACK_BUCKETS as readonly string[]).includes(bucket)) issues.push({ code: 'unknownBucket', detail: bucket, ...base })
      }
    }
  }
  const asked = requestsOf(layout).length
  if (asked > MAX_REQUESTED_STATS) issues.push({ code: 'tooManyStats', detail: String(asked) })
  return issues
}

// --- Sanitizing: stored and imported grids are untrusted input.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
const str = (value: unknown, max: number): string | undefined => (typeof value === 'string' ? value.slice(0, max) : undefined)
const color = (value: unknown): string | undefined => (isHexColor(value) ? value : undefined)

function sanitizeStack(raw: unknown): HudStackGroup | null | undefined {
  if (raw === null) return null
  if (!isRecord(raw) || !Array.isArray(raw.buckets)) return undefined
  const known = STACK_BUCKETS as readonly string[]
  const buckets = raw.buckets.filter((b): b is string => typeof b === 'string' && known.includes(b))
  if (buckets.length === 0) return undefined
  return { label: str(raw.label, 12) ?? buckets[0], buckets: [...new Set(buckets)] }
}

export function sanitizeContext(raw: unknown): StatContext | undefined {
  if (!isRecord(raw)) return undefined
  const context: StatContext = {}
  if (raw.column === null) context.column = null
  else if (typeof raw.column === 'string') context.column = raw.column.slice(0, 20)
  const stack = sanitizeStack(raw.stack)
  if (stack !== undefined) context.stack = stack
  return Object.keys(context).length > 0 ? context : undefined
}

function sanitizeStatRef(raw: unknown): StatRef | undefined {
  if (!isRecord(raw) || typeof raw.section !== 'string' || typeof raw.label !== 'string') return undefined
  return { section: raw.section.slice(0, 40), label: raw.label.slice(0, 60), column: typeof raw.column === 'string' ? raw.column.slice(0, 20) : null }
}

function sanitizeDisplay(raw: unknown): StatDisplay {
  const base = defaultDisplay()
  if (!isRecord(raw)) return base
  return {
    decimals: Math.round(finite(raw.decimals, base.decimals, 0, 2)),
    padZero: raw.padZero === true,
    placeholder: str(raw.placeholder, 4) ?? base.placeholder,
    showSample: raw.showSample === 'never' || raw.showSample === 'always' || raw.showSample === 'lowOnly' ? raw.showSample : base.showSample,
    lowSampleBelow: Math.round(finite(raw.lowSampleBelow, base.lowSampleBelow, 0, 100000)),
    hideBelowSample: Math.round(finite(raw.hideBelowSample, base.hideBelowSample, 0, 100000)),
  }
}

function sanitizeColors(raw: unknown): ColorRule {
  const base = defaultColors()
  if (!isRecord(raw)) return base
  const mode = raw.mode === 'bands' || raw.mode === 'baseline' ? raw.mode : 'none'
  const bands: ColorBand[] = []
  for (const b of (Array.isArray(raw.bands) ? raw.bands : []).slice(0, 12)) {
    if (!isRecord(b)) continue
    const c = color(b.color)
    if (!c) continue
    bands.push({ from: finite(b.from, 0, 0, 100), to: finite(b.to, 100, 0, 100), color: c, ...(b.bold === true ? { bold: true } : {}) })
  }
  const source = sanitizeStatRef(raw.sourceStat)
  return {
    mode,
    bands,
    minSample: Math.round(finite(raw.minSample, base.minSample, 0, 100000)),
    ...(source ? { sourceStat: source } : {}),
    ...(typeof raw.baselineKey === 'string' ? { baselineKey: raw.baselineKey.slice(0, 20) } : {}),
  }
}

function sanitizeStyle(raw: unknown): CellStyle {
  if (!isRecord(raw)) return {}
  const style: CellStyle = {}
  const bg = color(raw.bg)
  const fg = color(raw.fg)
  if (bg) style.bg = bg
  if (fg) style.fg = fg
  if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)) style.fontSize = clamp(raw.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE)
  if (raw.bold === true) style.bold = true
  if (raw.align === 'left' || raw.align === 'center' || raw.align === 'right') style.align = raw.align
  if (isRecord(raw.border)) {
    const border: CellBorder = {}
    for (const side of ['top', 'right', 'bottom', 'left'] as const) if (raw.border[side] === true) border[side] = true
    if (Object.keys(border).length > 0) style.border = border
  }
  return style
}

function sanitizeContent(raw: unknown): CellContent {
  if (!isRecord(raw)) return { kind: 'empty' }
  switch (raw.kind) {
    case 'text':
      return { kind: 'text', text: str(raw.text, MAX_TEXT_LENGTH) ?? '' }
    case 'stat': {
      if (typeof raw.section !== 'string' || typeof raw.label !== 'string') return { kind: 'empty' }
      const context = sanitizeContext(raw.context)
      return {
        kind: 'stat',
        section: raw.section.slice(0, 40),
        label: raw.label.slice(0, 60),
        ...(context ? { context } : {}),
        display: sanitizeDisplay(raw.display),
        colors: sanitizeColors(raw.colors),
      }
    }
    case 'hands': {
      const context = sanitizeContext(raw.context)
      return { kind: 'hands', ...(context ? { context } : {}) }
    }
    case 'playerName':
    case 'tag':
    case 'stackLabel':
      return { kind: raw.kind }
    default:
      return { kind: 'empty' }
  }
}

function sanitizeTracks(raw: unknown, max: number): Track[] {
  return (Array.isArray(raw) ? raw.slice(0, max) : []).map((t): Track => {
    const record = isRecord(t) ? t : {}
    const context = sanitizeContext(record.context)
    const size = typeof record.size === 'number' && Number.isFinite(record.size) ? clamp(record.size, MIN_TRACK_SIZE, MAX_TRACK_SIZE) : 'auto'
    return { size, ...(context ? { context } : {}) }
  })
}

/** A grid read back from storage or an imported file; `null` when nothing usable is left. */
export function sanitizeGrid(raw: unknown, usedIds: Set<string>): HudGrid | null {
  if (!isRecord(raw)) return null
  const rows = sanitizeTracks(raw.rows, MAX_ROWS)
  const cols = sanitizeTracks(raw.cols, MAX_COLS)
  if (rows.length === 0 || cols.length === 0) return null
  const unique = (candidate: unknown, prefix: string) => {
    let id = typeof candidate === 'string' && candidate.trim() ? candidate.trim().slice(0, 60) : newId(prefix)
    while (usedIds.has(id)) id = newId(prefix)
    usedIds.add(id)
    return id
  }
  const occupied = new Set<string>()
  const cellIds = new Set<string>()
  const cells: HudGridCell[] = []
  for (const c of (Array.isArray(raw.cells) ? raw.cells : []).slice(0, MAX_CELLS_PER_GRID)) {
    if (!isRecord(c)) continue
    const row = Math.round(finite(c.row, -1, -1, MAX_ROWS))
    const col = Math.round(finite(c.col, -1, -1, MAX_COLS))
    if (row < 0 || col < 0 || row >= rows.length || col >= cols.length) continue
    const rowSpan = Math.round(finite(c.rowSpan, 1, 1, rows.length - row))
    const colSpan = Math.round(finite(c.colSpan, 1, 1, cols.length - col))
    const slots: string[] = []
    for (let r = row; r < row + rowSpan; r++) for (let k = col; k < col + colSpan; k++) slots.push(`${r}:${k}`)
    if (slots.some((s) => occupied.has(s))) continue
    slots.forEach((s) => occupied.add(s))
    let id = typeof c.id === 'string' && c.id ? c.id.slice(0, 60) : newId('c')
    while (cellIds.has(id)) id = newId('c')
    cellIds.add(id)
    cells.push({
      id,
      row,
      col,
      rowSpan,
      colSpan,
      content: sanitizeContent(c.content),
      style: sanitizeStyle(c.style),
      ...(typeof c.popupId === 'string' ? { popupId: c.popupId.slice(0, 60) } : {}),
    })
  }
  const style = isRecord(raw.style) ? raw.style : {}
  const gridStyle: GridStyle = {}
  const bg = color(style.bg)
  if (bg) gridStyle.bg = bg
  if (typeof style.fontSize === 'number' && Number.isFinite(style.fontSize)) gridStyle.fontSize = clamp(style.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE)
  if (style.zebra === true) gridStyle.zebra = true
  if (style.frame === true) gridStyle.frame = true
  return {
    id: unique(raw.id, 'g'),
    name: str(raw.name, 40)?.trim() || 'Grid',
    ...(raw.locked === true ? { locked: true } : {}),
    rows,
    cols,
    cells,
    context: sanitizeContext(raw.context) ?? {},
    style: gridStyle,
  }
}

/** A layout read back from storage; popup links to popups that do not exist are dropped. */
export function sanitizeHudLayout(raw: unknown): HudLayout | null {
  if (!isRecord(raw) || !Array.isArray(raw.grids)) return null
  const used = new Set<string>()
  const grids = raw.grids.slice(0, MAX_GRIDS).map((g) => sanitizeGrid(g, used)).filter((g): g is HudGrid => g !== null)
  const popups = (Array.isArray(raw.popups) ? raw.popups.slice(0, MAX_POPUPS) : []).map((g) => sanitizeGrid(g, used)).filter((g): g is HudGrid => g !== null)
  const popupIds = new Set(popups.map((p) => p.id))
  for (const grid of [...grids, ...popups]) {
    for (const cell of grid.cells) if (cell.popupId && !popupIds.has(cell.popupId)) delete cell.popupId
  }
  return { grids, popups }
}

// --- Positions of the grids on the table

export interface GridPosition {
  /** Left and top edges as fractions of the table window. */
  x: number
  y: number
}

/** Pixel size of the reference table, for turning grid sizes into table fractions. */
export const REFERENCE_TABLE = { width: 1000, height: 625 }
const STACK_GAP_PX = 6

/**
 * The position of each grid of a seat: the saved one, or one under the previous grid, starting
 * from `origin`. A grid with no saved position therefore still shows up.
 */
export function resolvePositions(grids: HudGrid[], saved: Record<string, GridPosition> | undefined, origin: GridPosition): Record<string, GridPosition> {
  const out: Record<string, GridPosition> = {}
  let y = origin.y
  for (const grid of grids) {
    const known = saved?.[grid.id]
    out[grid.id] = known ?? { x: origin.x, y: Math.min(0.95, y) }
    y = (known ?? { y }).y + (estimateGridSize(grid).height + STACK_GAP_PX) / REFERENCE_TABLE.height
  }
  return out
}
