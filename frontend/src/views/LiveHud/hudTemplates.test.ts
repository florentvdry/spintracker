import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_REQUESTED_STATS, requestsOf, validateLayout } from './hudGrid'
import { applyTemplateToSettings, defaultSettings, sanitizeSettings, seatPositions, SEATS_BY_FORMAT } from './hudProfile'
import { TEMPLATE_IDS, TEMPLATES } from './hudTemplates'

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../../../../crates/core/src/${path}`, import.meta.url)), 'utf8')

/** The ids the backend catalog offers, read from the Rust sources that define them: no stat is invented. */
function catalogIds(): Set<string> {
  const sections: Record<string, string> = { Preflop: 'preflop', HuSb: 'huSb', HuBb: 'huBb', ThreeWayPreflop: 'threeWayPreflop', Steal: 'steal', VsSteal: 'vsSteal' }
  const ids = new Set<string>(['meta:hands'])
  const registry = source('stats/registry.rs')
  for (const m of registry.matchAll(/^\s*(?:stat|seg)\((\w+), (?:Segment::\w+, )?"([^"]+)"/gm)) ids.add(`${sections[m[1]]}:${m[2]}`)
  for (const m of source('repos/postflop_stats.rs').matchAll(/(?:fig|shared)\("([a-z0-9_]+)"/g)) ids.add(`postflop:${m[1]}`)
  const shove = source('repos/hud_stats.rs').match(/const SHOVE_LABELS: \[&str; \d+\] = \[([^\]]+)\]/)
  for (const m of (shove?.[1] ?? '').matchAll(/"([^"]+)"/g)) ids.add(`shove:${m[1]}`)
  return ids
}

describe('the shipped models', () => {
  const catalog = catalogIds()

  it('can read the catalog from the sources', () => {
    expect(catalog.has('preflop:VPIP')).toBe(true)
    expect(catalog.has('huSb:Limp-Raise vs Raise')).toBe(true)
    expect(catalog.has('postflop:cbet_river')).toBe(true)
    expect(catalog.has('shove:Call Shove')).toBe(true)
  })

  for (const id of TEMPLATE_IDS) {
    it(`${id} uses only stats, columns and stack depths the backend knows, and no broken popup link`, () => {
      const instance = TEMPLATES[id].build()
      const issues = validateLayout({ grids: instance.grids, popups: instance.popups }, catalog)
      expect(issues).toEqual([])
    })

    it(`${id} stays far below the figure limit`, () => {
      const instance = TEMPLATES[id].build()
      const asked = requestsOf({ grids: instance.grids, popups: instance.popups }).length
      expect(asked).toBeLessThan(MAX_REQUESTED_STATS / 2)
    })
  }

  it('ships layouts for both table sizes and three popups', () => {
    expect(TEMPLATE_IDS.map((id) => TEMPLATES[id].format)).toEqual(['headsUp', 'headsUp', 'threeMax', 'threeMax', null, null, null])
    expect(TEMPLATES.huFull.build().popups.length).toBeGreaterThanOrEqual(2)
  })

  it('builds new ids every time, so that a copy can be edited on its own', () => {
    const a = TEMPLATES.huFull.build()
    const b = TEMPLATES.huFull.build()
    expect(a.grids[0].id).not.toBe(b.grids[0].id)
    const ids = [...a.grids, ...a.popups].flatMap((g) => [g.id, ...g.cells.map((c) => c.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('splits the heads-up matrix by the seven depths in the full model and by groups in the flash one', () => {
    const rowsOf = (id: 'huFull' | 'huFlash') => TEMPLATES[id].build().grids.find((g) => g.name === 'SB' && g.rows.some((r) => r.context?.stack))?.rows.filter((r) => r.context?.stack)
    expect(rowsOf('huFull')).toHaveLength(7)
    const flash = rowsOf('huFlash')
    expect(flash?.map((r) => r.context?.stack?.label)).toEqual(['12bb+', '8bb', '4bb', '2bb'])
    expect(flash?.[0].context?.stack?.buckets).toEqual(['13+', '11-13'])
  })
})

describe('applying a model', () => {
  it('replaces the layout of its table size and places every grid for every seat', () => {
    const settings = defaultSettings()
    const profileId = settings.profiles[0].id
    const next = applyTemplateToSettings(settings, profileId, 'threeWayFlash')
    const layout = next.profiles[0].layouts.threeMax
    expect(layout.grids.map((g) => g.name)).toEqual(['Player', 'Preflop', 'Post'])
    expect(next.profiles[0].layouts.headsUp).toEqual(settings.profiles[0].layouts.headsUp)
    for (const seat of SEATS_BY_FORMAT.threeMax) {
      const positions = next.placements.Winamax.threeMax[seat]
      expect(layout.grids.every((g) => positions[g.id] !== undefined)).toBe(true)
    }
    expect(sanitizeSettings(JSON.parse(JSON.stringify(next)))).toEqual(next)
  })

  it('adds a popup model to the layouts it serves, without touching the grids', () => {
    const settings = defaultSettings()
    const before = settings.profiles[0].layouts
    const next = applyTemplateToSettings(settings, settings.profiles[0].id, 'popupThreeWay')
    expect(next.profiles[0].layouts.threeMax.popups).toHaveLength(before.threeMax.popups.length + 1)
    expect(next.profiles[0].layouts.headsUp.popups).toHaveLength(before.headsUp.popups.length)
    expect(next.profiles[0].layouts.threeMax.grids).toEqual(before.threeMax.grids)
  })

  it('leaves the other profiles alone', () => {
    const settings = defaultSettings()
    settings.profiles.push({ ...settings.profiles[0], id: 'other' })
    const next = applyTemplateToSettings(settings, 'other', 'huFlash')
    expect(next.profiles[0]).toEqual(settings.profiles[0])
    expect(next.profiles[1].layouts.headsUp.grids).toHaveLength(3)
  })
})

describe('fresh install', () => {
  it('lays the heads-up panel and both three-way panels inside the table', () => {
    const settings = defaultSettings()
    const profile = settings.profiles[0]
    for (const format of ['headsUp', 'threeMax'] as const) {
      for (const seat of SEATS_BY_FORMAT[format]) {
        const positions = seatPositions(settings.placements, 'Winamax', format, seat, profile.layouts[format].grids)
        for (const grid of profile.layouts[format].grids) {
          expect(positions[grid.id].x).toBeGreaterThanOrEqual(0)
          expect(positions[grid.id].x).toBeLessThan(1)
          expect(positions[grid.id].y).toBeLessThan(1)
        }
      }
    }
  })
})
