/** Pure helpers of the player's own ranges: the 13 x 13 grid, painting, combos and scenario names. */

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
export const TOTAL_COMBOS = 1326
export const HAND_COUNT = 169
export const GRID_SIZE = RANKS.length

/** The hand class at a grid cell: pairs on the diagonal, suited above it, offsuit below. */
export function handAt(row: number, col: number): string {
  if (row === col) return `${RANKS[row]}${RANKS[col]}`
  return row < col ? `${RANKS[row]}${RANKS[col]}s` : `${RANKS[col]}${RANKS[row]}o`
}

/** The 169 hand classes in grid order. */
export const HAND_CLASSES: readonly string[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => handAt(Math.floor(i / GRID_SIZE), i % GRID_SIZE))

/** Grid coordinates of a hand class. */
export function cellOf(hand: string): { row: number; col: number } {
  const first = RANKS.indexOf(hand[0] as (typeof RANKS)[number])
  const second = RANKS.indexOf(hand[1] as (typeof RANKS)[number])
  return hand.endsWith('o') ? { row: second, col: first } : { row: first, col: second }
}

/** Card combinations of a hand class: 6 for a pair, 4 suited, 12 offsuit. */
export function comboCount(hand: string): number {
  if (hand.length === 2) return 6
  return hand.endsWith('s') ? 4 : 12
}

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------

/** The shades offered for an action. */
export const COLOR_SHADES = [
  '#2a2f39', '#3b4352', '#6b7080', '#4caf50', '#34c27a', '#7fd18f', '#5b8def', '#7aa7ff',
  '#6b7aa1', '#a07cf0', '#5d4a8c', '#e0a23f', '#8a6a33', '#f97316', '#ff6b5b', '#e0c341',
] as const

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

const LIGHT_TEXT = '#ffffff'
const DARK_TEXT = '#000000'

function channel(value: number): number {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The more readable of white and black text on `background` (same rule as the backend). */
export function textColor(background: string): string {
  if (!HEX_COLOR.test(background)) return LIGHT_TEXT
  return contrast(background, LIGHT_TEXT) >= contrast(background, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
}

// ---------------------------------------------------------------------------------------------
// Actions and ranges
// ---------------------------------------------------------------------------------------------

export const IMMEDIATES = ['fold', 'check', 'call', 'limp', 'raise', 'iso', 'threebet', 'allin'] as const
export const SIZE_UNITS = ['bb', 'x', 'pct_stack'] as const
export const RESPONSES = ['none', 'fold', 'call', 'allin'] as const

export type Immediate = (typeof IMMEDIATES)[number]
export type SizeUnit = (typeof SIZE_UNITS)[number]
export type Response = (typeof RESPONSES)[number]

export interface RangeAction {
  id: number
  label: string
  color: string
  immediate: Immediate
  sizeValue: number | null
  sizeUnit: SizeUnit | null
  response: Response
  sortOrder: number
  usedHands: number
}

/** hand class -> action id */
export type HandMap = Record<string, number>

export interface ActionStat {
  actionId: number
  combos: number
  /** Share of the 1326 combos, 0..100. */
  percent: number
}

/** Combos and share of every action in a range. */
export function actionStats(hands: HandMap): Map<number, ActionStat> {
  const combos = new Map<number, number>()
  for (const [hand, actionId] of Object.entries(hands)) combos.set(actionId, (combos.get(actionId) ?? 0) + comboCount(hand))
  const out = new Map<number, ActionStat>()
  for (const [actionId, n] of combos) out.set(actionId, { actionId, combos: n, percent: (n / TOTAL_COMBOS) * 100 })
  return out
}

/** Hands missing from a range (the control pill turns amber when there are some). */
export function missingHands(hands: HandMap): string[] {
  return HAND_CLASSES.filter((h) => hands[h] === undefined)
}

/** Readable form of a size: "2 bb", "3x", "50 % stack". */
export function formatSize(value: number | null, unit: SizeUnit | null): string {
  if (value === null || unit === null) return ''
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return unit === 'x' ? `${n}x` : unit === 'bb' ? `${n} bb` : `${n} %`
}

// ---------------------------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------------------------

export type PaintMode = 'brush' | 'rect' | 'picker'

/** Every hand of the row of `hand` (Shift + click). */
export function rowOf(hand: string): string[] {
  const { row } = cellOf(hand)
  return Array.from({ length: GRID_SIZE }, (_, col) => handAt(row, col))
}

/** Every hand of the rectangle spanned by two hands. */
export function rectBetween(a: string, b: string): string[] {
  const [from, to] = [cellOf(a), cellOf(b)]
  const out: string[] = []
  for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row++) {
    for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col++) out.push(handAt(row, col))
  }
  return out
}

/** The range with `cells` set to `actionId` (the input is not modified). */
export function paint(hands: HandMap, cells: readonly string[], actionId: number): HandMap {
  const next = { ...hands }
  for (const cell of cells) next[cell] = actionId
  return next
}

/** The hands whose action differs from the saved range. */
export function changedHands(current: HandMap, saved: HandMap): string[] {
  return HAND_CLASSES.filter((h) => current[h] !== saved[h])
}

/** Undo / redo history of the painted range. */
export interface PaintHistory {
  past: HandMap[]
  present: HandMap
  future: HandMap[]
}

const HISTORY_LIMIT = 100

export function startHistory(hands: HandMap): PaintHistory {
  return { past: [], present: hands, future: [] }
}

/** Opens a stroke: the range as it is now becomes one undo step, whatever the stroke paints. */
export function beginStroke(history: PaintHistory): PaintHistory {
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: history.present, future: [] }
}

/** Paints inside the open stroke. */
export function strokePaint(history: PaintHistory, cells: readonly string[], actionId: number): PaintHistory {
  return { ...history, present: paint(history.present, cells, actionId) }
}

/** Steps back to the last range that differs from the current one. */
export function undo(history: PaintHistory): PaintHistory {
  const past = [...history.past]
  let previous = past.pop()
  while (previous && changedHands(previous, history.present).length === 0) previous = past.pop()
  if (!previous) return { ...history, past: [] }
  return { past, present: previous, future: [history.present, ...history.future] }
}

export function redo(history: PaintHistory): PaintHistory {
  const [next, ...rest] = history.future
  if (!next) return history
  return { past: [...history.past, history.present], present: next, future: rest }
}

// ---------------------------------------------------------------------------------------------
// Scenarios: situation, line and name
// ---------------------------------------------------------------------------------------------

export type RangeFormat = '3max' | 'hu'
export type Position = 'BTN' | 'SB' | 'BB'
export type LineVerb = 'fold' | 'call' | 'raise' | 'all-in'
export type Opponent = 'any' | 'reg'

export const LINE_VERBS: readonly LineVerb[] = ['fold', 'call', 'raise', 'all-in']

const SEATS: Record<RangeFormat, readonly Position[]> = { '3max': ['BTN', 'SB', 'BB'], hu: ['SB', 'BB'] }

export function seatsOf(format: RangeFormat): readonly Position[] {
  return SEATS[format]
}

/** The seats that speak before the hero, in table order. */
export function seatsBefore(format: RangeFormat, hero: Position): Position[] {
  const seats = SEATS[format]
  return seats.slice(0, Math.max(0, seats.indexOf(hero)))
}

/** The stored line ("btn:fold,sb:call"); empty when the hero speaks first. */
export function buildLine(format: RangeFormat, hero: Position, verbs: Partial<Record<Position, LineVerb>>): string {
  return seatsBefore(format, hero)
    .map((seat) => `${seat.toLowerCase()}:${verbs[seat] ?? 'fold'}`)
    .join(',')
}

/** The verb of every seat in a stored line. */
export function parseLine(line: string): Partial<Record<Position, LineVerb>> {
  const out: Partial<Record<Position, LineVerb>> = {}
  for (const entry of line.split(',').filter(Boolean)) {
    const [seat, verb] = entry.split(':')
    out[seat.toUpperCase() as Position] = verb as LineVerb
  }
  return out
}

/** "BTN fold → SB limp": the line as the wizard summarises it. */
export function lineSummary(line: string): string {
  return line
    .split(',')
    .filter(Boolean)
    .map((entry) => {
      const [seat, verb] = entry.split(':')
      return `${seat.toUpperCase()} ${verb === 'call' ? 'limp' : verb}`
    })
    .join(' → ')
}

function describeLine(line: string): string {
  let raised = false
  const parts: string[] = []
  for (const entry of line.split(',').filter(Boolean)) {
    const [seat, verb] = entry.split(':')
    let text: string
    if (verb === 'fold') continue
    if (verb === 'call') text = raised ? 'call' : 'limp'
    else if (verb === 'raise' || verb === 'bet') {
      text = raised ? '3bet' : 'open'
      raised = true
    } else if (verb === 'all-in') {
      text = 'shove'
      raised = true
    } else text = verb
    parts.push(`${seat.toUpperCase()} ${text}`)
  }
  return parts.join(', ')
}

/** The name the wizard proposes (same rule as the backend): "BB vs SB limp · Reg". */
export function defaultName(format: RangeFormat, hero: Position, line: string, opponent: Opponent): string {
  const seat = format === 'hu' ? `${hero} (HU)` : hero
  const described = describeLine(line)
  let name = line === '' ? `${seat} first in` : described === '' ? `${seat} vs folds` : `${seat} vs ${described}`
  if (opponent === 'reg') name += ' · Reg'
  return name
}

export interface SpotSummary {
  id: number
  name: string
  format: RangeFormat
  heroPosition: Position
  line: string
  lineSizes: Record<string, number> | null
  opponent: Opponent
  studyOnly: boolean
  scenarios: { id: number; stackBb: number }[]
}

export interface ProgramSummary {
  id: number
  name: string
  sortOrder: number
  spotIds: number[]
}

export interface SpotGroup {
  key: string
  format: RangeFormat
  hero: Position
  spots: SpotSummary[]
}

const GROUP_ORDER: { format: RangeFormat; hero: Position }[] = [
  { format: '3max', hero: 'BTN' },
  { format: '3max', hero: 'SB' },
  { format: '3max', hero: 'BB' },
  { format: 'hu', hero: 'SB' },
  { format: 'hu', hero: 'BB' },
]

/** Spots grouped by format and hero position, in table order; empty groups are left out. */
export function groupSpots(spots: readonly SpotSummary[]): SpotGroup[] {
  return GROUP_ORDER.map(({ format, hero }) => ({
    key: `${format}-${hero}`,
    format,
    hero,
    spots: spots.filter((s) => s.format === format && s.heroPosition === hero),
  })).filter((g) => g.spots.length > 0)
}

/** The name without its "BB vs " lead: "vs SB limp (Reg)" in the tree. */
export function shortName(spot: Pick<SpotSummary, 'format' | 'heroPosition' | 'line' | 'opponent'>): string {
  const base = defaultName(spot.format, spot.heroPosition, spot.line, 'any')
  const rest = base.slice(base.indexOf(' ') + 1).replace(/^\(HU\) /, '')
  return spot.opponent === 'reg' ? `${rest} (Reg)` : rest
}

/** Percentages and counts as the UI shows them: a comma in French. */
export function formatNumber(value: number, language: string, digits = 1): string {
  return new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

/** A depth without a useless decimal: 22, 12.5. */
export function formatDepth(stack: number): string {
  return Number.isInteger(stack) ? String(stack) : String(Math.round(stack * 10) / 10)
}
