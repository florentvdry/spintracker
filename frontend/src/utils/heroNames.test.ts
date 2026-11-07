import { describe, expect, it } from 'vitest'
import { heroNamesOf } from './heroNames'

const aliases = [{ id: 1, name: 'Me', players: [{ name: 'hero_w' }, { name: 'Hero_U' }] }, { id: 2, name: 'Other', players: [{ name: 'x' }] }]

describe('heroNamesOf', () => {
  it('is empty without a hero', () => {
    expect(heroNamesOf(null, aliases)).toEqual([])
    expect(heroNamesOf('  ', aliases)).toEqual([])
  })

  it('adds the players of the alias the hero belongs to', () => {
    expect(heroNamesOf('hero_w', aliases).sort()).toEqual(['Hero_U', 'hero_w'])
  })

  it('accepts the alias name as the hero', () => {
    expect(heroNamesOf('Me', aliases).sort()).toEqual(['Hero_U', 'Me', 'hero_w'])
  })

  it('keeps a hero that has no alias', () => {
    expect(heroNamesOf('solo', aliases)).toEqual(['solo'])
  })
})
