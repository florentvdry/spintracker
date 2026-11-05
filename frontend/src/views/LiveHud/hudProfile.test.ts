import { describe, expect, it } from 'vitest'
import { hudBaselines } from '@/views/Stats/hudText'
import { buildCellView, figureKey, pickColor, requestsOf, type HudFigures } from './hudGrid'
import { defaultSettings, exportProfiles, importProfiles, mergeSettings, sanitizeSettings, seatPositions } from './hudProfile'
import type { LegacyCell, LegacyFamily, LegacyLayout, LegacyTable } from './hudMigration'

// --- The layouts version 2 shipped with, to build files as that version wrote them
const LEGACY_DEFAULT_MIN_SAMPLE = 5

const legacyCell = (section: string, label: string, abbr: string, family: LegacyFamily, baseline?: string, column: string | null = null): LegacyCell => {
  const found = baseline ? hudBaselines[baseline] : undefined
  return {
    section,
    label,
    column,
    abbr,
    family,
    below: found ? found.target - found.tolerance : null,
    above: found ? found.target + found.tolerance : null,
    minSample: LEGACY_DEFAULT_MIN_SAMPLE,
  }
}

const legacyStrip = (): LegacyCell[] => [
  legacyCell('postflop', 'wtsd', 'WTSD', 'showdown', 'WTSD'),
  legacyCell('postflop', 'wwsf', 'WWSF', 'showdown'),
  legacyCell('postflop', 'wsd', 'W$SD', 'showdown'),
  legacyCell('meta', 'hands', 'HU', 'count', undefined, 'hu'),
  legacyCell('meta', 'hands', '3W', 'count', undefined, 'three_way'),
]

const legacyPostflop = (): LegacyCell[] => [
  legacyCell('postflop', 'cbet_flop', 'CB', 'postflop', 'CBet'),
  legacyCell('postflop', 'cbet_turn', 'CB2', 'postflop'),
  legacyCell('postflop', 'fold_to_cbet_flop', 'FvCB', 'postflop'),
  legacyCell('postflop', 'donk_flop', 'Dk', 'postflop'),
]

const legacyTable = (id: string, title: string, rows: LegacyTable['rows'], column: string, cells: LegacyCell[]): LegacyTable => ({ id, title, rows, column, cells })

const legacyDefaultLayouts = (): { headsUp: LegacyLayout; threeMax: LegacyLayout } => ({
  headsUp: {
    strip: legacyStrip(),
    tables: [
      legacyTable('sb', 'SB', 'stack', 'sb_hu', [
        legacyCell('huSb', 'Raise First In', 'Rfi', 'open'),
        legacyCell('huSb', 'Open Limp', 'L', 'limp', 'Limp'),
        legacyCell('huSb', 'Limp-Fold vs Raise', 'LF', 'limp', 'LF'),
        legacyCell('shove', 'Open Shove', 'OS', 'shove', 'OS'),
      ]),
      legacyTable('bb', 'BB', 'stack', 'bb_hu', [
        legacyCell('huBb', 'vs Raise Fold', 'FvR', 'defense', 'FvR'),
        legacyCell('huBb', 'vs Raise 3-Bet', '3B', 'threeBet'),
        legacyCell('preflop', '3-Bet Shove', '3BS', 'shove'),
        legacyCell('shove', 'Call Shove', 'COS', 'shove', 'COS'),
        legacyCell('huBb', 'vs Limp Raise', 'IS', 'open'),
      ]),
      legacyTable('sb-post', 'SB', 'single', 'sb_hu', legacyPostflop()),
      legacyTable('bb-post', 'BB', 'single', 'bb_hu', legacyPostflop()),
    ],
  },
  threeMax: {
    strip: legacyStrip(),
    tables: [
      legacyTable('btn', 'BTN', 'single', 'btn', [
        legacyCell('preflop', 'VPIP', 'VP', 'open', 'VPIP'),
        legacyCell('preflop', 'PFR', 'PFR', 'open'),
        legacyCell('preflop', 'Fold to 3-Bet Shove', 'F3S', 'defense'),
        legacyCell('preflop', 'Open Limp', 'L', 'limp', 'Limp'),
        legacyCell('preflop', 'Limp-Fold', 'LF', 'limp', 'LF'),
        legacyCell('shove', 'Open Shove', 'OS', 'shove', 'OS'),
      ]),
      legacyTable('sb', 'SB', 'single', 'sb_3w', [
        legacyCell('preflop', 'VPIP', 'VP', 'open', 'VPIP'),
        legacyCell('preflop', 'PFR', 'PFR', 'open'),
        legacyCell('preflop', 'Fold to 3-Bet Shove', 'F3S', 'defense'),
        legacyCell('preflop', 'Limp-Fold', 'LF', 'limp', 'LF'),
        legacyCell('shove', 'Open Shove', 'OS', 'shove', 'OS'),
        legacyCell('preflop', '3-Bet', '3B', 'threeBet', '3Bet'),
      ]),
      legacyTable('bb', 'BB', 'single', 'bb_3w', [
        legacyCell('preflop', 'Fold vs 2x', 'FvM', 'defense'),
        legacyCell('preflop', '3-Bet Shove', '3BS', 'shove'),
        legacyCell('preflop', 'Iso Raise', 'IST', 'open', 'ISO'),
        legacyCell('preflop', 'Iso Non-All-In', 'ISN', 'open', 'ISN'),
        legacyCell('preflop', 'Iso All-In', 'ISS', 'shove', 'ISA'),
      ]),
      legacyTable('btn-post', 'BTN', 'single', 'btn', legacyPostflop()),
      legacyTable('sb-post', 'SB', 'single', 'sb_3w', legacyPostflop()),
      legacyTable('bb-post', 'BB', 'single', 'bb_3w', legacyPostflop()),
    ],
  },
})

/** A settings file as version 2 wrote it. */
function v2Settings() {
  return {
    version: 2,
    enabled: true,
    rooms: { Winamax: true, Unibet: false },
    activeProfileId: 'mine',
    profiles: [{ id: 'mine', name: 'Mine', layouts: legacyDefaultLayouts(), opacity: 0.8, size: 1.2, showHero: true }],
    placements: {
      Winamax: { threeMax: { '+1': { x: 0.2, y: 0.3 }, '+2': { x: 0.6, y: 0.3 } }, headsUp: { '+1': { x: 0.4, y: 0.1 } } },
      Unibet: {},
    },
    snapToGrid: false,
  }
}

describe('migration from version 2', () => {
  it('keeps the profile, its settings and every figure it showed', () => {
    const migrated = sanitizeSettings(v2Settings())
    expect(migrated.version).toBe(3)
    expect(migrated.profiles[0]).toMatchObject({ id: 'mine', name: 'Mine', opacity: 0.8, size: 1.2, showHero: true })
    expect(migrated.enabled).toBe(true)
    expect(migrated.snapToGrid).toBe(false)

    const asked = new Set(requestsOf(migrated.profiles[0].layouts.headsUp).map((r) => figureKey(r.section, r.label, r.column, r.bucket)))
    // The SB table: each figure for each of the seven stack depths, counted in the table's column.
    expect(asked.has(figureKey('huSb', 'Raise First In', 'sb_hu', '13+'))).toBe(true)
    expect(asked.has(figureKey('shove', 'Open Shove', 'sb_hu', '0-3'))).toBe(true)
    expect(asked.has(figureKey('meta', 'hands', 'sb_hu', '5-7'))).toBe(true)
    expect(asked.has(figureKey('meta', 'hands', 'hu', null))).toBe(true)
    expect(asked.has(figureKey('postflop', 'cbet_flop', 'bb_hu', null))).toBe(true)
  })

  it('colours as the thresholds did', () => {
    const migrated = sanitizeSettings(v2Settings())
    const grid = migrated.profiles[0].layouts.threeMax.grids.find((g) => g.name === 'BTN' && g.rows.length === 2 && g.cells.some((c) => c.content.kind === 'stat' && c.content.label === 'VPIP'))
    const vpip = grid?.cells.find((c) => c.content.kind === 'stat' && c.content.label === 'VPIP')
    expect(vpip?.content.kind).toBe('stat')
    if (!vpip || vpip.content.kind !== 'stat') return
    const { colors } = vpip.content
    const { target, tolerance } = hudBaselines.VPIP
    expect(pickColor(colors, target - tolerance - 0.1, 50, {})?.color).toBe('#8db4ff')
    expect(pickColor(colors, target, 50, {})?.color).toBe('#e6e9ef')
    expect(pickColor(colors, target + tolerance + 0.1, 50, {})?.color).toBe('#ffa766')
    expect(pickColor(colors, 10, 2, {})).toBeNull()
  })

  it('shows the figures of a stack row', () => {
    const migrated = sanitizeSettings(v2Settings())
    const grid = migrated.profiles[0].layouts.headsUp.grids.find((g) => g.rows.length === 8 && g.name === 'SB')
    expect(grid).toBeDefined()
    if (!grid) return
    const figures: HudFigures = {
      [figureKey('huSb', 'Raise First In', 'sb_hu', '11-13')]: { pct: 50, num: 5, den: 10 },
      [figureKey('meta', 'hands', 'sb_hu', '11-13')]: { pct: null, num: 12, den: 12 },
    }
    const row = grid.rows.findIndex((r) => r.context?.stack?.buckets[0] === '11-13')
    const views = grid.cells.filter((c) => c.row === row).map((c) => buildCellView(grid, c, figures, { name: 'p' }, {}))
    expect(views.map((v) => v.text).slice(0, 3)).toEqual(['11-13', '12', '50'])
  })

  it('stacks the grids of a panel from its old position', () => {
    const migrated = sanitizeSettings(v2Settings())
    const grids = migrated.profiles[0].layouts.threeMax.grids
    const positions = seatPositions(migrated.placements, 'threeMax', '+1', grids)
    expect(positions[grids[0].id]).toEqual({ x: 0.2, y: 0.3 })
    expect(positions[grids[1].id].x).toBe(0.2)
    expect(positions[grids[1].id].y).toBeGreaterThan(0.3)
    expect(positions[grids[2].id].y).toBeGreaterThan(positions[grids[1].id].y)
  })
})

describe('version 3 settings', () => {
  it('reload identically after a save', () => {
    const settings = sanitizeSettings(v2Settings())
    expect(sanitizeSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings)
    const fresh = defaultSettings()
    expect(sanitizeSettings(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh)
  })
})

describe('imported files', () => {
  it('round-trip, with fresh ids', () => {
    const settings = sanitizeSettings(v2Settings())
    const imported = importProfiles(exportProfiles(settings.profiles))
    expect(imported).toHaveLength(1)
    expect(imported?.[0].id).not.toBe('mine')
    expect(imported?.[0].layouts.headsUp.grids[0].id).not.toBe(settings.profiles[0].layouts.headsUp.grids[0].id)
  })

  it('never crash on malformed content', () => {
    const kind = 'spintracker-hud-profiles'
    const hostile = { rows: [{}], cols: [{}], cells: [{ row: 0, col: 0, content: { kind: 'stat', section: 3 }, style: { fg: 'url(x)' } }] }
    const bad = [
      '',
      'nope',
      '[]',
      'null',
      '{}',
      JSON.stringify({ kind }),
      JSON.stringify({ kind, profiles: 3 }),
      JSON.stringify({ kind, profiles: [null, 1, 'x', { layouts: 5 }, { layouts: { headsUp: { grids: [{ rows: [{ size: 'NaN' }], cols: [1], cells: [{}] }] } } }] }),
      JSON.stringify({ kind, profiles: [{ layouts: { headsUp: { grids: [hostile] } } }] }),
    ]
    for (const content of bad) expect(() => importProfiles(content)).not.toThrow()
    expect(() => sanitizeSettings({ version: 3, profiles: [{}, null], placements: { Winamax: 4 } })).not.toThrow()
  })
})

describe('activation', () => {
  it('is on for every room at once unless the user turned it off', () => {
    expect(defaultSettings().enabled).toBe(true)
    expect(sanitizeSettings({ version: 3, profiles: [] }).enabled).toBe(true)
    expect(sanitizeSettings({ version: 3, enabled: false }).enabled).toBe(false)
  })

  it('ignores the per-room switches and detection fields older files had', () => {
    const settings = sanitizeSettings({ version: 3, rooms: { Winamax: false }, detection: { Winamax: { process: 'x' } } })
    expect(settings).not.toHaveProperty('rooms')
    expect(settings).not.toHaveProperty('detection')
    expect(settings.enabled).toBe(true)
  })
})

describe('placements without rooms', () => {
  it('reads files saved while positions were kept per room, using the first room that has any', () => {
    const settings = sanitizeSettings(v2Settings())
    const saved = JSON.parse(JSON.stringify(settings))
    const grid = settings.profiles[0].layouts.threeMax.grids[0].id
    saved.placements = { Winamax: { threeMax: { '+1': { [grid]: { x: 0.3, y: 0.4 } } } }, Unibet: {} }
    expect(sanitizeSettings(saved).placements.threeMax['+1'][grid]).toEqual({ x: 0.3, y: 0.4 })
    expect(sanitizeSettings(saved).placements).not.toHaveProperty('Winamax')
  })
})

describe('saving from several windows', () => {
  it('keeps the other window\'s change to a field this window did not touch', () => {
    const base = defaultSettings()
    const local = { ...base, snapToGrid: !base.snapToGrid }
    const remote = { ...base, enabled: !base.enabled }
    const merged = mergeSettings(base, local, remote)
    expect(merged.snapToGrid).toBe(local.snapToGrid)
    expect(merged.enabled).toBe(remote.enabled)
  })

  it('lets this window win on the fields it changed', () => {
    const base = defaultSettings()
    const local = { ...base, enabled: false }
    const remote = { ...base, enabled: true }
    expect(mergeSettings(base, local, remote).enabled).toBe(false)
  })
})
