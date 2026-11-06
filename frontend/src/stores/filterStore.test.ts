import { describe, expect, it } from 'vitest'
import { getDateRangeParams } from './filterStore'

const none = { customDateFrom: null, customDateTo: null, selectedSession: null }

describe('getDateRangeParams', () => {
  it('sends custom bounds as UTC, the zone the hand times are stored in', () => {
    const { dateFrom, dateTo } = getDateRangeParams({ dateRange: 'custom', ...none, customDateFrom: '2026-05-25T14:30', customDateTo: '2026-05-26' })
    const asInstant = (utc: string | null) => new Date(`${utc?.replace(' ', 'T')}Z`).getTime()
    expect(asInstant(dateFrom)).toBe(new Date('2026-05-25T14:30').getTime())
    expect(asInstant(dateTo)).toBe(new Date('2026-05-26T00:00').getTime())
  })

  it('starts "today" at the local midnight, expressed in UTC', () => {
    const { dateFrom, dateTo } = getDateRangeParams({ dateRange: 'today', ...none })
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    expect(new Date(`${dateFrom?.replace(' ', 'T')}Z`).getTime()).toBe(midnight.getTime())
    expect(dateTo).toBeNull()
  })

  it('leaves the bounds open for "all"', () => {
    expect(getDateRangeParams({ dateRange: 'all', ...none })).toEqual({ dateFrom: null, dateTo: null })
  })
})
