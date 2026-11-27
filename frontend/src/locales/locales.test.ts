import { describe, expect, it } from 'vitest'
import en from './en/translation.json'
import es from './es/translation.json'
import fr from './fr/translation.json'
import italian from './it/translation.json'
import pt from './pt/translation.json'

/** Every key path of a translation, leaves only: "a.b.c". Arrays are leaves. */
function keysOf(value: unknown, prefix = ''): string[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key))
  }
  return [prefix]
}

const reference = new Set(keysOf(en))

describe('translations have the same keys as English', () => {
  const locales = { fr, es, it: italian, pt } as const

  for (const [name, locale] of Object.entries(locales)) {
    it(`${name} has every English key and no extra one`, () => {
      const keys = new Set(keysOf(locale))
      const missing = [...reference].filter((key) => !keys.has(key))
      const extra = [...keys].filter((key) => !reference.has(key))
      expect({ missing: missing.slice(0, 20), extra: extra.slice(0, 20) }).toEqual({ missing: [], extra: [] })
    })
  }
})
