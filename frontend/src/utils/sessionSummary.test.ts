import { describe, expect, it } from 'vitest'
import { shouldShowSummary } from './sessionSummary'

const session = { session_date: '2026-01-03 20:00:00', session_end: '2026-01-03 21:00:00' }
const at = (iso: string) => Date.parse(iso)

describe('shouldShowSummary', () => {
  it('waits for the configured inactivity', () => {
    expect(shouldShowSummary(session, at('2026-01-03T21:20:00'), 30, null)).toBe(false)
    expect(shouldShowSummary(session, at('2026-01-03T21:30:00'), 30, null)).toBe(true)
  })

  it('is off at 0 minutes and when there is no session', () => {
    expect(shouldShowSummary(session, at('2026-01-03T23:00:00'), 0, null)).toBe(false)
    expect(shouldShowSummary(undefined, at('2026-01-03T23:00:00'), 30, null)).toBe(false)
  })

  it('shows a session once', () => {
    expect(shouldShowSummary(session, at('2026-01-03T23:00:00'), 30, '2026-01-03 20:00:00')).toBe(false)
  })

  it('ignores a session that ended more than a day ago', () => {
    expect(shouldShowSummary(session, at('2026-01-05T09:00:00'), 30, null)).toBe(false)
  })
})
