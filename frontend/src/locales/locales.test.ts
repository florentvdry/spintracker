import { describe, expect, it } from 'vitest'
import en from './en/translation.json'
import es from './es/translation.json'
import fr from './fr/translation.json'
import it_ from './it/translation.json'
import pt from './pt/translation.json'

type Tree = unknown

/** Every string of a locale by its path (list items are numbered). */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [inner, text] of flatten(value as Tree, path)) out.set(inner, text)
  }
  return out
}

const tokens = (text: string) => (text.match(/\{\{[^}]+\}\}|<\/?[a-z]+>/g) ?? []).sort().join('|')
const reference = flatten(en)

describe.each([
  ['fr', fr],
  ['es', es],
  ['it', it_],
  ['pt', pt],
])('locale %s', (_name, locale) => {
  const translated = flatten(locale)

  it('has every key of the English reference and no other', () => {
    expect([...translated.keys()].sort()).toEqual([...reference.keys()].sort())
  })

  it('keeps the placeholders and tags of every string', () => {
    for (const [key, source] of reference) expect(tokens(translated.get(key) ?? ''), key).toBe(tokens(source))
  })

  it('has no empty string', () => {
    for (const [key, text] of translated) expect(text.trim(), key).not.toBe('')
  })
})
