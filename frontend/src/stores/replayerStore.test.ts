import { beforeEach, describe, expect, it, vi } from 'vitest'
// The store persists its display options; give it an in-memory storage in this DOM-less environment.
vi.hoisted(() => {
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  })
})

import { selectCurrentAction, selectDoneActions, selectTotalActions, useReplayerStore } from './replayerStore'

const step = (order: number, street: string, type: string, playerName: string | null, amount: number, potBefore: number, potAfter: number, cards: string | null = null) => ({
  order, street, type, playerName, amount, potBefore, potAfter, cards, description: `${type} ${playerName ?? ''}`.trim(),
})

// Heads-up all-in hand listed the way the backend does it: the deal comes before the blinds.
const HAND = {
  handId: 'h1',
  blinds: '40/80',
  players: [
    { name: 'sb', position: 'SB', initialStack: 992, cards: 'Ah7c', isHero: false },
    { name: 'bb', position: 'BB', initialStack: 508, cards: 'Kh5s', isHero: true },
  ],
  actions: [
    step(1, 'Preflop', 'DealCards', null, 0, 0, 0),
    step(2, 'Preflop', 'PostSB', 'sb', 40, 0, 40),
    step(3, 'Preflop', 'PostBB', 'bb', 80, 40, 120),
    step(4, 'Preflop', 'Call', 'sb', 40, 120, 160),
    step(5, 'Preflop', 'AllIn', 'bb', 508, 160, 588),
    step(6, 'Preflop', 'Call', 'sb', 428, 588, 1016),
    step(7, 'Flop', 'DealCards', null, 0, 0, 0, 'As6hQd'),
    step(8, 'Turn', 'DealCards', null, 0, 0, 0, '8h'),
    step(9, 'River', 'DealCards', null, 0, 0, 0, '6d'),
    step(10, 'Showdown', 'CollectPot', 'sb', 1016, 1016, 0),
  ],
}

const state = () => useReplayerStore.getState()
const player = (name: string) => state().players.find((p) => p.name === name)

describe('replayer store', () => {
  beforeEach(() => {
    state().stop()
    state().setHand(HAND)
  })

  it('starts with the blinds already posted and nothing played', () => {
    expect(player('sb')).toMatchObject({ currentStack: 952, bet: 40 })
    expect(player('bb')).toMatchObject({ currentStack: 428, bet: 80 })
    expect(state().pot).toBe(120)
    expect(selectDoneActions(state())).toBe(0)
    expect(selectCurrentAction(state())).toMatchObject({ type: 'PostBB' })
  })

  it('counts every action after the blinds and the deal as a step', () => {
    expect(selectTotalActions(state())).toBe(7)
  })

  it('adds a call to the bet already in front of the player', () => {
    state().nextStep()
    expect(player('sb')).toMatchObject({ currentStack: 912, bet: 80 })
  })

  it('plays through the flop, the turn, the river and the showdown', () => {
    for (let i = 0; i < selectTotalActions(state()); i++) state().nextStep()
    expect(selectDoneActions(state())).toBe(7)
    expect(state().board).toEqual(['As', '6h', 'Qd', '8h', '6d'])
    expect(player('sb')?.currentStack).toBe(1500)
    expect(player('bb')).toMatchObject({ currentStack: 0, isAllIn: true })
  })

  it('stepping forward and rebuilding to the same point give the same table', () => {
    for (let i = 0; i < 4; i++) state().nextStep()
    const stepped = { players: state().players, pot: state().pot, board: state().board }
    state().jumpToProgress(4)
    expect({ players: state().players, pot: state().pot, board: state().board }).toEqual(stepped)
  })

  it('steps back one action', () => {
    state().nextStep()
    state().nextStep()
    state().prevStep()
    expect(selectDoneActions(state())).toBe(1)
    expect(player('bb')).toMatchObject({ currentStack: 428, bet: 80, isAllIn: false })
    state().prevStep()
    expect(selectDoneActions(state())).toBe(0)
  })

  it('jumps to the end of the hand', () => {
    state().jumpToProgress(selectTotalActions(state()))
    expect(player('sb')?.currentStack).toBe(1500)
  })

  it('starts over when played from the end', () => {
    state().jumpToProgress(selectTotalActions(state()))
    state().play()
    expect(selectDoneActions(state())).toBe(0)
    state().stop()
  })
})
