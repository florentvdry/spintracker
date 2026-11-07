/** Pure logic of the export dialog: which hands a selection keeps, and what the archive will hold. */

export interface ExportBucket {
  room: string | null
  buyIn: number | null
  /** ISO day, `YYYY-MM-DD`. */
  day: string
  hands: number
  bytes: number
}

export type ExportPeriod = 'all' | 'last12Months' | 'last30Days' | 'custom'
export type ExportGrouping = 'day' | 'month' | 'single'

export interface ExportSelection {
  period: ExportPeriod
  customFrom: string
  customTo: string
  rooms: ReadonlySet<string>
  buyIns: ReadonlySet<number>
  grouping: ExportGrouping
}

/** Payload of the `export_data` command; a `null` list means "no restriction". */
export interface ExportFilter {
  dateFrom: string | null
  dateTo: string | null
  rooms: string[] | null
  buyIns: number[] | null
  grouping: ExportGrouping
}

export interface ExportSummary {
  hands: number
  files: number
  bytes: number
}

const LAST_30_DAYS = 30
const LAST_12_MONTHS_DAYS = 365
const BUY_IN_EPSILON = 1e-6

export function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function daysAgo(today: Date, days: number): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days)
  return toIsoDay(date)
}

export interface DateRange {
  dateFrom: string | null
  dateTo: string | null
}

export function periodRange(selection: Pick<ExportSelection, 'period' | 'customFrom' | 'customTo'>, today: Date): DateRange {
  switch (selection.period) {
    case 'last30Days':
      return { dateFrom: daysAgo(today, LAST_30_DAYS - 1), dateTo: toIsoDay(today) }
    case 'last12Months':
      return { dateFrom: daysAgo(today, LAST_12_MONTHS_DAYS - 1), dateTo: toIsoDay(today) }
    case 'custom':
      return { dateFrom: selection.customFrom || null, dateTo: selection.customTo || null }
    default:
      return { dateFrom: null, dateTo: null }
  }
}

function inRange(bucket: ExportBucket, range: DateRange): boolean {
  // ISO days order correctly as strings.
  if (range.dateFrom && bucket.day < range.dateFrom) return false
  if (range.dateTo && bucket.day > range.dateTo) return false
  return true
}

/** Hands per room inside the period, for the counters next to the room checkboxes. */
export function handsByRoom(buckets: ExportBucket[], range: DateRange): Map<string, number> {
  const counts = new Map<string, number>()
  for (const bucket of buckets) {
    if (!bucket.room || !inRange(bucket, range)) continue
    counts.set(bucket.room, (counts.get(bucket.room) ?? 0) + bucket.hands)
  }
  return counts
}

export function availableRooms(buckets: ExportBucket[]): string[] {
  return [...new Set(buckets.flatMap((b) => (b.room ? [b.room] : [])))].sort((a, b) => a.localeCompare(b))
}

export function availableBuyIns(buckets: ExportBucket[]): number[] {
  return [...new Set(buckets.flatMap((b) => (b.buyIn === null ? [] : [b.buyIn])))].sort((a, b) => a - b)
}

/**
 * Turns the dialog state into the command payload. A filter left on "everything" is sent as
 * `null` so hands without a known room or buy-in are not dropped silently.
 */
export function buildFilter(selection: ExportSelection, buckets: ExportBucket[], today: Date): ExportFilter {
  const rooms = availableRooms(buckets)
  const buyIns = availableBuyIns(buckets)
  return {
    ...periodRange(selection, today),
    rooms: rooms.every((room) => selection.rooms.has(room)) ? null : rooms.filter((room) => selection.rooms.has(room)),
    buyIns: buyIns.every((b) => selection.buyIns.has(b)) ? null : buyIns.filter((b) => selection.buyIns.has(b)),
    grouping: selection.grouping,
  }
}

function matches(bucket: ExportBucket, filter: ExportFilter): boolean {
  if (!inRange(bucket, filter)) return false
  if (filter.rooms && !(bucket.room && filter.rooms.includes(bucket.room))) return false
  if (filter.buyIns) {
    const { buyIn } = bucket
    if (buyIn === null || !filter.buyIns.some((wanted) => Math.abs(wanted - buyIn) < BUY_IN_EPSILON)) return false
  }
  return true
}

/** Size of the archive a filter would produce, computed from the per-day buckets. */
export function summarize(buckets: ExportBucket[], filter: ExportFilter): ExportSummary {
  let hands = 0
  let bytes = 0
  const fileKeys = new Set<string>()
  for (const bucket of buckets) {
    if (!matches(bucket, filter)) continue
    hands += bucket.hands
    bytes += bucket.bytes
    fileKeys.add(filter.grouping === 'day' ? bucket.day : filter.grouping === 'month' ? bucket.day.slice(0, 7) : 'all')
  }
  return { hands, files: fileKeys.size, bytes }
}

export function formatBytes(bytes: number, locale: string): string {
  const MEGABYTE = 1024 * 1024
  const KILOBYTE = 1024
  if (bytes >= MEGABYTE) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / MEGABYTE)} MB`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(bytes / KILOBYTE))} KB`
}
