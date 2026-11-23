import { describe, expect, it } from 'vitest'
import { roomPercent, useProgressStore } from './progressStore'

describe('import progress details', () => {
  it('computes a room share from imported and skipped hands and caps it', () => {
    expect(roomPercent({ room: 'Winamax', totalHands: 200, handsImported: 40, handsSkipped: 10, tournaments: 3 })).toBe(25)
    expect(roomPercent({ room: 'Betclic', totalHands: 0, handsImported: 5, handsSkipped: 0, tournaments: 1 })).toBe(0)
    expect(roomPercent({ room: 'Unibet', totalHands: 10, handsImported: 30, handsSkipped: 0, tournaments: 1 })).toBe(100)
  })

  it('keeps the details between updates and clears them when finished', () => {
    const store = useProgressStore.getState()
    store.start({ title: 'Import' })
    store.update({ progress: 10, details: { rooms: [], hands: 5, tournaments: 1 } })
    store.update({ message: 'still going' })
    expect(useProgressStore.getState().details?.hands).toBe(5)
    store.finish()
    expect(useProgressStore.getState().details).toBeNull()
  })
})
