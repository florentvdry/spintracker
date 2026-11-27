import { describe, expect, it } from 'vitest'
import { anonymousNames, formatBoard, handToMarkdown, type ShareHand } from './handShare'

const hand: ShareHand = {
  room: 'Winamax',
  buyIn: 5,
  blinds: '10/20',
  date: '2026-01-05 21:10:00',
  board: 'Ah8c2d',
  players: [
    { name: 'jmenfouu', position: 'BTN', cards: ['Ad', 'Kc'], isHero: true },
    { name: 'SecretFish', position: 'BB', cards: [], isHero: false },
  ],
  actions: [
    { street: 'Preflop', type: 'DealCards', playerName: null, amount: 0, description: null },
    { street: 'Preflop', type: 'Raise', playerName: 'jmenfouu', amount: 60, description: 'jmenfouu raises to 60' },
    { street: 'Preflop', type: 'Call', playerName: 'SecretFish', amount: 40, description: 'SecretFish calls 40' },
  ],
}

describe('anonymousNames', () => {
  it('gives the hero a role name and numbers the others by seat order', () => {
    const names = anonymousNames(hand.players)
    expect(names.get('jmenfouu')).toBe('Hero')
    expect(names.get('SecretFish')).toBe('Player 1')
  })
})

describe('formatBoard', () => {
  it('spaces the cards', () => {
    expect(formatBoard('Ah8c2d')).toBe('Ah 8c 2d')
    expect(formatBoard('')).toBe('')
  })
})

describe('handToMarkdown', () => {
  it('writes the real names when not anonymised', () => {
    const md = handToMarkdown(hand, { anonymize: false })
    expect(md).toContain('jmenfouu')
    expect(md).toContain('SecretFish calls 40')
    expect(md).toContain('Board: Ah 8c 2d')
    expect(md).not.toContain('DealCards')
  })

  it('leaves no real name anywhere when anonymised', () => {
    const md = handToMarkdown(hand, { anonymize: true })
    expect(md).not.toContain('jmenfouu')
    expect(md).not.toContain('SecretFish')
    expect(md).toContain('Hero: Raise 60')
    expect(md).toContain('Player 1: Call 40')
  })
})
