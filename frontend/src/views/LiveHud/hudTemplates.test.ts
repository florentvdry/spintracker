import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAX_REQUESTED_STATS, requestsOf, validateLayout } from './hudGrid'
import { defaultSettings, HUD_FORMATS, seatPositions, SEATS_BY_FORMAT } from './hudProfile'
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
    for (const format of HUD_FORMATS) {
      it(`${id} (${format}) uses only stats, columns and stack depths the backend knows, and no broken popup link`, () => {
        const instance = TEMPLATES[id].build(format)
        const issues = validateLayout({ grids: instance.grids, popups: instance.popups }, catalog)
        expect(issues).toEqual([])
      })

      it(`${id} (${format}) stays far below the figure limit`, () => {
        const instance = TEMPLATES[id].build(format)
        const asked = requestsOf({ grids: instance.grids, popups: instance.popups }).length
        expect(asked).toBeLessThan(MAX_REQUESTED_STATS / 2)
      })
    }
  }

  it('ships two layout models, each with a version for both table sizes, and three popups', () => {
    expect(TEMPLATE_IDS.map((id) => TEMPLATES[id].isLayout)).toEqual([true, true, false, false, false])
    expect(TEMPLATES.full.build('headsUp').popups.length).toBeGreaterThanOrEqual(2)
    expect(TEMPLATES.full.build('threeMax').grids).not.toEqual(TEMPLATES.full.build('headsUp').grids)
  })

  it('builds new ids every time, so that a copy can be edited on its own', () => {
    const a = TEMPLATES.full.build('headsUp')
    const b = TEMPLATES.full.build('headsUp')
    expect(a.grids[0].id).not.toBe(b.grids[0].id)
    const ids = [...a.grids, ...a.popups].flatMap((g) => [g.id, ...g.cells.map((c) => c.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('splits the heads-up matrix by a total and the six depths in the full model, and by groups in the flash one', () => {
    const rowsOf = (id: 'full' | 'flash') => TEMPLATES[id].build('headsUp').grids.find((g) => g.name === 'SB' && g.rows.some((r) => r.context?.stack))?.rows.filter((r) => r.context?.stack)
    expect(rowsOf('full')).toHaveLength(6)
    const flash = rowsOf('flash')
    expect(flash?.map((r) => r.context?.stack?.label)).toEqual(['16+', '10-16', '3-10'])
    expect(flash?.[0].context?.stack?.buckets).toEqual(['20+', '16-20'])
    // Above the depth rows, the total row has no stack depth.
    const sb = TEMPLATES.full.build('headsUp').grids.find((g) => g.name === 'SB' && g.rows.some((r) => r.context?.stack))
    expect(sb?.rows.filter((r) => !r.context?.stack)).toHaveLength(2)
    expect(sb?.cells.some((c) => c.content.kind === 'text' && c.content.text === 'Total')).toBe(true)
  })
})

describe('fresh install', () => {
  it('puts the heads-up small blind matrix on the left and the big blind one on the right, out of the middle', () => {
    const settings = defaultSettings()
    const grids = settings.profiles[0].layouts.headsUp.grids
    const at = (name: string) => settings.placements.headsUp['+1'][grids.find((g) => g.name === name && g.rows.some((r) => r.context?.stack))!.id]
    expect(at('SB').x).toBeLessThan(0.2)
    expect(at('BB').x).toBeGreaterThan(0.7)
  })

  it('lays the heads-up panel and both three-way panels inside the table', () => {
    const settings = defaultSettings()
    const profile = settings.profiles[0]
    for (const format of ['headsUp', 'threeMax'] as const) {
      for (const seat of SEATS_BY_FORMAT[format]) {
        const positions = seatPositions(settings.placements, format, seat, profile.layouts[format].grids)
        for (const grid of profile.layouts[format].grids) {
          expect(positions[grid.id].x).toBeGreaterThanOrEqual(0)
          expect(positions[grid.id].x).toBeLessThan(1)
          expect(positions[grid.id].y).toBeLessThan(1)
        }
      }
    }
  })
})
