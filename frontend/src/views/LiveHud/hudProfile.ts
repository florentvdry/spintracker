import { hudBaselines } from '@/views/Stats/hudText'

/** Version of the stored settings; bump it when the shape changes. */
export const HUD_SETTINGS_VERSION = 1
export const DEFAULT_OPACITY = 0.94
export const MIN_OPACITY = 0.4
export const MAX_OPACITY = 1
export const DEFAULT_SIZE = 1
export const MIN_SIZE = 0.7
export const MAX_SIZE = 1.5
/** Hands below which a figure is shown muted. Placeholder to be confirmed (`[N]` in the design). */
export const DEFAULT_MIN_SAMPLE = 20
/** Placement grid, as a fraction of the table width. */
export const GRID_STEP = 0.02
export const MAX_PROFILES = 20
const MAX_NAME_LENGTH = 40
const MAX_ABBR_LENGTH = 6
const MAX_STATS_PER_VARIANT = 12

export type HudVariant = 'spin' | 'compact' | 'minimal'
export type HudBlock = 'threeWay' | 'headsUp' | 'main'
export type HudRoom = 'Winamax' | 'Unibet'
export type HudFormat = 'threeMax' | 'headsUp'

export const HUD_VARIANTS: HudVariant[] = ['spin', 'compact', 'minimal']
export const HUD_ROOMS: HudRoom[] = ['Winamax', 'Unibet']
export const HUD_FORMATS: HudFormat[] = ['threeMax', 'headsUp']
/** Seats a panel can sit on, relative to the hero (+1 is the next seat in turn order). */
export const SEATS_BY_FORMAT: Record<HudFormat, string[]> = { threeMax: ['+1', '+2'], headsUp: ['+1'] }

export interface HudStatRow {
  /** Section and label of the stat in the backend registry (`GET /hud/catalog`). */
  section: string
  label: string
  /** Table column of the stat, where its section has several. */
  column: string | null
  block: HudBlock
  abbr: string
  /** Below this value the figure is shown in the "below range" colour; `null` for no limit. */
  below: number | null
  above: number | null
  minSample: number
}

export interface HudProfile {
  id: string
  name: string
  variant: HudVariant
  /** Each presentation keeps its own list of stats, so switching never loses edits. */
  stats: Record<HudVariant, HudStatRow[]>
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

const baselineRange = (key: string): { below: number; above: number } | null => {
  const baseline = hudBaselines[key]
  return baseline ? { below: baseline.target - baseline.tolerance, above: baseline.target + baseline.tolerance } : null
}

function row(section: string, label: string, column: string | null, block: HudBlock, abbr: string, baseline?: string): HudStatRow {
  const range = baseline ? baselineRange(baseline) : null
  return { section, label, column, block, abbr, below: range?.below ?? null, above: range?.above ?? null, minSample: DEFAULT_MIN_SAMPLE }
}

export const defaultStats = (): Record<HudVariant, HudStatRow[]> => ({
  spin: [
    row('threeWayPreflop', 'BTN RFI', null, 'threeWay', 'BTN'),
    row('threeWayPreflop', 'SB RFI', null, 'threeWay', 'SB'),
    row('threeWayPreflop', 'SB Complete', null, 'threeWay', 'Lp'),
    row('threeWayPreflop', 'BB vs Steal Fold', null, 'threeWay', 'FvS'),
    row('huSb', 'Raise First In', null, 'headsUp', 'Rfi'),
    row('huSb', 'Open Limp', null, 'headsUp', 'Lp'),
    row('huBb', 'vs Raise Fold', null, 'headsUp', 'FvR', 'FvR'),
    row('huBb', 'vs Raise 3-Bet', null, 'headsUp', '3B'),
  ],
  compact: [
    row('preflop', 'VPIP', 'tot', 'main', 'VPIP', 'VPIP'),
    row('preflop', 'PFR', 'tot', 'main', 'PFR'),
    row('preflop', '3-Bet', 'tot', 'main', '3B', '3Bet'),
    row('vsSteal', 'Fold', 'tot', 'main', 'FvS'),
  ],
  minimal: [row('preflop', 'VPIP', 'tot', 'main', 'VPIP', 'VPIP'), row('preflop', 'PFR', 'tot', 'main', 'PFR')],
})

export const DEFAULT_PROFILE_ID = 'default'
const DEFAULT_PROFILE_NAME = 'Spin'

export const newProfileId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export const defaultProfile = (id: string, name: string): HudProfile => ({
  id,
  name,
  variant: 'spin',
  stats: defaultStats(),
  opacity: DEFAULT_OPACITY,
  size: DEFAULT_SIZE,
  showHero: false,
})

/** Where panels sit on a fresh install: out of the way of the cards and the buttons. */
export const defaultPlacements = (): Placements => {
  const seats = (positions: Record<string, PanelPosition>) => positions
  const forRoom = () => ({
    threeMax: seats({ '+1': { x: 0.04, y: 0.12 }, '+2': { x: 0.66, y: 0.12 } }),
    headsUp: seats({ '+1': { x: 0.36, y: 0.06 } }),
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

// --- Validation: stored files and imported files are untrusted input.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const finiteNumber = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback

const optionalLimit = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 100) : null

const text = (value: unknown, fallback: string, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback

const isBlock = (value: unknown): value is HudBlock => value === 'threeWay' || value === 'headsUp' || value === 'main'
const isVariant = (value: unknown): value is HudVariant => HUD_VARIANTS.includes(value as HudVariant)

function sanitizeRow(raw: unknown): HudStatRow | null {
  if (!isRecord(raw) || typeof raw.section !== 'string' || typeof raw.label !== 'string') return null
  return {
    section: raw.section.slice(0, 40),
    label: raw.label.slice(0, 60),
    column: typeof raw.column === 'string' ? raw.column.slice(0, 20) : null,
    block: isBlock(raw.block) ? raw.block : 'main',
    abbr: text(raw.abbr, raw.label, MAX_ABBR_LENGTH),
    below: optionalLimit(raw.below),
    above: optionalLimit(raw.above),
    minSample: Math.round(finiteNumber(raw.minSample, DEFAULT_MIN_SAMPLE, 0, 100000)),
  }
}

function sanitizeProfile(raw: unknown, index: number): HudProfile | null {
  if (!isRecord(raw)) return null
  const fallback = defaultStats()
  const stats = { ...fallback }
  if (isRecord(raw.stats)) {
    for (const variant of HUD_VARIANTS) {
      const list = raw.stats[variant]
      if (!Array.isArray(list)) continue
      const rows = list.slice(0, MAX_STATS_PER_VARIANT).map(sanitizeRow).filter((r): r is HudStatRow => r !== null)
      if (rows.length > 0) stats[variant] = rows
    }
  }
  return {
    id: text(raw.id, newProfileId(), 60),
    name: text(raw.name, `Profile ${index + 1}`, MAX_NAME_LENGTH),
    variant: isVariant(raw.variant) ? raw.variant : 'spin',
    stats,
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
  return {
    version: HUD_SETTINGS_VERSION,
    enabled: raw.enabled === true,
    activeProfileId: active,
    profiles,
    placements: sanitizePlacements(raw.placements),
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

export function toneOf(row: HudStatRow, value: number | null, sample: number): HudTone {
  if (value === null || sample < row.minSample) return 'muted'
  if (row.below !== null && value < row.below) return 'below'
  if (row.above !== null && value > row.above) return 'above'
  return 'normal'
}

/** Identifies a stat row, also the key of its figure in a player's answer. */
export const statKey = (row: Pick<HudStatRow, 'section' | 'label' | 'column'>) => `${row.section}:${row.label}:${row.column ?? ''}`
