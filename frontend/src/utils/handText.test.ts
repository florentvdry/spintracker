import { describe, expect, it } from 'vitest'
import { normalizeHand, toGtoWizard } from './handText'

// A synthetic heads-up hand: the small blind raises, the big blind calls, then it checks down.
const HAND = {
  handId: '470748849378074497',
  room: 'Winamax',
  date: '2026-04-15 13:51:36',
  blinds: '15/30',
  buyIn: 1,
  totalPot: 120,
  board: 'Qc9dTs',
  players: [
    { name: 'Hero', position: 'SB', initialStack: 500, cards: 'AhKd', isHero: true },
    { name: 'Villain', position: 'BB', initialStack: 500, cards: 'QsJs', isHero: false },
  ],
  actions: [
    { type: 'DealCards', street: 'Preflop', potBefore: 0, potAfter: 0 },
    { type: 'PostSB', street: 'Preflop', playerName: 'Hero', potBefore: 0, potAfter: 15 },
    { type: 'PostBB', street: 'Preflop', playerName: 'Villain', potBefore: 15, potAfter: 45 },
    { type: 'Raise', street: 'Preflop', playerName: 'Hero', potBefore: 45, potAfter: 105 },
    { type: 'Fold', street: 'Preflop', playerName: 'Villain', potBefore: 105, potAfter: 105 },
    { type: 'CollectPot', street: 'Showdown', playerName: 'Hero', amount: 105 },
  ],
}

describe('normalizeHand', () => {
  it('turns the amounts into what each action put in and the street total it reaches', () => {
    const hand = normalizeHand(HAND)
    const raise = hand.actions.find((a) => a.kind === 'raise')
    expect(raise).toMatchObject({ player: 'Hero', added: 60, to: 75, allIn: false })
    expect(hand.players[0]).toMatchObject({ seat: 1, cards: ['Ah', 'Kd'], isHero: true })
    expect(hand.flop).toEqual(['Qc', '9d', 'Ts'])
    expect(hand.collected).toEqual([{ player: 'Hero', amount: 105 }])
  })

  it('reads an all-in as a call when it does not beat the highest bet, and flags it', () => {
    const hand = normalizeHand({
      ...HAND,
      actions: [
        { type: 'PostSB', street: 'Preflop', playerName: 'Hero', potBefore: 0, potAfter: 15 },
        { type: 'PostBB', street: 'Preflop', playerName: 'Villain', potBefore: 15, potAfter: 45 },
        { type: 'AllIn', street: 'Preflop', playerName: 'Hero', potBefore: 45, potAfter: 530 },
        { type: 'AllIn', street: 'Preflop', playerName: 'Villain', potBefore: 530, potAfter: 1000 },
      ],
    })
    const kinds = hand.actions.map((a) => [a.player, a.kind, a.allIn])
    expect(kinds).toEqual([
      ['Hero', 'postSb', false],
      ['Villain', 'postBb', false],
      ['Hero', 'raise', true],
      ['Villain', 'call', true],
    ])
  })
})

describe('toGtoWizard', () => {
  it('writes a PokerStars-style hand with seats, blinds, hole cards, actions and the pot', () => {
    const text = toGtoWizard(normalizeHand(HAND))
    const lines = text.split('\n')
    expect(lines[0]).toMatch(/^PokerStars Hand #470748849378: Tournament #470748849378, 1 USD Hold'em No Limit - Level I \(15\/30\) - 2026\/04\/15 13:51:36 ET$/)
    expect(lines).toContain('Table \'470748849378 1\' 2-max Seat #1 is the button')
    expect(lines).toContain('Seat 1: Hero (500 in chips)')
    expect(lines).toContain('Hero: posts small blind 15')
    expect(lines).toContain('Villain: posts big blind 30')
    expect(lines).toContain('*** HOLE CARDS ***')
    expect(lines).toContain('Dealt to Hero [Ah Kd]')
    expect(lines).toContain('Hero: raises 60 to 75')
    expect(lines).toContain('Villain: folds')
    expect(lines).toContain('Hero collected 105 from pot')
    expect(lines.indexOf('*** HOLE CARDS ***')).toBeGreaterThan(lines.indexOf('Villain: posts big blind 30'))
  })

  it('writes the streets with the board as it stood', () => {
    const text = toGtoWizard(
      normalizeHand({
        ...HAND,
        board: 'Qc9dTsJd',
        actions: [
          { type: 'Call', street: 'Preflop', playerName: 'Hero', potBefore: 45, potAfter: 60 },
          { type: 'DealCards', street: 'Flop', cards: 'Qc9dTs', potBefore: 60, potAfter: 60 },
          { type: 'Check', street: 'Flop', playerName: 'Villain', potBefore: 60, potAfter: 60 },
          { type: 'DealCards', street: 'Turn', cards: 'Jd', potBefore: 60, potAfter: 60 },
          { type: 'Bet', street: 'Turn', playerName: 'Villain', potBefore: 60, potAfter: 90 },
        ],
      }),
    )
    expect(text).toContain('*** FLOP *** [Qc 9d Ts]')
    expect(text).toContain('*** TURN *** [Qc 9d Ts] [Jd]')
    expect(text).toContain('Villain: bets 30')
    expect(text).toContain('Board [Qc 9d Ts Jd]')
  })
})
