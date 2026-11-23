import { describe, expect, it } from 'vitest'
import { SEQUENCE_TIMEOUT_MS, SequenceMatcher, SHORTCUTS } from './shortcuts'

describe('SequenceMatcher', () => {
  it('completes a two-key sequence', () => {
    const matcher = new SequenceMatcher('app')
    expect(matcher.feed('g', 0)).toBeNull()
    expect(matcher.feed('h', 100)).toBe('nav.history')
  })

  it('forgets the first key when the second comes too late', () => {
    const matcher = new SequenceMatcher('app')
    matcher.feed('g', 0)
    expect(matcher.feed('h', SEQUENCE_TIMEOUT_MS + 1)).toBeNull()
  })

  it('lets a key that leads nowhere start over', () => {
    const matcher = new SequenceMatcher('app')
    matcher.feed('g', 0)
    expect(matcher.feed('m', 50)).toBe('hand.mark')
    expect(matcher.feed('g', 60)).toBeNull()
    expect(matcher.feed('d', 70)).toBe('nav.dashboard')
  })

  it('only knows the shortcuts of its scope', () => {
    expect(new SequenceMatcher('app').feed(' ', 0)).toBeNull()
    expect(new SequenceMatcher('replayer').feed(' ', 0)).toBe('replayer.play')
    expect(new SequenceMatcher('replayer').feed('g', 0)).toBeNull()
    expect(new SequenceMatcher('replayer').feed('m', 0)).toBe('hand.mark.replayer')
  })
})

describe('the shortcut list', () => {
  it('has no two shortcuts on the same keys in one scope, and no key that is both a shortcut and a prefix', () => {
    for (const scope of ['app', 'replayer'] as const) {
      const defs = SHORTCUTS.filter((d) => d.scope === scope)
      const seen = new Set(defs.map((d) => d.keys.join('+')))
      expect(seen.size).toBe(defs.length)
      for (const d of defs) {
        const isPrefixOfAnother = defs.some((other) => other !== d && other.keys.length > d.keys.length && d.keys.every((k, i) => other.keys[i] === k))
        expect(isPrefixOfAnother).toBe(false)
      }
    }
  })
})
