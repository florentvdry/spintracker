import { describe, expect, it } from 'vitest'
import {
  availableBuyIns,
  availableRooms,
  buildFilter,
  handsByRoom,
  periodRange,
  summarize,
  type ExportBucket,
  type ExportSelection,
} from './exportFilter'

const buckets: ExportBucket[] = [
  { room: 'Winamax', buyIn: 5, day: '2026-01-10', hands: 100, bytes: 1000 },
  { room: 'Winamax', buyIn: 5, day: '2026-01-11', hands: 50, bytes: 500 },
  { room: 'Winamax', buyIn: 10, day: '2026-02-03', hands: 20, bytes: 200 },
  { room: 'Unibet', buyIn: 5, day: '2026-02-03', hands: 30, bytes: 300 },
  { room: null, buyIn: null, day: '2026-02-04', hands: 4, bytes: 40 },
]

function selection(overrides: Partial<ExportSelection> = {}): ExportSelection {
  return {
    period: 'all',
    customFrom: '',
    customTo: '',
    rooms: new Set(availableRooms(buckets)),
    buyIns: new Set(availableBuyIns(buckets)),
    grouping: 'day',
    ...overrides,
  }
}

const today = new Date(2026, 2, 15)

describe('periodRange', () => {
  it('has no bounds for the whole history', () => {
    expect(periodRange({ period: 'all', customFrom: '', customTo: '' }, today)).toEqual({ dateFrom: null, dateTo: null })
  })

  it('counts today as part of the last 30 days', () => {
    expect(periodRange({ period: 'last30Days', customFrom: '', customTo: '' }, today)).toEqual({
      dateFrom: '2026-02-14',
      dateTo: '2026-03-15',
    })
  })

  it('uses the custom dates as typed', () => {
    expect(periodRange({ period: 'custom', customFrom: '2026-01-01', customTo: '' }, today)).toEqual({
      dateFrom: '2026-01-01',
      dateTo: null,
    })
  })
})

describe('buildFilter', () => {
  it('sends null lists when nothing is restricted so unknown rooms and buy-ins are kept', () => {
    const filter = buildFilter(selection(), buckets, today)
    expect(filter.rooms).toBeNull()
    expect(filter.buyIns).toBeNull()
  })

  it('lists only the selected rooms and buy-ins', () => {
    const filter = buildFilter(selection({ rooms: new Set(['Winamax']), buyIns: new Set([5]) }), buckets, today)
    expect(filter.rooms).toEqual(['Winamax'])
    expect(filter.buyIns).toEqual([5])
  })
})

describe('summarize', () => {
  it('counts everything with an empty filter, including hands without room or buy-in', () => {
    const result = summarize(buckets, buildFilter(selection(), buckets, today))
    expect(result).toEqual({ hands: 204, files: 4, bytes: 2040 })
  })

  it('applies room and buy-in together', () => {
    const filter = buildFilter(selection({ rooms: new Set(['Winamax']), buyIns: new Set([5]) }), buckets, today)
    expect(summarize(buckets, filter)).toEqual({ hands: 150, files: 2, bytes: 1500 })
  })

  it('merges files by month or into one', () => {
    const month = summarize(buckets, buildFilter(selection({ grouping: 'month' }), buckets, today))
    const single = summarize(buckets, buildFilter(selection({ grouping: 'single' }), buckets, today))
    expect(month.files).toBe(2)
    expect(single.files).toBe(1)
  })

  it('produces no file when nothing matches', () => {
    const filter = buildFilter(selection({ rooms: new Set() }), buckets, today)
    expect(summarize(buckets, filter)).toEqual({ hands: 0, files: 0, bytes: 0 })
  })

  it('treats an inverted custom range as empty', () => {
    const filter = buildFilter(selection({ period: 'custom', customFrom: '2026-03-01', customTo: '2026-01-01' }), buckets, today)
    expect(summarize(buckets, filter).hands).toBe(0)
  })
})

describe('handsByRoom', () => {
  it('counts the hands of each room inside the period only', () => {
    const counts = handsByRoom(buckets, { dateFrom: '2026-02-01', dateTo: null })
    expect(counts.get('Winamax')).toBe(20)
    expect(counts.get('Unibet')).toBe(30)
    expect(counts.has('null')).toBe(false)
  })
})
