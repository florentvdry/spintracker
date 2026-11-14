import { describe, expect, it } from 'vitest'
import { BOX_COLORS, boxBarWidth, cardsToday, lastSessionDay, masteredShare, scenariosOf, type ReviewOverview, type ReviewScenario } from './review'

const scenario = (spotId: number): ReviewScenario => ({ scenarioId: spotId * 10, spotId, name: `s${spotId}`, stackBb: 10, cards: 4, mastered: 1, dueToday: 2, lastSession: null })

describe('review figures', () => {
  it('adds the due cards and the new ones allowed today', () => {
    expect(cardsToday({ today: { due: 46, newAvailable: 20, minutes: 9 } })).toBe(66)
  })

  it('sizes the box bars against the fullest box', () => {
    const boxes = [46, 88, 161, 240, 412]
    expect(boxBarWidth(412, boxes)).toBe(100)
    expect(boxBarWidth(206, boxes)).toBe(50)
    expect(boxBarWidth(0, [0, 0, 0, 0, 0])).toBe(0)
    expect(BOX_COLORS).toHaveLength(5)
  })

  it('computes a mastered share without dividing by zero', () => {
    expect(masteredShare(652, 947)).toBe(69)
    expect(masteredShare(0, 0)).toBe(0)
  })

  it('keeps the scenarios of a program, or all of them', () => {
    const overview: Pick<ReviewOverview, 'scenarios'> = { scenarios: [scenario(1), scenario(2), scenario(3)] }
    expect(scenariosOf(overview, null)).toHaveLength(3)
    expect(scenariosOf(overview, [1, 3]).map((s) => s.spotId)).toEqual([1, 3])
    expect(scenariosOf(overview, [])).toEqual([])
  })

  it('shortens a last-session timestamp to its day', () => {
    expect(lastSessionDay('2026-11-12T20:15:00')).toBe('2026-11-12')
    expect(lastSessionDay(null)).toBeNull()
  })
})
