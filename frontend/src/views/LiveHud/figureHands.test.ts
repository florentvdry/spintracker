import { describe, expect, it } from 'vitest'
import { actionLabel, figureHandsBody, formatBb, parseFigureHands, prettyLabel, type HandAction } from './figureHands'

const action = (kind: HandAction['kind'], bb: number | null = null, extra: Partial<HandAction> = {}): HandAction => ({ own: false, kind, bb, allIn: false, ...extra })

describe('big blinds', () => {
  it('keep one decimal at most and drop a trailing zero', () => {
    expect(formatBb(6.5)).toBe('6.5')
    expect(formatBb(7)).toBe('7')
    expect(formatBb(6.96)).toBe('7')
    expect(formatBb(0.04)).toBe('0')
    expect(formatBb(14.94)).toBe('14.9')
  })
})

describe('an action line', () => {
  it('is written the way players write it', () => {
    expect(actionLabel(action('raise', 6.5))).toBe('R6.5')
    expect(actionLabel(action('bet', 4))).toBe('B4')
    expect(actionLabel(action('call', 2))).toBe('C2')
    expect(actionLabel(action('check'))).toBe('X')
    expect(actionLabel(action('fold'))).toBe('F')
  })

  it('shows an all-in with its size, and an unknown size as a bare letter', () => {
    expect(actionLabel(action('raise', 14.9, { allIn: true }))).toBe('AI14.9')
    expect(actionLabel(action('call', null, { allIn: true }))).toBe('AI')
    expect(actionLabel(action('bet'))).toBe('B')
  })
})

describe('the answer of the backend', () => {
  const hand = {
    id: 'h1',
    playedAt: '2026-11-05 20:00:00',
    stackBb: 16.8,
    cards: ['9s', '9h'],
    resultBb: 12.5,
    done: true,
    streets: [
      { street: 'preflop', cards: [], potBb: null, actions: [{ own: false, kind: 'raise', bb: 2.2, allIn: false }, { own: true, kind: 'raise', bb: 7, allIn: false }] },
      { street: 'flop', cards: ['7c', 'Kd', '2s'], potBb: 15, actions: [] },
    ],
  }

  it('is read as it is sent', () => {
    const parsed = parseFigureHands({ total: 16, hands: [hand] })
    expect(parsed?.total).toBe(16)
    expect(parsed?.hands[0]).toMatchObject({ id: 'h1', stackBb: 16.8, cards: ['9s', '9h'], done: true })
    expect(parsed?.hands[0].streets.map((s) => s.street)).toEqual(['preflop', 'flop'])
    expect(parsed?.hands[0].streets[0].actions[1]).toEqual({ own: true, kind: 'raise', bb: 7, allIn: false })
  })

  it('drops what it does not understand instead of showing it', () => {
    const parsed = parseFigureHands({
      total: 2,
      hands: [
        { ...hand, streets: [{ street: 'showdown', cards: [], actions: [] }, { street: 'turn', cards: ['4h', 3], potBb: 'x', actions: [{ kind: 'dance' }, { kind: 'check', own: true }] }] },
        { stackBb: 5 },
        null,
      ],
    })
    expect(parsed?.hands).toHaveLength(1)
    const [turn] = parsed?.hands[0].streets ?? []
    expect(turn).toEqual({ street: 'turn', cards: ['4h'], potBb: null, actions: [{ own: true, kind: 'check', bb: null, allIn: false }] })
  })

  it('refuses an answer without a total or a list', () => {
    expect(parseFigureHands(null)).toBeNull()
    expect(parseFigureHands({ total: 'many', hands: [] })).toBeNull()
    expect(parseFigureHands({ total: 1 })).toBeNull()
  })
})

describe('the request', () => {
  it('carries the stat, its column and the depths of the cell', () => {
    const body = figureHandsBody('Winamax', 'Hero', 'Villain', { section: 'huSb', label: 'Raise First In', column: 'sb_hu', buckets: ['20+', '16-20'] }, 'chances', 12)
    expect(body).toEqual({
      room: 'Winamax',
      heroName: 'Hero',
      player: 'Villain',
      stat: { section: 'huSb', label: 'Raise First In', column: 'sb_hu' },
      buckets: ['20+', '16-20'],
      which: 'chances',
      limit: 12,
    })
  })
})

describe('a title', () => {
  it('turns a catalog id into words and leaves words alone', () => {
    expect(prettyLabel('cbet_flop')).toBe('Cbet flop')
    expect(prettyLabel('Raise First In')).toBe('Raise First In')
    expect(prettyLabel('wtsd')).toBe('Wtsd')
  })
})
