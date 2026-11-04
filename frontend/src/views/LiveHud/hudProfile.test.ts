import { describe, expect, it } from 'vitest'
import { hudBaselines } from '@/views/Stats/hudText'
import { buildCellView, figureKey, pickColor, requestsOf, type HudFigures } from './hudGrid'
import { defaultSettings, exportProfiles, importProfiles, sanitizeSettings, seatPositions } from './hudProfile'
import { legacyDefaultLayouts } from './hudMigration'

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
    const positions = seatPositions(migrated.placements, 'Winamax', 'threeMax', '+1', grids)
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
