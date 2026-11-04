import { hudBaselines } from '@/views/Stats/hudText'

/** Version of the stored settings; bump it when the shape changes. */
export const HUD_SETTINGS_VERSION = 2
export const DEFAULT_OPACITY = 0.94
export const MIN_OPACITY = 0.4
export const MAX_OPACITY = 1
export const DEFAULT_SIZE = 1
export const MIN_SIZE = 0.7
export const MAX_SIZE = 1.5
/** Opportunities below which a figure is shown muted. Placeholder to be confirmed (`[N]` in the design). */
export const DEFAULT_MIN_SAMPLE = 5
/** Placement grid, as a fraction of the table width. */
export const GRID_STEP = 0.02
export const MAX_PROFILES = 20
const MAX_NAME_LENGTH = 40
const MAX_ABBR_LENGTH = 6
const MAX_CELLS_PER_TABLE = 12
const MAX_TABLES = 8
const MAX_STRIP_CELLS = 8

export type HudRoom = 'Winamax' | 'Unibet'
/** The table size a layout is for: the panel switches with it, between two hands. */
export type HudFormat = 'threeMax' | 'headsUp'

export const HUD_ROOMS: HudRoom[] = ['Winamax', 'Unibet']
export const HUD_FORMATS: HudFormat[] = ['threeMax', 'headsUp']
/** Seats a panel can sit on, relative to the hero (+1 is the next seat in turn order). */
export const SEATS_BY_FORMAT: Record<HudFormat, string[]> = { threeMax: ['+1', '+2'], headsUp: ['+1'] }

/** Stack depths (big blinds) a table can be split by, deepest first; the backend names them the same way. */
export const STACK_BUCKETS = ['13+', '11-13', '9-11', '7-9', '5-7', '3-5', '0-3'] as const

/** What a figure measures, for the colour of its header. */
export type HudFamily = 'open' | 'limp' | 'shove' | 'defense' | 'threeBet' | 'postflop' | 'showdown' | 'count'

export interface HudCell {
  /** Section and label of the stat in the backend catalog (`GET /hud/catalog`). */
  section: string
  label: string
  /** Table column of the stat, where it has several; a table's own column wins. */
  column: string | null
  abbr: string
  family: HudFamily
  /** Below this value the figure is shown in the "below range" colour; `null` for no limit. */
  below: number | null
  above: number | null
  /** Opportunities needed before the figure is judged. */
  minSample: number
}

export interface HudTable {
  id: string
  /** Seat or situation name, shown as is (`SB`, `BTN`...). */
  title: string
  /** `stack` tables have one row per stack depth; `single` tables one row. */
  rows: 'stack' | 'single'
  /** Table column every cell of the table is counted in (`sb_hu`, `bb_3w`...). */
  column: string | null
  cells: HudCell[]
}

export interface HudLayout {
  /** The strip above the tables: showdown figures and how many hands the figures rest on. */
  strip: HudCell[]
  tables: HudTable[]
}

export interface HudProfile {
  id: string
  name: string
  layouts: Record<HudFormat, HudLayout>
  opacity: number
  size: number
  showHero: boolean
}

export interface PanelPosition {
  /** Left and top edges as fractions of the table window. */
  x: number
  y: number
}

export type Placements = Record<HudRoom, Record<HudFormat, Record<string, PanelPosition>>>

export interface HudSettings {
  version: number
  /** The HUD is off until the user turns it on. */
  enabled: boolean
  activeProfileId: string
  profiles: HudProfile[]
  placements: Placements
  snapToGrid: boolean
}

// --- Default layouts

const baselineRange = (key: string | undefined): { below: number; above: number } | null => {
  const baseline = key ? hudBaselines[key] : undefined
  return baseline ? { below: baseline.target - baseline.tolerance, above: baseline.target + baseline.tolerance } : null
}

/** `baseline` is the key of the figure in `hudBaselines`, when it has one. */
function cell(section: string, label: string, abbr: string, family: HudFamily, baseline?: string, column: string | null = null): HudCell {
  const range = baselineRange(baseline)
  return { section, label, column, abbr, family, below: range?.below ?? null, above: range?.above ?? null, minSample: DEFAULT_MIN_SAMPLE }
}

const strip = (): HudCell[] => [
  cell('postflop', 'wtsd', 'WTSD', 'showdown', 'WTSD'),
  cell('postflop', 'wwsf', 'WWSF', 'showdown'),
  cell('postflop', 'wsd', 'W$SD', 'showdown'),
  cell('meta', 'hands', 'HU', 'count', undefined, 'hu'),
  cell('meta', 'hands', '3W', 'count', undefined, 'three_way'),
]

const postflopCells = (): HudCell[] => [
  cell('postflop', 'cbet_flop', 'CB', 'postflop', 'CBet'),
  cell('postflop', 'cbet_turn', 'CB2', 'postflop'),
  cell('postflop', 'fold_to_cbet_flop', 'FvCB', 'postflop'),
  cell('postflop', 'donk_flop', 'Dk', 'postflop'),
]

const table = (id: string, title: string, rows: HudTable['rows'], column: string, cells: HudCell[]): HudTable => ({ id, title, rows, column, cells })

export const defaultLayouts = (): Record<HudFormat, HudLayout> => ({
  headsUp: {
    strip: strip(),
    tables: [
      table('sb', 'SB', 'stack', 'sb_hu', [
        cell('huSb', 'Raise First In', 'Rfi', 'open'),
        cell('huSb', 'Open Limp', 'L', 'limp', 'Limp'),
        cell('huSb', 'Limp-Fold vs Raise', 'LF', 'limp', 'LF'),
        cell('shove', 'Open Shove', 'OS', 'shove', 'OS'),
      ]),
      table('bb', 'BB', 'stack', 'bb_hu', [
        cell('huBb', 'vs Raise Fold', 'FvR', 'defense', 'FvR'),
        cell('huBb', 'vs Raise 3-Bet', '3B', 'threeBet'),
        cell('preflop', '3-Bet Shove', '3BS', 'shove'),
        cell('shove', 'Call Shove', 'COS', 'shove', 'COS'),
        cell('huBb', 'vs Limp Raise', 'IS', 'open'),
      ]),
      table('sb-post', 'SB', 'single', 'sb_hu', postflopCells()),
      table('bb-post', 'BB', 'single', 'bb_hu', postflopCells()),
    ],
  },
  threeMax: {
    strip: strip(),
    tables: [
      table('btn', 'BTN', 'single', 'btn', [
        cell('preflop', 'VPIP', 'VP', 'open', 'VPIP'),
        cell('preflop', 'PFR', 'PFR', 'open'),
        cell('preflop', 'Fold to 3-Bet Shove', 'F3S', 'defense'),
        cell('preflop', 'Open Limp', 'L', 'limp', 'Limp'),
        cell('preflop', 'Limp-Fold', 'LF', 'limp', 'LF'),
        cell('shove', 'Open Shove', 'OS', 'shove', 'OS'),
      ]),
      table('sb', 'SB', 'single', 'sb_3w', [
        cell('preflop', 'VPIP', 'VP', 'open', 'VPIP'),
        cell('preflop', 'PFR', 'PFR', 'open'),
        cell('preflop', 'Fold to 3-Bet Shove', 'F3S', 'defense'),
        cell('preflop', 'Limp-Fold', 'LF', 'limp', 'LF'),
        cell('shove', 'Open Shove', 'OS', 'shove', 'OS'),
        cell('preflop', '3-Bet', '3B', 'threeBet', '3Bet'),
      ]),
      table('bb', 'BB', 'single', 'bb_3w', [
        cell('preflop', 'Fold vs 2x', 'FvM', 'defense'),
        cell('preflop', '3-Bet Shove', '3BS', 'shove'),
        cell('preflop', 'Iso Raise', 'IST', 'open', 'ISO'),
        cell('preflop', 'Iso Non-All-In', 'ISN', 'open', 'ISN'),
        cell('preflop', 'Iso All-In', 'ISS', 'shove', 'ISA'),
      ]),
      table('btn-post', 'BTN', 'single', 'btn', postflopCells()),
      table('sb-post', 'SB', 'single', 'sb_3w', postflopCells()),
      table('bb-post', 'BB', 'single', 'bb_3w', postflopCells()),
    ],
  },
})

export const DEFAULT_PROFILE_ID = 'default'
const DEFAULT_PROFILE_NAME = 'Spin'

export const newProfileId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export const defaultProfile = (id: string, name: string): HudProfile => ({
  id,
  name,
  layouts: defaultLayouts(),
  opacity: DEFAULT_OPACITY,
  size: DEFAULT_SIZE,
  showHero: false,
})

/** Where panels sit on a fresh install: out of the way of the cards and the buttons. */
export const defaultPlacements = (): Placements => {
  const forRoom = () => ({
    threeMax: { '+1': { x: 0.01, y: 0.1 }, '+2': { x: 0.57, y: 0.1 } },
    headsUp: { '+1': { x: 0.3, y: 0.05 } },
  })
  return { Winamax: forRoom(), Unibet: forRoom() }
}

export const defaultSettings = (): HudSettings => ({
  version: HUD_SETTINGS_VERSION,
  enabled: false,
  activeProfileId: DEFAULT_PROFILE_ID,
  profiles: [defaultProfile(DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME)],
  placements: defaultPlacements(),
  snapToGrid: true,
})

// --- Requests to the backend

/** Identifies a figure in a player's answer. */
export const figureKey = (section: string, label: string, column: string | null, bucket: string | null) =>
  `${section}:${label}:${column ?? ''}:${bucket ?? ''}`

export interface HudStatRequest {
  section: string
  label: string
  column: string | null
  bucket: string | null
}

/** The column a cell is counted in: its table's, or its own. */
export const columnOf = (tableColumn: string | null, c: HudCell) => tableColumn ?? c.column

/** Every figure a layout shows, once each, as the `POST /hud/players` request wants them. */
export function requestsOf(layout: HudLayout): HudStatRequest[] {
  const seen = new Set<string>()
  const out: HudStatRequest[] = []
  const add = (section: string, label: string, column: string | null, bucket: string | null) => {
    const key = figureKey(section, label, column, bucket)
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ section, label, column, bucket })
    }
  }
  for (const c of layout.strip) add(c.section, c.label, c.column, null)
  for (const t of layout.tables) {
    if (t.rows === 'stack') {
      for (const bucket of STACK_BUCKETS) {
        add('meta', 'hands', t.column, bucket)
        for (const c of t.cells) add(c.section, c.label, columnOf(t.column, c), bucket)
      }
    } else {
      for (const c of t.cells) add(c.section, c.label, columnOf(t.column, c), null)
    }
  }
  return out
}

// --- Validation: stored files and imported files are untrusted input.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const finiteNumber = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback

const optionalLimit = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 100) : null

const text = (value: unknown, fallback: string, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback

const FAMILIES: HudFamily[] = ['open', 'limp', 'shove', 'defense', 'threeBet', 'postflop', 'showdown', 'count']
const isFamily = (value: unknown): value is HudFamily => FAMILIES.includes(value as HudFamily)

function sanitizeCell(raw: unknown): HudCell | null {
  if (!isRecord(raw) || typeof raw.section !== 'string' || typeof raw.label !== 'string') return null
  return {
    section: raw.section.slice(0, 40),
    label: raw.label.slice(0, 60),
    column: typeof raw.column === 'string' ? raw.column.slice(0, 20) : null,
    abbr: text(raw.abbr, raw.label, MAX_ABBR_LENGTH),
    family: isFamily(raw.family) ? raw.family : 'open',
    below: optionalLimit(raw.below),
    above: optionalLimit(raw.above),
    minSample: Math.round(finiteNumber(raw.minSample, DEFAULT_MIN_SAMPLE, 0, 100000)),
  }
}

function sanitizeCells(raw: unknown, max: number): HudCell[] {
  return (Array.isArray(raw) ? raw.slice(0, max) : []).map(sanitizeCell).filter((c): c is HudCell => c !== null)
}

function sanitizeTable(raw: unknown, index: number): HudTable | null {
  if (!isRecord(raw)) return null
  const cells = sanitizeCells(raw.cells, MAX_CELLS_PER_TABLE)
  if (cells.length === 0) return null
  return {
    id: text(raw.id, `t${index}`, 30),
    title: text(raw.title, `T${index + 1}`, 12),
    rows: raw.rows === 'stack' ? 'stack' : 'single',
    column: typeof raw.column === 'string' ? raw.column.slice(0, 20) : null,
    cells,
  }
}

function sanitizeLayout(raw: unknown, fallback: HudLayout): HudLayout {
  if (!isRecord(raw)) return fallback
  const tables = (Array.isArray(raw.tables) ? raw.tables.slice(0, MAX_TABLES) : [])
    .map(sanitizeTable)
    .filter((t): t is HudTable => t !== null)
  const stripCells = sanitizeCells(raw.strip, MAX_STRIP_CELLS)
  return { strip: stripCells, tables: tables.length > 0 ? tables : fallback.tables }
}

function sanitizeProfile(raw: unknown, index: number): HudProfile | null {
  if (!isRecord(raw)) return null
  const fallback = defaultLayouts()
  const layoutsRaw = isRecord(raw.layouts) ? raw.layouts : {}
  return {
    id: text(raw.id, newProfileId(), 60),
    name: text(raw.name, `Profile ${index + 1}`, MAX_NAME_LENGTH),
    layouts: { headsUp: sanitizeLayout(layoutsRaw.headsUp, fallback.headsUp), threeMax: sanitizeLayout(layoutsRaw.threeMax, fallback.threeMax) },
    opacity: finiteNumber(raw.opacity, DEFAULT_OPACITY, MIN_OPACITY, MAX_OPACITY),
    size: finiteNumber(raw.size, DEFAULT_SIZE, MIN_SIZE, MAX_SIZE),
    showHero: raw.showHero === true,
  }
}

function sanitizePlacements(raw: unknown): Placements {
  const result = defaultPlacements()
  if (!isRecord(raw)) return result
  for (const room of HUD_ROOMS) {
    const roomRaw = raw[room]
    if (!isRecord(roomRaw)) continue
    for (const format of HUD_FORMATS) {
      const formatRaw = roomRaw[format]
      if (!isRecord(formatRaw)) continue
      for (const seat of SEATS_BY_FORMAT[format]) {
        const position = formatRaw[seat]
        if (isRecord(position)) {
          result[room][format][seat] = { x: finiteNumber(position.x, 0, 0, 1), y: finiteNumber(position.y, 0, 0, 1) }
        }
      }
    }
  }
  return result
}

/** Stored settings, repaired where they do not match the current shape. */
export function sanitizeSettings(raw: unknown): HudSettings {
  if (!isRecord(raw)) return defaultSettings()
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles.slice(0, MAX_PROFILES) : [])
    .map(sanitizeProfile)
    .filter((p): p is HudProfile => p !== null)
  if (profiles.length === 0) profiles.push(defaultProfile(DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME))
  const active = profiles.some((p) => p.id === raw.activeProfileId) ? (raw.activeProfileId as string) : profiles[0].id
  // Positions saved by the first layout (version 1) described a much smaller panel: start over.
  const placements = raw.version === HUD_SETTINGS_VERSION ? sanitizePlacements(raw.placements) : defaultPlacements()
  return {
    version: HUD_SETTINGS_VERSION,
    enabled: raw.enabled === true,
    activeProfileId: active,
    profiles,
    placements,
    snapToGrid: raw.snapToGrid !== false,
  }
}

const PROFILES_FILE_KIND = 'spintracker-hud-profiles'

/** Profiles as a file the user can share: no positions, no player data. */
export const exportProfiles = (profiles: HudProfile[]): string =>
  JSON.stringify({ kind: PROFILES_FILE_KIND, version: HUD_SETTINGS_VERSION, profiles }, null, 2)

/** Profiles read from a shared file, or `null` when the file is not one. Ids are regenerated. */
export function importProfiles(content: string): HudProfile[] | null {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.kind !== PROFILES_FILE_KIND || !Array.isArray(raw.profiles)) return null
  const profiles = raw.profiles
    .slice(0, MAX_PROFILES)
    .map(sanitizeProfile)
    .filter((p): p is HudProfile => p !== null)
    .map((p) => ({ ...p, id: newProfileId() }))
  return profiles.length > 0 ? profiles : null
}

/** Rounds to the placement grid. */
export const snap = (value: number) => Math.round(value / GRID_STEP) * GRID_STEP

/** Which colour a figure takes. `sample` is the number of opportunities behind it; below the threshold nothing is judged. */
export type HudTone = 'muted' | 'below' | 'above' | 'normal'

export function toneOf(c: Pick<HudCell, 'below' | 'above' | 'minSample'>, value: number | null, sample: number): HudTone {
  if (value === null || sample < c.minSample) return 'muted'
  if (c.below !== null && value < c.below) return 'below'
  if (c.above !== null && value > c.above) return 'above'
  return 'normal'
}
