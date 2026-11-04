/**
 * The models shipped with the HUD. Each one builds fresh grids (new ids every time), so that
 * applying it gives the user a copy to edit. Only stats of the backend catalog are used; a test
 * checks every one of them against the stat registry.
 */
import { baselineKeyFor } from './hudEditor'
import {
  defaultDisplay,
  estimateGridSize,
  HUD_COLORS,
  newId,
  REFERENCE_TABLE,
  STACK_BUCKETS,
  type CellContent,
  type CellStyle,
  type ColorRule,
  type GridPosition,
  type HudGrid,
  type HudGridCell,
  type HudStackGroup,
  type StatContext,
} from './hudGrid'
import type { HudFormat, SeatPlacements } from './hudProfile'

export type TemplateId = 'huFull' | 'huFlash' | 'threeWayFull' | 'threeWayFlash' | 'popupGeneral' | 'popupHeadsUp' | 'popupThreeWay'

export const TEMPLATE_IDS: TemplateId[] = ['huFull', 'huFlash', 'threeWayFull', 'threeWayFlash', 'popupGeneral', 'popupHeadsUp', 'popupThreeWay']

export interface TemplateInstance {
  grids: HudGrid[]
  popups: HudGrid[]
  /** Offset of each grid, in pixels, from the first grid of the seat's panel. */
  offsets: Record<string, { dx: number; dy: number }>
}

// --- Look (the colours of the design)

const FAMILY = { entry: '#6d4fc9', raise: '#2d5cba', limp: '#7d5f10', shove: '#9c3650', reaction: '#1c6a5e' } as const
const POSITION = { BTN: '#4fd1c5', SB: '#6c9fff', BB: '#c084fc' } as const
const FULL_FONT = 12
const FLASH_FONT = 14
const COLUMN_GAP_PX = 8
const STACK_GROUPS_FLASH: HudStackGroup[] = [
  { label: '12bb+', buckets: ['13+', '11-13'] },
  { label: '8bb', buckets: ['9-11', '7-9'] },
  { label: '4bb', buckets: ['5-7', '3-5'] },
  { label: '2bb', buckets: ['0-3'] },
]
const STACK_GROUPS_FULL: HudStackGroup[] = STACK_BUCKETS.map((b) => ({ label: b, buckets: [b] }))

type Family = keyof typeof FAMILY

// --- Building blocks

const cell = (row: number, col: number, content: CellContent, style: CellStyle = {}, rowSpan = 1, colSpan = 1): HudGridCell => ({
  id: newId('c'),
  row,
  col,
  rowSpan,
  colSpan,
  content,
  style,
})

const text = (value: string): CellContent => ({ kind: 'text', text: value })
const auto = (count: number) => Array.from({ length: count }, () => ({ size: 'auto' as const }))
const header = (family: Family, extra: CellStyle = {}): CellStyle => ({ bg: FAMILY[family], fg: '#ffffff', align: 'center', bold: true, ...extra })
const label = (extra: CellStyle = {}): CellStyle => ({ fg: HUD_COLORS.textSecondary, align: 'left', ...extra })

/** A stat, coloured against its GTO baseline when the catalog has one for it. */
function stat(section: string, name: string, context?: StatContext): CellContent {
  const key = baselineKeyFor(section, name)
  const colors: ColorRule = key ? { mode: 'baseline', bands: [], minSample: 5, baselineKey: key } : { mode: 'none', bands: [], minSample: 5 }
  return { kind: 'stat', section, label: name, ...(context ? { context } : {}), display: { ...defaultDisplay(), showSample: 'lowOnly' }, colors }
}

const hands = (context?: StatContext): CellContent => ({ kind: 'hands', ...(context ? { context } : {}) })

const grid = (name: string, rows: HudGrid['rows'], cols: HudGrid['cols'], cells: HudGridCell[], context: StatContext = {}, fontSize = FULL_FONT, zebra = false): HudGrid => ({
  id: newId('g'),
  name,
  rows,
  cols,
  cells,
  context,
  style: { fontSize, frame: true, ...(zebra ? { zebra: true } : {}) },
})

interface MatrixColumn {
  abbr: string
  family: Family
  content: CellContent
  /** Outlined: the columns to read first. */
  key?: boolean
}

/** A table with one row per stack depth (or group of depths): a seat's preflop tendencies. */
function matrix(name: string, color: string, column: string, groups: HudStackGroup[], columns: MatrixColumn[], fontSize: number, titleOpens?: string): HudGrid {
  const width = columns.length + 2
  const cells: HudGridCell[] = [
    { ...cell(0, 0, text(name), { fg: color, bold: true, align: 'left' }), ...(titleOpens ? { popupId: titleOpens } : {}) },
    cell(0, 1, text('H'), label({ align: 'center' })),
  ]
  columns.forEach((c, i) => cells.push(cell(0, i + 2, text(c.abbr), header(c.family, c.key ? { border: { left: true, right: true } } : {}))))
  groups.forEach((_, r) => {
    cells.push(cell(r + 1, 0, { kind: 'stackLabel' }, label()))
    cells.push(cell(r + 1, 1, hands(), { align: 'center', fg: HUD_COLORS.sample }))
    columns.forEach((c, i) => cells.push(cell(r + 1, i + 2, c.content, c.key ? { align: 'center', bold: true, border: { left: true, right: true } } : { align: 'center' })))
  })
  const rows = [{ size: 'auto' as const }, ...groups.map((g) => ({ size: 'auto' as const, context: { stack: g } }))]
  return grid(name, rows, auto(width), cells, { column }, fontSize, true)
}

const STREETS = ['F', 'T', 'R'] as const

/** One postflop box: a few lines, each with its figure on the flop, turn and river. */
function streetBox(name: string, color: string, column: string, lines: { name: string; stats: [string, string, string | null] }[], fontSize: number): HudGrid {
  const cells: HudGridCell[] = [cell(0, 0, text(name), { fg: color, bold: true, align: 'left' })]
  STREETS.forEach((street, i) => cells.push(cell(0, i + 1, text(street), header('reaction'))))
  lines.forEach((line, r) => {
    cells.push(cell(r + 1, 0, text(line.name), label()))
    line.stats.forEach((figure, i) => cells.push(cell(r + 1, i + 1, figure ? stat('postflop', figure) : { kind: 'empty' }, { align: 'center' })))
  })
  return grid(name, auto(lines.length + 1), auto(4), cells, { column }, fontSize, true)
}

const CBET: { name: string; stats: [string, string, string] } = { name: 'CB', stats: ['cbet_flop', 'cbet_turn', 'cbet_river'] }
const FOLD_TO_CBET: { name: string; stats: [string, string, string] } = { name: 'FvCB', stats: ['fold_to_cbet_flop', 'fold_to_cbet_turn', 'fold_to_cbet_river'] }
const DONK: { name: string; stats: [string, string, string] } = { name: 'Dk', stats: ['donk_flop', 'donk_turn', 'donk_river'] }
const DONK_FOLD: { name: string; stats: [string, string, string] } = { name: 'DkF', stats: ['donk_fold_flop', 'donk_fold_turn', 'donk_fold_river'] }

/** The player's tag, name, how many hands the figures rest on, and the showdown figures. */
function playerBlock(opens: string | undefined, fontSize: number): HudGrid {
  const cells: HudGridCell[] = [
    cell(0, 0, { kind: 'tag' }, { align: 'center' }),
    { ...cell(0, 1, { kind: 'playerName' }, { bold: true, align: 'left' }, 1, 5), ...(opens ? { popupId: opens } : {}) },
    cell(1, 0, text('HU'), label({ align: 'center' })),
    cell(1, 1, hands({ column: 'hu' }), { align: 'center', fg: HUD_COLORS.sample }),
    cell(1, 2, text('3W'), label({ align: 'center' })),
    cell(1, 3, hands({ column: 'three_way' }), { align: 'center', fg: HUD_COLORS.sample }),
  ]
  ;(['wtsd', 'wwsf', 'wsd'] as const).forEach((name, i) => {
    const abbr = name === 'wsd' ? 'W$SD' : name.toUpperCase()
    cells.push(cell(2, i * 2, text(abbr), header('reaction', { bg: '#2f3646' }), 1, 2))
    cells.push(cell(3, i * 2, stat('postflop', name), { align: 'center', bold: true }, 1, 2))
  })
  return grid('Player', auto(4), auto(6), cells, { column: 'tot' }, fontSize)
}

/** Rows for BTN, SB and BB: each seat counts in its own table column and has its own figures. */
function seatRows(name: string, seats: { seat: keyof typeof POSITION; column: string; columns: { abbr: string; family: Family; content: CellContent }[] }[], fontSize: number, opens?: string): HudGrid {
  const width = Math.max(...seats.map((s) => s.columns.length)) + 2
  const cells: HudGridCell[] = []
  const rows: HudGrid['rows'] = []
  seats.forEach((s, i) => {
    const top = i * 2
    rows.push({ size: 'auto', context: { column: s.column } }, { size: 'auto', context: { column: s.column } })
    cells.push({ ...cell(top, 0, text(s.seat), { fg: POSITION[s.seat], bold: true, align: 'left' }, 2, 1), ...(opens ? { popupId: opens } : {}) })
    cells.push(cell(top, 1, text('H'), label({ align: 'center' })))
    cells.push(cell(top + 1, 1, hands(), { align: 'center', fg: HUD_COLORS.sample }))
    s.columns.forEach((c, k) => {
      cells.push(cell(top, k + 2, text(c.abbr), header(c.family)))
      cells.push(cell(top + 1, k + 2, c.content, { align: 'center' }))
    })
  })
  return grid(name, rows, auto(width), cells, {}, fontSize)
}

/** A grid of label and figure pairs, for the popups. */
function figureList(name: string, entries: { abbr: string; section: string; label: string }[], perRow: number, fontSize: number): HudGrid {
  const cells: HudGridCell[] = [cell(0, 0, text(name), { bold: true, fg: HUD_COLORS.text, align: 'left' }, 1, perRow * 2)]
  entries.forEach((e, i) => {
    const row = 1 + Math.floor(i / perRow)
    const col = (i % perRow) * 2
    cells.push(cell(row, col, text(e.abbr), label()))
    cells.push(cell(row, col + 1, stat(e.section, e.label), { align: 'center', bold: true }))
  })
  const rowCount = 1 + Math.ceil(entries.length / perRow)
  return grid(name, auto(rowCount), auto(perRow * 2), cells, { column: 'tot' }, fontSize, true)
}

// --- Popups

function generalPopup(): HudGrid {
  const entries = [
    { abbr: 'VPIP', section: 'preflop', label: 'VPIP' },
    { abbr: 'PFR', section: 'preflop', label: 'PFR' },
    { abbr: 'RFI', section: 'preflop', label: 'Raise First In' },
    { abbr: 'Limp', section: 'preflop', label: 'Open Limp' },
    { abbr: '3B', section: 'preflop', label: '3-Bet' },
    { abbr: 'F3B', section: 'preflop', label: 'Fold to 3-Bet' },
    { abbr: 'F3BS', section: 'preflop', label: 'Fold to 3-Bet Shove' },
    { abbr: 'LF', section: 'preflop', label: 'Limp-Fold' },
    { abbr: 'ISO', section: 'preflop', label: 'Iso Raise' },
    { abbr: 'FvR', section: 'preflop', label: 'Fold vs Raise' },
    { abbr: 'CvR', section: 'preflop', label: 'Call vs Raise' },
    { abbr: 'OS', section: 'shove', label: 'Open Shove' },
    { abbr: 'COS', section: 'shove', label: 'Call Shove' },
    { abbr: 'CB F', section: 'postflop', label: 'cbet_flop' },
    { abbr: 'CB T', section: 'postflop', label: 'cbet_turn' },
    { abbr: 'CB R', section: 'postflop', label: 'cbet_river' },
    { abbr: 'FvCB', section: 'postflop', label: 'fold_to_cbet_flop' },
    { abbr: 'Dk F', section: 'postflop', label: 'donk_flop' },
    { abbr: 'WTSD', section: 'postflop', label: 'wtsd' },
    { abbr: 'WWSF', section: 'postflop', label: 'wwsf' },
    { abbr: 'W$SD', section: 'postflop', label: 'wsd' },
  ]
  const popup = figureList('General', entries, 3, FULL_FONT)
  popup.name = 'General'
  return popup
}

/** Every heads-up figure of both seats, over the seven stack depths: SB columns, then BB columns. */
function headsUpPopup(): HudGrid {
  const sb: [string, string, string][] = [['huSb', 'Open Limp', 'Limp'], ['huSb', 'Raise First In', 'RFI'], ['huSb', 'Limp-Fold vs Raise', 'LF'], ['huSb', 'Limp-Call vs Raise', 'LC'], ['huSb', 'Limp-Raise vs Raise', 'LR'], ['shove', 'Open Shove', 'OS']]
  const bb: [string, string, string][] = [['huBb', 'vs Raise Fold', 'FvR'], ['huBb', 'vs Raise Call', 'CvR'], ['huBb', 'vs Raise 3-Bet', '3B'], ['huBb', 'vs Limp Check', 'X'], ['huBb', 'vs Limp Raise', 'ISO'], ['shove', 'Call Shove', 'COS']]
  const cells: HudGridCell[] = [cell(0, 0, text('HU'), { bold: true, align: 'left' }), cell(0, 1, text('H'), label({ align: 'center' }))]
  const cols: HudGrid['cols'] = [{ size: 'auto' }, { size: 'auto', context: { column: 'sb_hu' } }]
  ;[...sb, ...bb].forEach(([section, name, abbr], i) => {
    const seat = i < sb.length ? 'sb_hu' : 'bb_hu'
    cols.push({ size: 'auto', context: { column: seat } })
    cells.push(cell(0, i + 2, text(abbr), header(i < sb.length ? 'entry' : 'raise')))
    STACK_GROUPS_FULL.forEach((_, r) => cells.push(cell(r + 1, i + 2, stat(section, name), { align: 'center' })))
  })
  const rows: HudGrid['rows'] = [{ size: 'auto' }]
  STACK_GROUPS_FULL.forEach((group, r) => {
    rows.push({ size: 'auto', context: { stack: group } })
    cells.push(cell(r + 1, 0, { kind: 'stackLabel' }, label()))
    cells.push(cell(r + 1, 1, hands(), { align: 'center', fg: HUD_COLORS.sample }))
  })
  return grid('Heads-up', rows, cols, cells, {}, FULL_FONT, true)
}

function threeWayPopup(): HudGrid {
  const columns: { abbr: string; family: Family; section: string; label: string }[] = [
    { abbr: 'VP', family: 'entry', section: 'preflop', label: 'VPIP' },
    { abbr: 'PFR', family: 'entry', section: 'preflop', label: 'PFR' },
    { abbr: 'L', family: 'limp', section: 'preflop', label: 'Open Limp' },
    { abbr: '3B', family: 'raise', section: 'preflop', label: '3-Bet' },
    { abbr: 'F3B', family: 'reaction', section: 'preflop', label: 'Fold to 3-Bet' },
    { abbr: 'OS', family: 'shove', section: 'shove', label: 'Open Shove' },
    { abbr: 'ISO', family: 'raise', section: 'preflop', label: 'Iso Raise' },
    { abbr: 'FvR', family: 'reaction', section: 'preflop', label: 'Fold vs Raise' },
  ]
  const seats = [
    { seat: 'BTN' as const, column: 'btn' },
    { seat: 'SB' as const, column: 'sb_3w' },
    { seat: 'BB' as const, column: 'bb_3w' },
  ]
  const cells: HudGridCell[] = [cell(0, 1, text('H'), label({ align: 'center' }))]
  columns.forEach((c, i) => cells.push(cell(0, i + 2, text(c.abbr), header(c.family))))
  const rows: HudGrid['rows'] = [{ size: 'auto' }]
  seats.forEach((s, r) => {
    rows.push({ size: 'auto', context: { column: s.column } })
    cells.push(cell(r + 1, 0, text(s.seat), { fg: POSITION[s.seat], bold: true, align: 'left' }))
    cells.push(cell(r + 1, 1, hands(), { align: 'center', fg: HUD_COLORS.sample }))
    columns.forEach((c, i) => cells.push(cell(r + 1, i + 2, stat(c.section, c.label), { align: 'center' })))
  })
  return grid('3-way', rows, auto(columns.length + 2), cells, {}, FULL_FONT, true)
}

// --- Layouts

const sbColumnsFull = (): MatrixColumn[] => [
  { abbr: 'VP', family: 'entry', content: stat('preflop', 'VPIP'), key: true },
  { abbr: 'OR', family: 'entry', content: stat('huSb', 'Raise First In'), key: true },
  { abbr: 'F3B', family: 'reaction', content: stat('preflop', 'Fold to 3-Bet') },
  { abbr: 'OS', family: 'shove', content: stat('shove', 'Open Shove') },
  { abbr: 'Limp', family: 'limp', content: stat('huSb', 'Open Limp') },
  { abbr: 'LR', family: 'limp', content: stat('huSb', 'Limp-Raise vs Raise') },
  { abbr: 'LF', family: 'limp', content: stat('huSb', 'Limp-Fold vs Raise') },
  { abbr: 'LC', family: 'limp', content: stat('huSb', 'Limp-Call vs Raise') },
]

const bbColumnsFull = (): MatrixColumn[] => [
  { abbr: 'FvR', family: 'reaction', content: stat('huBb', 'vs Raise Fold'), key: true },
  { abbr: 'CvR', family: 'reaction', content: stat('huBb', 'vs Raise Call') },
  { abbr: '3B', family: 'raise', content: stat('huBb', 'vs Raise 3-Bet'), key: true },
  { abbr: 'COS', family: 'shove', content: stat('shove', 'Call Shove') },
  { abbr: 'ISO', family: 'raise', content: stat('huBb', 'vs Limp Raise') },
  { abbr: 'X', family: 'limp', content: stat('huBb', 'vs Limp Check') },
]

/** Places grids in rows no wider than `maxWidth` pixels, each under the tallest of the row above. */
function flow(grids: HudGrid[], maxWidth: number): Record<string, { dx: number; dy: number }> {
  const offsets: Record<string, { dx: number; dy: number }> = {}
  let x = 0
  let y = 0
  let rowHeight = 0
  for (const g of grids) {
    const size = estimateGridSize(g)
    if (x > 0 && x + size.width > maxWidth) {
      x = 0
      y += rowHeight + COLUMN_GAP_PX
      rowHeight = 0
    }
    offsets[g.id] = { dx: x, dy: y }
    x += size.width + COLUMN_GAP_PX
    rowHeight = Math.max(rowHeight, size.height)
  }
  return offsets
}

const HU_PANEL_WIDTH = 640
const THREE_WAY_PANEL_WIDTH = 380

function headsUpFull(): TemplateInstance {
  const general = generalPopup()
  const heads = headsUpPopup()
  const player = playerBlock(general.id, FULL_FONT)
  const sb = matrix('SB', POSITION.SB, 'sb_hu', STACK_GROUPS_FULL, sbColumnsFull(), FULL_FONT, heads.id)
  const bb = matrix('BB', POSITION.BB, 'bb_hu', STACK_GROUPS_FULL, bbColumnsFull(), FULL_FONT, heads.id)
  const sbPost = streetBox('SB', POSITION.SB, 'sb_hu', [CBET, FOLD_TO_CBET, DONK, DONK_FOLD], FULL_FONT)
  const bbPost = streetBox('BB', POSITION.BB, 'bb_hu', [CBET, FOLD_TO_CBET, DONK, DONK_FOLD], FULL_FONT)
  const grids = [player, sb, bb, sbPost, bbPost]
  return { grids, popups: [general, heads], offsets: flow(grids, HU_PANEL_WIDTH) }
}

function headsUpFlash(): TemplateInstance {
  const general = generalPopup()
  const heads = headsUpPopup()
  const player = playerBlock(general.id, FLASH_FONT)
  const sb = matrix(
    'SB',
    POSITION.SB,
    'sb_hu',
    STACK_GROUPS_FLASH,
    [
      { abbr: 'VP', family: 'entry', content: stat('preflop', 'VPIP'), key: true },
      { abbr: 'OR', family: 'entry', content: stat('huSb', 'Raise First In'), key: true },
      { abbr: 'OS', family: 'shove', content: stat('shove', 'Open Shove') },
      { abbr: 'Limp', family: 'limp', content: stat('huSb', 'Open Limp') },
      { abbr: 'LF', family: 'limp', content: stat('huSb', 'Limp-Fold vs Raise') },
    ],
    FLASH_FONT,
    heads.id,
  )
  const bb = matrix(
    'BB',
    POSITION.BB,
    'bb_hu',
    STACK_GROUPS_FLASH,
    [
      { abbr: 'FvR', family: 'reaction', content: stat('huBb', 'vs Raise Fold'), key: true },
      { abbr: '3B', family: 'raise', content: stat('huBb', 'vs Raise 3-Bet'), key: true },
      { abbr: 'COS', family: 'shove', content: stat('shove', 'Call Shove') },
    ],
    FLASH_FONT,
    heads.id,
  )
  const grids = [player, sb, bb]
  return { grids, popups: [general, heads], offsets: flow(grids, HU_PANEL_WIDTH) }
}

const threeWaySeats = (flash: boolean): Parameters<typeof seatRows>[1] => [
  {
    seat: 'BTN',
    column: 'btn',
    columns: flash
      ? [
          { abbr: 'VP', family: 'entry', content: stat('preflop', 'VPIP') },
          { abbr: 'PFR', family: 'entry', content: stat('preflop', 'PFR') },
          { abbr: 'OS', family: 'shove', content: stat('shove', 'Open Shove') },
        ]
      : [
          { abbr: 'VP', family: 'entry', content: stat('preflop', 'VPIP') },
          { abbr: 'PFR', family: 'entry', content: stat('preflop', 'PFR') },
          { abbr: 'F3S', family: 'reaction', content: stat('preflop', 'Fold to 3-Bet Shove') },
          { abbr: 'L', family: 'limp', content: stat('preflop', 'Open Limp') },
          { abbr: 'LF', family: 'limp', content: stat('preflop', 'Limp-Fold') },
          { abbr: 'OS', family: 'shove', content: stat('shove', 'Open Shove') },
        ],
  },
  {
    seat: 'SB',
    column: 'sb_3w',
    columns: flash
      ? [
          { abbr: 'VP', family: 'entry', content: stat('preflop', 'VPIP') },
          { abbr: '3B', family: 'raise', content: stat('preflop', '3-Bet') },
          { abbr: 'OS', family: 'shove', content: stat('shove', 'Open Shove') },
        ]
      : [
          { abbr: 'VP', family: 'entry', content: stat('preflop', 'VPIP') },
          { abbr: 'PFR', family: 'entry', content: stat('preflop', 'PFR') },
          { abbr: 'F3S', family: 'reaction', content: stat('preflop', 'Fold to 3-Bet Shove') },
          { abbr: '3B', family: 'raise', content: stat('preflop', '3-Bet') },
          { abbr: 'LF', family: 'limp', content: stat('preflop', 'Limp-Fold') },
          { abbr: 'OS', family: 'shove', content: stat('shove', 'Open Shove') },
        ],
  },
  {
    seat: 'BB',
    column: 'bb_3w',
    columns: flash
      ? [
          { abbr: 'FvM', family: 'reaction', content: stat('preflop', 'Fold vs 2x') },
          { abbr: '3BS', family: 'shove', content: stat('preflop', '3-Bet Shove') },
          { abbr: 'ISO', family: 'raise', content: stat('preflop', 'Iso Raise') },
        ]
      : [
          { abbr: 'FvM', family: 'reaction', content: stat('preflop', 'Fold vs 2x') },
          { abbr: '3BS', family: 'shove', content: stat('preflop', '3-Bet Shove') },
          { abbr: 'ISO', family: 'raise', content: stat('preflop', 'Iso Raise') },
          { abbr: 'ISN', family: 'raise', content: stat('preflop', 'Iso Non-All-In') },
          { abbr: 'ISA', family: 'shove', content: stat('preflop', 'Iso All-In') },
        ],
  },
]

function threeWayFull(): TemplateInstance {
  const general = generalPopup()
  const three = threeWayPopup()
  const player = playerBlock(general.id, FULL_FONT)
  const preflop = seatRows('Preflop', threeWaySeats(false), FULL_FONT, three.id)
  // Four boxes in two by two, as one grid: a box is a title, three streets and its lines.
  const boxes = [streetBox('CB', FAMILY.raise, 'tot', [CBET], FULL_FONT), streetBox('FvCB', FAMILY.reaction, 'tot', [FOLD_TO_CBET], FULL_FONT), streetBox('Dk', FAMILY.entry, 'tot', [DONK], FULL_FONT), streetBox('DkF', FAMILY.limp, 'tot', [DONK_FOLD], FULL_FONT)]
  const grids = [player, preflop, ...boxes]
  return { grids, popups: [general, three], offsets: flow(grids, THREE_WAY_PANEL_WIDTH) }
}

function threeWayFlash(): TemplateInstance {
  const general = generalPopup()
  const three = threeWayPopup()
  const player = playerBlock(general.id, FLASH_FONT)
  const preflop = seatRows('Preflop', threeWaySeats(true), FLASH_FONT, three.id)
  const postflop = streetBox('Post', HUD_COLORS.textSecondary, 'tot', [CBET, FOLD_TO_CBET], FLASH_FONT)
  const grids = [player, preflop, postflop]
  return { grids, popups: [general, three], offsets: flow(grids, THREE_WAY_PANEL_WIDTH) }
}

export interface TemplateInfo {
  id: TemplateId
  /** The table size a layout model is for; `null` for a popup model. */
  format: HudFormat | null
  build: () => TemplateInstance
}

export const TEMPLATES: Record<TemplateId, TemplateInfo> = {
  huFull: { id: 'huFull', format: 'headsUp', build: headsUpFull },
  huFlash: { id: 'huFlash', format: 'headsUp', build: headsUpFlash },
  threeWayFull: { id: 'threeWayFull', format: 'threeMax', build: threeWayFull },
  threeWayFlash: { id: 'threeWayFlash', format: 'threeMax', build: threeWayFlash },
  popupGeneral: { id: 'popupGeneral', format: null, build: () => ({ grids: [], popups: [generalPopup()], offsets: {} }) },
  popupHeadsUp: { id: 'popupHeadsUp', format: null, build: () => ({ grids: [], popups: [headsUpPopup()], offsets: {} }) },
  popupThreeWay: { id: 'popupThreeWay', format: null, build: () => ({ grids: [], popups: [threeWayPopup()], offsets: {} }) },
}

/** Where a model's grids sit for each seat: its panel starts at the seat's usual spot. */
export function templatePositions(instance: TemplateInstance, origins: Record<string, GridPosition>): Record<string, SeatPlacements> {
  const out: Record<string, SeatPlacements> = {}
  for (const [seat, origin] of Object.entries(origins)) {
    out[seat] = Object.fromEntries(
      instance.grids.map((g) => {
        const offset = instance.offsets[g.id] ?? { dx: 0, dy: 0 }
        return [g.id, { x: Math.min(1, origin.x + offset.dx / REFERENCE_TABLE.width), y: Math.min(1, origin.y + offset.dy / REFERENCE_TABLE.height) }]
      }),
    )
  }
  return out
}
