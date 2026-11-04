import {
  newId,
  resolvePositions,
  sanitizeHudLayout,
  STACK_BUCKETS,
  type GridPosition,
  type HudGrid,
  type HudLayout,
} from './hudGrid'
import { migrateLayout, parseLegacyLayout } from './hudMigration'
import { MAX_POPUPS } from './hudGrid'
import { TEMPLATES, templatePositions, type TemplateId, type TemplateInstance } from './hudTemplates'

export { STACK_BUCKETS }

/** Version of the stored settings; bump it when the shape changes. */
export const HUD_SETTINGS_VERSION = 3
export const DEFAULT_OPACITY = 0.94
export const MIN_OPACITY = 0.4
export const MAX_OPACITY = 1
export const DEFAULT_SIZE = 1
export const MIN_SIZE = 0.7
export const MAX_SIZE = 1.5
/** Placement grid, as a fraction of the table width. */
export const GRID_STEP = 0.02
export const MAX_PROFILES = 20
/** An imported file larger than this is refused before it is parsed. */
export const MAX_IMPORT_CHARS = 8 * 1024 * 1024
const MAX_NAME_LENGTH = 40
const MAX_PLACED_GRIDS = 64

export type HudRoom = 'Winamax' | 'Unibet'
/** The table size a layout is for: the grids switch with it, between two hands. */
export type HudFormat = 'threeMax' | 'headsUp'

export const HUD_ROOMS: HudRoom[] = ['Winamax', 'Unibet']
export const HUD_FORMATS: HudFormat[] = ['threeMax', 'headsUp']
/** Seats a grid can sit on, relative to the hero (+1 is the next seat in turn order). */
export const SEATS_BY_FORMAT: Record<HudFormat, string[]> = { threeMax: ['+1', '+2'], headsUp: ['+1'] }

export type { HudLayout }

export interface HudProfile {
  id: string
  name: string
  layouts: Record<HudFormat, HudLayout>
  opacity: number
  size: number
  showHero: boolean
}

/** Positions of the grids of one seat, by grid id. */
export type SeatPlacements = Record<string, GridPosition>

/** room → format → seat → grid id → position, as fractions of the table. */
export type Placements = Record<HudRoom, Record<HudFormat, Record<string, SeatPlacements>>>

/** How to find a room's table windows. Empty fields use the built-in guess. */
export interface HudDetection {
  /** Part of the name of the room's program (`winamax`). */
  process: string
  /** Pattern a table window title must match (empty: any title but the lobby's). */
  titleRegex: string
  /** A tournament is being played when a hand was written this many minutes ago. */
  activeMinutes: number
}

export const DEFAULT_ACTIVE_MINUTES = 30

export interface HudSettings {
  version: number
  /** The HUD is off until the user turns it on. */
  enabled: boolean
  /** The rooms the user accepted the HUD on, one by one. */
  rooms: Record<HudRoom, boolean>
  detection: Record<HudRoom, HudDetection>
  activeProfileId: string
  profiles: HudProfile[]
  placements: Placements
  snapToGrid: boolean
}

// --- Defaults

const layoutOf = (instance: TemplateInstance): HudLayout => ({ grids: instance.grids, popups: instance.popups })

/** The layouts of a fresh install: the full models, with the positions their grids were designed for. */
function defaultBundle(): { layouts: Record<HudFormat, HudLayout>; placements: Placements } {
  const headsUp = TEMPLATES.huFull.build()
  const threeMax = TEMPLATES.threeWayFull.build()
  const placements = emptyPlacements()
  for (const room of HUD_ROOMS) {
    placements[room].headsUp = templatePositions(headsUp, SEAT_ORIGINS.headsUp)
    placements[room].threeMax = templatePositions(threeMax, SEAT_ORIGINS.threeMax)
  }
  return { layouts: { headsUp: layoutOf(headsUp), threeMax: layoutOf(threeMax) }, placements }
}

export const defaultLayouts = (): Record<HudFormat, HudLayout> => defaultBundle().layouts

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

/** A profile with nothing on it, to build from scratch. */
export const emptyProfile = (id: string, name: string): HudProfile => ({
  ...defaultProfile(id, name),
  layouts: { headsUp: { grids: [], popups: [] }, threeMax: { grids: [], popups: [] } },
})

/** Where the first grid of a seat sits on a fresh install: out of the way of the cards and the buttons. */
export const SEAT_ORIGINS: Record<HudFormat, Record<string, GridPosition>> = {
  threeMax: { '+1': { x: 0.01, y: 0.1 }, '+2': { x: 0.57, y: 0.1 } },
  headsUp: { '+1': { x: 0.05, y: 0.05 } },
}

const emptyPlacements = (): Placements => {
  const forRoom = () => ({ threeMax: { '+1': {}, '+2': {} }, headsUp: { '+1': {} } })
  return { Winamax: forRoom(), Unibet: forRoom() }
}

export const defaultPlacements = emptyPlacements

const defaultDetection = (): Record<HudRoom, HudDetection> => ({
  Winamax: { process: '', titleRegex: '', activeMinutes: DEFAULT_ACTIVE_MINUTES },
  Unibet: { process: '', titleRegex: '', activeMinutes: DEFAULT_ACTIVE_MINUTES },
})

export const defaultSettings = (): HudSettings => {
  const { layouts, placements } = defaultBundle()
  return {
    version: HUD_SETTINGS_VERSION,
    enabled: false,
    rooms: { Winamax: false, Unibet: false },
    detection: defaultDetection(),
    activeProfileId: DEFAULT_PROFILE_ID,
    profiles: [{ ...defaultProfile(DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME), layouts }],
    placements,
    snapToGrid: true,
  }
}

/** The positions of the grids of a seat, with a fallback under the previous grid for those never placed. */
export function seatPositions(placements: Placements, room: HudRoom, format: HudFormat, seat: string, grids: HudGrid[]): Record<string, GridPosition> {
  const origin = SEAT_ORIGINS[format][seat] ?? { x: 0.01, y: 0.1 }
  return resolvePositions(grids, placements[room][format][seat], origin)
}

// --- Validation: stored files and imported files are untrusted input.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const finiteNumber = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback

const text = (value: unknown, fallback: string, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback

/** The layout of a profile, whichever version wrote it. `migrated` tells that it came from version 2. */
function sanitizeLayout(raw: unknown, fallback: () => HudLayout): { layout: HudLayout; migrated: boolean } {
  const current = sanitizeHudLayout(raw)
  if (current) return { layout: current, migrated: false }
  const legacy = parseLegacyLayout(raw)
  if (legacy) return { layout: migrateLayout(legacy), migrated: true }
  return { layout: fallback(), migrated: false }
}

interface SanitizedProfile {
  profile: HudProfile
  migrated: HudFormat[]
}

function sanitizeProfile(raw: unknown, index: number): SanitizedProfile | null {
  if (!isRecord(raw)) return null
  const fallback = defaultLayouts()
  const layoutsRaw = isRecord(raw.layouts) ? raw.layouts : {}
  const migrated: HudFormat[] = []
  const layouts = {} as Record<HudFormat, HudLayout>
  for (const format of HUD_FORMATS) {
    const result = sanitizeLayout(layoutsRaw[format], () => fallback[format])
    layouts[format] = result.layout
    if (result.migrated) migrated.push(format)
  }
  return {
    profile: {
      id: text(raw.id, newProfileId(), 60),
      name: text(raw.name, `Profile ${index + 1}`, MAX_NAME_LENGTH),
      layouts,
      opacity: finiteNumber(raw.opacity, DEFAULT_OPACITY, MIN_OPACITY, MAX_OPACITY),
      size: finiteNumber(raw.size, DEFAULT_SIZE, MIN_SIZE, MAX_SIZE),
      showHero: raw.showHero === true,
    },
    migrated,
  }
}

function sanitizePosition(raw: unknown): GridPosition | null {
  if (!isRecord(raw)) return null
  return { x: finiteNumber(raw.x, 0, 0, 1), y: finiteNumber(raw.y, 0, 0, 1) }
}

/** Positions saved by version 3: seat → grid id → position. */
function sanitizePlacements(raw: unknown): Placements {
  const result = emptyPlacements()
  if (!isRecord(raw)) return result
  for (const room of HUD_ROOMS) {
    const roomRaw = raw[room]
    if (!isRecord(roomRaw)) continue
    for (const format of HUD_FORMATS) {
      const formatRaw = roomRaw[format]
      if (!isRecord(formatRaw)) continue
      for (const seat of SEATS_BY_FORMAT[format]) {
        const seatRaw = formatRaw[seat]
        if (!isRecord(seatRaw)) continue
        for (const [gridId, position] of Object.entries(seatRaw).slice(0, MAX_PLACED_GRIDS)) {
          const clean = sanitizePosition(position)
          if (clean) result[room][format][seat][gridId.slice(0, 60)] = clean
        }
      }
    }
  }
  return result
}

/**
 * Version 2 kept one position per seat for the whole panel. Each grid of a migrated panel is
 * stacked under the previous one from that position.
 */
function migratePlacements(raw: unknown, migrated: { profile: HudProfile; formats: HudFormat[] }[]): Placements {
  const result = emptyPlacements()
  const old = isRecord(raw) ? raw : {}
  for (const room of HUD_ROOMS) {
    const roomRaw = isRecord(old[room]) ? old[room] : {}
    for (const format of HUD_FORMATS) {
      const formatRaw = isRecord(roomRaw[format]) ? roomRaw[format] : {}
      for (const seat of SEATS_BY_FORMAT[format]) {
        const origin = sanitizePosition(formatRaw[seat]) ?? SEAT_ORIGINS[format][seat]
        for (const { profile, formats } of migrated) {
          if (!formats.includes(format)) continue
          Object.assign(result[room][format][seat], resolvePositions(profile.layouts[format].grids, undefined, origin))
        }
      }
    }
  }
  return result
}

function sanitizeDetection(raw: unknown): Record<HudRoom, HudDetection> {
  const result = defaultDetection()
  if (!isRecord(raw)) return result
  for (const room of HUD_ROOMS) {
    const entry = raw[room]
    if (!isRecord(entry)) continue
    result[room] = {
      process: typeof entry.process === 'string' ? entry.process.trim().slice(0, 60) : '',
      titleRegex: typeof entry.titleRegex === 'string' ? entry.titleRegex.slice(0, 120) : '',
      activeMinutes: Math.round(finiteNumber(entry.activeMinutes, DEFAULT_ACTIVE_MINUTES, 1, 720)),
    }
  }
  return result
}

/** Stored settings, repaired where they do not match the current shape; version 2 files are converted. */
export function sanitizeSettings(raw: unknown): HudSettings {
  if (!isRecord(raw)) return defaultSettings()
  const sanitized = (Array.isArray(raw.profiles) ? raw.profiles.slice(0, MAX_PROFILES) : [])
    .map(sanitizeProfile)
    .filter((p): p is SanitizedProfile => p !== null)
  if (sanitized.length === 0) sanitized.push({ profile: defaultProfile(DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME), migrated: [] })
  const profiles = sanitized.map((s) => s.profile)
  const active = profiles.some((p) => p.id === raw.activeProfileId) ? (raw.activeProfileId as string) : profiles[0].id
  // Positions saved by the first layout (version 1) described a much smaller panel: start over.
  const placements =
    raw.version === HUD_SETTINGS_VERSION
      ? sanitizePlacements(raw.placements)
      : raw.version === 2
        ? migratePlacements(raw.placements, sanitized.map((s) => ({ profile: s.profile, formats: s.migrated })))
        : emptyPlacements()
  return {
    version: HUD_SETTINGS_VERSION,
    enabled: raw.enabled === true,
    rooms: { Winamax: isRecord(raw.rooms) && raw.rooms.Winamax === true, Unibet: isRecord(raw.rooms) && raw.rooms.Unibet === true },
    detection: sanitizeDetection(raw.detection),
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

/** New ids for a profile and its grids, so that an imported copy never shares a position with another profile. */
export function withFreshIds(profile: HudProfile): HudProfile {
  const layouts = {} as Record<HudFormat, HudLayout>
  for (const format of HUD_FORMATS) {
    const layout = profile.layouts[format]
    const ids = new Map<string, string>()
    for (const g of [...layout.grids, ...layout.popups]) ids.set(g.id, newId('g'))
    const rename = (g: HudGrid): HudGrid => ({
      ...g,
      id: ids.get(g.id) ?? g.id,
      cells: g.cells.map((c) => (c.popupId ? { ...c, popupId: ids.get(c.popupId) ?? c.popupId } : c)),
    })
    layouts[format] = { grids: layout.grids.map(rename), popups: layout.popups.map(rename) }
  }
  return { ...profile, id: newProfileId(), layouts }
}

/** Profiles read from a shared file, or `null` when the file is not one. Ids are regenerated. */
export function importProfiles(content: string): HudProfile[] | null {
  if (content.length > MAX_IMPORT_CHARS) return null
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
    .filter((p): p is SanitizedProfile => p !== null)
    .map((p) => withFreshIds(p.profile))
  return profiles.length > 0 ? profiles : null
}

/** Rounds to the placement grid. */
export const snap = (value: number) => Math.round(value / GRID_STEP) * GRID_STEP

/** A copy of a profile under a new name, whose grids sit where the original's do (positions are kept by grid id). */
export function duplicateWithPlacements(source: HudProfile, placements: Placements, name: string): { profile: HudProfile; placements: Placements } {
  const profile = { ...withFreshIds(source), name }
  const next = structuredClone(placements)
  for (const room of HUD_ROOMS) {
    for (const format of HUD_FORMATS) {
      for (const seat of SEATS_BY_FORMAT[format]) {
        const seatPlacements = next[room][format][seat]
        source.layouts[format].grids.forEach((grid, i) => {
          const position = seatPlacements[grid.id]
          if (position) seatPlacements[profile.layouts[format].grids[i].id] = { ...position }
        })
      }
    }
  }
  return { profile, placements: next }
}

/** The table sizes a popup model can serve. */
const POPUP_FORMATS: Partial<Record<TemplateId, HudFormat[]>> = { popupGeneral: ['headsUp', 'threeMax'], popupHeadsUp: ['headsUp'], popupThreeWay: ['threeMax'] }

/**
 * A shipped model applied to a profile. A layout model replaces the grids of its table size (and
 * where they sit, in every room); a popup model adds its popup to the layouts it serves.
 */
export function applyTemplateToSettings(settings: HudSettings, profileId: string, templateId: TemplateId): HudSettings {
  const template = TEMPLATES[templateId]
  const instance = template.build()
  if (template.format) {
    const format = template.format
    const placements = structuredClone(settings.placements)
    for (const room of HUD_ROOMS) placements[room][format] = templatePositions(instance, SEAT_ORIGINS[format])
    const profiles = settings.profiles.map((p) => (p.id === profileId ? { ...p, layouts: { ...p.layouts, [format]: layoutOf(instance) } } : p))
    return { ...settings, profiles, placements }
  }
  const formats = POPUP_FORMATS[templateId] ?? []
  const profiles = settings.profiles.map((p) => {
    if (p.id !== profileId) return p
    const layouts = { ...p.layouts }
    for (const format of formats) {
      if (layouts[format].popups.length < MAX_POPUPS) layouts[format] = { ...layouts[format], popups: [...layouts[format].popups, ...instance.popups.map((g) => structuredClone(g))] }
    }
    return { ...p, layouts }
  })
  return { ...settings, profiles }
}
