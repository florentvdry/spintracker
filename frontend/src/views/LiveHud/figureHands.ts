/** The hands behind a HUD figure: what the backend returns and how the popup reads it. */
import type { Json } from '@/services/ipcService'

/** A stat held on the pointer this long opens the list of its hands. */
export const HOVER_DELAY_MS = 2000
/** Once the pointer leaves, the popup closes after this pause, so it can be reached across the gap. */
export const HOVER_CLOSE_DELAY_MS = 300
export const FIGURE_HANDS_LIMIT = 30

/** Which stat a cell shows, the way the backend is asked for its hands. */
export interface FigureRef {
  section: string
  label: string
  column: string | null
  /** The stack depths of the cell's group; none means all depths. */
  buckets: string[]
}

/** The hands where the player did it, or every hand where they could have. */
export type HandsOf = 'done' | 'chances'

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise'
export type StreetName = 'preflop' | 'flop' | 'turn' | 'river'

export interface HandAction {
  /** The player the list is about (the others are opponents). */
  own: boolean
  kind: ActionKind
  /** What the action puts in, in big blinds. */
  bb: number | null
  allIn: boolean
}

export interface HandStreet {
  street: StreetName
  cards: string[]
  potBb: number | null
  actions: HandAction[]
}

export interface FigureHand {
  id: string
  playedAt: string
  stackBb: number | null
  cards: string[]
  resultBb: number | null
  /** Whether the player did what the figure counts (a chance can be let go). */
  done: boolean
  streets: HandStreet[]
}

export interface FigureHands {
  /** How many hands there are in all; the list holds the newest of them. */
  total: number
  hands: FigureHand[]
}

const KINDS: readonly string[] = ['fold', 'check', 'call', 'bet', 'raise']
const STREETS: readonly string[] = ['preflop', 'flop', 'turn', 'river']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const cardsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((c): c is string => typeof c === 'string') : [])

function parseAction(raw: unknown): HandAction | null {
  if (!isRecord(raw) || typeof raw.kind !== 'string' || !KINDS.includes(raw.kind)) return null
  return { own: raw.own === true, kind: raw.kind as ActionKind, bb: numberOrNull(raw.bb), allIn: raw.allIn === true }
}

function parseStreet(raw: unknown): HandStreet | null {
  if (!isRecord(raw) || typeof raw.street !== 'string' || !STREETS.includes(raw.street)) return null
  const actions = (Array.isArray(raw.actions) ? raw.actions : []).map(parseAction).filter((a): a is HandAction => a !== null)
  return { street: raw.street as StreetName, cards: cardsOf(raw.cards), potBb: numberOrNull(raw.potBb), actions }
}

function parseHand(raw: unknown): FigureHand | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const streets = (Array.isArray(raw.streets) ? raw.streets : []).map(parseStreet).filter((s): s is HandStreet => s !== null)
  return {
    id: raw.id,
    playedAt: typeof raw.playedAt === 'string' ? raw.playedAt : '',
    stackBb: numberOrNull(raw.stackBb),
    cards: cardsOf(raw.cards),
    resultBb: numberOrNull(raw.resultBb),
    done: raw.done === true,
    streets,
  }
}

/** The answer of the backend, checked: anything unexpected is dropped rather than shown. */
export function parseFigureHands(data: unknown): FigureHands | null {
  if (!isRecord(data) || typeof data.total !== 'number' || !Array.isArray(data.hands)) return null
  return { total: data.total, hands: data.hands.map(parseHand).filter((h): h is FigureHand => h !== null) }
}

export function figureHandsBody(room: string, hero: string, player: string, figure: FigureRef, which: HandsOf, limit = FIGURE_HANDS_LIMIT): Json {
  return {
    room,
    heroName: hero,
    player,
    stat: { section: figure.section, label: figure.label, column: figure.column },
    buckets: figure.buckets,
    which,
    limit,
  }
}

/** A catalog label as a title: `cbet_flop` becomes `Cbet flop`; names that are already words stay. */
export function prettyLabel(label: string): string {
  const text = label.replace(/_/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Big blinds with at most one decimal and no trailing zero: `6.5`, `7`. */
export function formatBb(value: number): string {
  const text = value.toFixed(1)
  return text.endsWith('.0') ? text.slice(0, -2) : text
}

const KIND_LETTER: Record<ActionKind, string> = { fold: 'F', check: 'X', call: 'C', bet: 'B', raise: 'R' }

/** One action as a poker player writes it: `R6.5` raises to 6.5 bb, `X` checks, `AI14.9` is all-in. */
export function actionLabel(action: HandAction): string {
  const size = action.bb === null ? '' : formatBb(action.bb)
  if (action.allIn && action.kind !== 'fold' && action.kind !== 'check') return `AI${size}`
  return action.kind === 'fold' || action.kind === 'check' ? KIND_LETTER[action.kind] : `${KIND_LETTER[action.kind]}${size}`
}
