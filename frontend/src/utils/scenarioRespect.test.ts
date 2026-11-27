import { describe, expect, it } from 'vitest'
import { scenarioRespect } from './rangeAdherence'

describe('scenarioRespect', () => {
  it('is the matching decisions over all decisions of the scenario', () => {
    const stats = {
      AKs: { matches: 3, deviations: 1 },
      QJo: { matches: 1, deviations: 3 },
    }
    expect(scenarioRespect(stats)).toBeCloseTo(4 / 8)
  })

  it('is null when no decision was compared', () => {
    expect(scenarioRespect({})).toBeNull()
    expect(scenarioRespect({ AKs: { matches: 0, deviations: 0 } })).toBeNull()
  })
})
