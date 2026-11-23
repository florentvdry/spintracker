import { describe, expect, it } from 'vitest'
import { buildPack, buildReport, kindOf, MAX_CUSTOM_STATS, MAX_FILE_CHARS, PACK_VERSION, parsePack, parseReport, respectShare } from './packs'

const NOW = new Date('2026-11-23T10:00:00Z')
const ranges = { format: 'spintracker-ranges', version: 1 }
const stat = { name: 'Limp rate' }

describe('packs', () => {
  it('names the kind after what the pack holds', () => {
    expect(kindOf({ ranges })).toBe('range-pack')
    expect(kindOf({ hudProfile: {} })).toBe('hud-template')
    expect(kindOf({ customStats: [stat] })).toBe('stat-pack')
    expect(kindOf({ ranges, customStats: [stat] })).toBe('pack')
    expect(kindOf({})).toBe('pack')
  })

  it('writes a pack that reads back to the same summary', () => {
    const pack = buildPack({ name: ' Coach ranges ', author: 'A. Coach', ranges, customStats: [stat] }, NOW)
    expect(pack).toMatchObject({ format: 'spinpack', version: PACK_VERSION, kind: 'pack', name: 'Coach ranges', createdAt: NOW.toISOString() })
    const result = parsePack(JSON.stringify(pack))
    expect(result.ok && result.summary).toEqual({ name: 'Coach ranges', author: 'A. Coach', kind: 'pack', hasRanges: true, hasHudProfile: false, customStats: 1 })
  })

  it('refuses files that are not packs', () => {
    expect(parsePack('not json')).toEqual({ ok: false, error: 'json' })
    expect(parsePack('[]')).toEqual({ ok: false, error: 'format' })
    expect(parsePack(JSON.stringify({ format: 'other' }))).toEqual({ ok: false, error: 'format' })
    expect(parsePack('x'.repeat(MAX_FILE_CHARS + 1))).toEqual({ ok: false, error: 'size' })
    const base = buildPack({ name: 'A', author: '', ranges }, NOW)
    expect(parsePack(JSON.stringify({ ...base, version: 99 }))).toEqual({ ok: false, error: 'version' })
    expect(parsePack(JSON.stringify({ ...base, kind: 'script' }))).toEqual({ ok: false, error: 'kind' })
    expect(parsePack(JSON.stringify({ ...base, name: '' }))).toEqual({ ok: false, error: 'name' })
    expect(parsePack(JSON.stringify({ ...base, ranges: { format: 'other' } }))).toEqual({ ok: false, error: 'ranges' })
    expect(parsePack(JSON.stringify({ ...base, customStats: 'x' }))).toEqual({ ok: false, error: 'customStats' })
    expect(parsePack(JSON.stringify({ ...base, customStats: new Array(MAX_CUSTOM_STATS + 1).fill(stat) }))).toEqual({ ok: false, error: 'customStats' })
  })

  it('refuses an empty pack and a kind that does not match its content', () => {
    const base = buildPack({ name: 'A', author: '', ranges }, NOW)
    expect(parsePack(JSON.stringify({ ...base, ranges: undefined }))).toEqual({ ok: false, error: 'empty' })
    expect(parsePack(JSON.stringify({ ...base, kind: 'stat-pack' }))).toEqual({ ok: false, error: 'kindContent' })
    expect(parsePack(JSON.stringify({ ...base, kind: 'range-pack', customStats: [stat] }))).toEqual({ ok: false, error: 'kindContent' })
  })
})

describe('reports', () => {
  const adherence = {
    compared: 10,
    matches: 7,
    deviations: 3,
    heroName: 'SecretName',
    scenarios: [{ name: 'SB 10bb', stackBb: 10, decisions: 10, matches: 7, topDeviation: { handId: 'abc' } }],
  }

  it('keeps counts per scenario and no player information', () => {
    const report = buildReport('Coach ranges', adherence, NOW)
    expect(report.adherence).toEqual({ compared: 10, matches: 7, deviations: 3, scenarios: [{ name: 'SB 10bb', stackBb: 10, decisions: 10, matches: 7 }] })
    const text = JSON.stringify(report)
    expect(text).not.toContain('SecretName')
    expect(text).not.toContain('abc')
  })

  it('reads a report back and drops anything it does not know', () => {
    const file = JSON.stringify({ ...buildReport('P', adherence, NOW), playerName: 'Leak' })
    const result = parseReport(file)
    expect(result.ok && result.report.adherence.compared).toBe(10)
    expect(JSON.stringify(result)).not.toContain('Leak')
    expect(parseReport('{}')).toEqual({ ok: false, error: 'format' })
    expect(parseReport('nope')).toEqual({ ok: false, error: 'json' })
  })

  it('treats bad figures as zero', () => {
    const report = buildReport('P', { compared: -4, matches: 'x', deviations: Number.NaN, scenarios: [{ decisions: 2.7 }] }, NOW)
    expect(report.adherence).toMatchObject({ compared: 0, matches: 0, deviations: 0 })
    expect(report.adherence.scenarios[0]).toMatchObject({ name: '', decisions: 2 })
  })

  it('gives the share of decisions that followed the ranges', () => {
    expect(respectShare(10, 7)).toBe(0.7)
    expect(respectShare(0, 0)).toBeNull()
  })
})
