import { describe, expect, it } from 'vitest'
import { goalPercent, parseBounded, sessionStatus } from './volume'

describe('goalPercent', () => {
  it('is the share of the target reached, capped at 100', () => {
    expect(goalPercent(10, 40)).toBeCloseTo(25)
    expect(goalPercent(50, 40)).toBe(100)
  })

  it('is 0 when there is no target', () => {
    expect(goalPercent(10, 0)).toBe(0)
  })
})

describe('sessionStatus', () => {
  const now = new Date(2026, 0, 5, 22, 0, 0)

  it('is ongoing when the last hand is within the inactivity window', () => {
    expect(sessionStatus('2026-01-05 21:45:00', now, 30)).toBe('ongoing')
  })

  it('is ended once the inactivity window has passed', () => {
    expect(sessionStatus('2026-01-05 21:00:00', now, 30)).toBe('ended')
  })

  it('is ended when the date cannot be read', () => {
    expect(sessionStatus('not a date', now, 30)).toBe('ended')
  })
})

describe('parseBounded', () => {
  it('accepts a value inside the bounds', () => {
    expect(parseBounded('45', 1, 1440)).toBe(45)
    expect(parseBounded('1,5', 1, 1440)).toBe(1.5)
  })

  it('rejects empty, non-numeric and out-of-range values', () => {
    expect(parseBounded('', 1, 1440)).toBeNull()
    expect(parseBounded('x', 1, 1440)).toBeNull()
    expect(parseBounded('0', 1, 1440)).toBeNull()
  })
})
