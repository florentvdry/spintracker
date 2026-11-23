/**
 * Packs (`.spinpack`) a coach shares and reports (`.spinreport`) a student sends back. Both are
 * plain JSON files: nothing here runs code, and every part is checked again by the module that
 * stores it (the ranges importer, the custom-stat validator, the HUD profile importer).
 */
import type { Json } from '@/services/ipcService'

export const PACK_FORMAT = 'spinpack'
export const REPORT_FORMAT = 'spinreport'
export const PACK_VERSION = 1
export const RANGES_FORMAT = 'spintracker-ranges'
export const PACK_KINDS = ['pack', 'stat-pack', 'hud-template', 'range-pack'] as const
export type PackKind = (typeof PACK_KINDS)[number]

export const MAX_FILE_CHARS = 8 * 1024 * 1024
export const MAX_NAME_CHARS = 80
export const MAX_CUSTOM_STATS = 50
export const MAX_REPORT_SCENARIOS = 500

export interface Pack {
  format: typeof PACK_FORMAT
  version: number
  kind: PackKind
  name: string
  author: string
  createdAt: string
  ranges?: Json
  hudProfile?: Json
  customStats?: Json[]
}

export interface PackSummary {
  name: string
  author: string
  kind: PackKind
  hasRanges: boolean
  hasHudProfile: boolean
  customStats: number
}

export type PackError = 'size' | 'json' | 'format' | 'version' | 'kind' | 'name' | 'ranges' | 'hudProfile' | 'customStats' | 'empty' | 'kindContent'

export type PackResult = { ok: true; pack: Pack; summary: PackSummary } | { ok: false; error: PackError }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isKind = (value: unknown): value is PackKind => PACK_KINDS.some((kind) => kind === value)

const cleanText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length <= MAX_NAME_CHARS ? text : null
}

export interface PackContent {
  name: string
  author: string
  ranges?: Json
  hudProfile?: Json
  customStats?: Json[]
}

/** The kind that fits what a pack holds: a pack with a single sort of content is that sort's pack. */
export function kindOf(content: Pick<PackContent, 'ranges' | 'hudProfile' | 'customStats'>): PackKind {
  const parts = [content.ranges !== undefined, content.hudProfile !== undefined, (content.customStats?.length ?? 0) > 0]
  if (parts.filter(Boolean).length !== 1) return 'pack'
  if (parts[0]) return 'range-pack'
  if (parts[1]) return 'hud-template'
  return 'stat-pack'
}

/** A pack ready to be written to a file. */
export function buildPack(content: PackContent, now: Date): Pack {
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    kind: kindOf(content),
    name: content.name.trim().slice(0, MAX_NAME_CHARS),
    author: content.author.trim().slice(0, MAX_NAME_CHARS),
    createdAt: now.toISOString(),
    ...(content.ranges !== undefined ? { ranges: content.ranges } : {}),
    ...(content.hudProfile !== undefined ? { hudProfile: content.hudProfile } : {}),
    ...(content.customStats && content.customStats.length > 0 ? { customStats: content.customStats } : {}),
  }
}

/** Checks the envelope of a pack file; what is inside is checked again where it is stored. */
export function parsePack(text: string): PackResult {
  if (text.length > MAX_FILE_CHARS) return { ok: false, error: 'size' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'json' }
  }
  if (!isRecord(raw) || raw.format !== PACK_FORMAT) return { ok: false, error: 'format' }
  if (raw.version !== PACK_VERSION) return { ok: false, error: 'version' }
  if (!isKind(raw.kind)) return { ok: false, error: 'kind' }
  const name = cleanText(raw.name)
  const author = raw.author === undefined ? '' : cleanText(raw.author)
  if (!name || author === null) return { ok: false, error: 'name' }
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt.slice(0, 40) : ''

  const pack: Pack = { format: PACK_FORMAT, version: PACK_VERSION, kind: raw.kind, name, author, createdAt }
  if (raw.ranges !== undefined) {
    if (!isRecord(raw.ranges) || raw.ranges.format !== RANGES_FORMAT) return { ok: false, error: 'ranges' }
    pack.ranges = raw.ranges
  }
  if (raw.hudProfile !== undefined) {
    if (!isRecord(raw.hudProfile)) return { ok: false, error: 'hudProfile' }
    pack.hudProfile = raw.hudProfile
  }
  if (raw.customStats !== undefined) {
    if (!Array.isArray(raw.customStats) || raw.customStats.length > MAX_CUSTOM_STATS || !raw.customStats.every(isRecord)) return { ok: false, error: 'customStats' }
    pack.customStats = raw.customStats
  }

  const customStats = pack.customStats?.length ?? 0
  const hasRanges = pack.ranges !== undefined
  const hasHudProfile = pack.hudProfile !== undefined
  if (!hasRanges && !hasHudProfile && customStats === 0) return { ok: false, error: 'empty' }
  // A kind promises what the pack holds, so a stat pack cannot carry ranges the student did not expect.
  const fits =
    pack.kind === 'pack' ||
    (pack.kind === 'range-pack' && hasRanges && !hasHudProfile && customStats === 0) ||
    (pack.kind === 'hud-template' && hasHudProfile && !hasRanges && customStats === 0) ||
    (pack.kind === 'stat-pack' && customStats > 0 && !hasRanges && !hasHudProfile)
  if (!fits) return { ok: false, error: 'kindContent' }
  return { ok: true, pack, summary: { name, author, kind: pack.kind, hasRanges, hasHudProfile, customStats } }
}

/** One scenario of a report: counts only. */
export interface ReportScenario {
  name: string
  stackBb: number
  decisions: number
  matches: number
}

export interface Report {
  format: typeof REPORT_FORMAT
  version: number
  createdAt: string
  pack: string
  adherence: { compared: number; matches: number; deviations: number; scenarios: ReportScenario[] }
}

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0)

/**
 * A report from the adherence figures. It keeps counts per scenario and nothing else: no player
 * name, no hand id, no date of a hand.
 */
export function buildReport(packName: string, adherence: Json, now: Date): Report {
  const scenarios: ReportScenario[] = (Array.isArray(adherence?.scenarios) ? adherence.scenarios : []).slice(0, MAX_REPORT_SCENARIOS).map((s: Json) => ({
    name: typeof s?.name === 'string' ? s.name.slice(0, MAX_NAME_CHARS) : '',
    stackBb: typeof s?.stackBb === 'number' && Number.isFinite(s.stackBb) ? s.stackBb : 0,
    decisions: count(s?.decisions),
    matches: count(s?.matches),
  }))
  return {
    format: REPORT_FORMAT,
    version: PACK_VERSION,
    createdAt: now.toISOString(),
    pack: packName.trim().slice(0, MAX_NAME_CHARS),
    adherence: { compared: count(adherence?.compared), matches: count(adherence?.matches), deviations: count(adherence?.deviations), scenarios },
  }
}

export type ReportResult = { ok: true; report: Report } | { ok: false; error: 'size' | 'json' | 'format' | 'version' }

/** Reads a report file the coach opened. Only counts are kept, whatever else the file holds. */
export function parseReport(text: string): ReportResult {
  if (text.length > MAX_FILE_CHARS) return { ok: false, error: 'size' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'json' }
  }
  if (!isRecord(raw) || raw.format !== REPORT_FORMAT || !isRecord(raw.adherence)) return { ok: false, error: 'format' }
  if (raw.version !== PACK_VERSION) return { ok: false, error: 'version' }
  const date = new Date(typeof raw.createdAt === 'string' ? raw.createdAt : '')
  return {
    ok: true,
    report: buildReport(typeof raw.pack === 'string' ? raw.pack : '', raw.adherence, Number.isNaN(date.getTime()) ? new Date(0) : date),
  }
}

/** Share of the compared decisions that followed the ranges, or null when there are none. */
export function respectShare(compared: number, matches: number): number | null {
  return compared > 0 ? matches / compared : null
}
