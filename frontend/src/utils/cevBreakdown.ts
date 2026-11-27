/** Limits of the bad-beat settings the player can change. */
export const BAD_BEAT_WINDOW = { min: 1, max: 100, default: 10 } as const
export const BAD_BEAT_EQUITY = { min: 0, max: 100, default: 60 } as const

/** Parses a player-typed number; null when it is empty, not a number or outside `[min, max]`. */
export function parseBounded(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < min || value > max) return null
  return value
}

/** Chip EV summed over some hands; `hands` is how many hands it covers. */
export interface CevBucket {
  hands: number
  ev: number
}

export type TableMixKey = 'fish_only' | 'mixed' | 'reg_only'

export interface CevAfterBadBeat {
  window: number
  equity_threshold: number
  bad_beats: number
  tournaments: number
  ev: number
}

export interface CevBreakdown {
  by_table_mix: Partial<Record<TableMixKey, CevBucket>>
  /** Keys are the multiplier as a string, as JSON object keys always are. */
  by_multiplier: Record<string, CevBucket>
  /** Index 0 is the first part of the tournaments. */
  by_progress: CevBucket[]
  after_bad_beat: CevAfterBadBeat
}

/** Multipliers in ascending order, with their buckets. */
export function sortedMultipliers(byMultiplier: Record<string, CevBucket>): [number, CevBucket][] {
  return Object.entries(byMultiplier)
    .map(([key, bucket]) => [Number(key), bucket] as [number, CevBucket])
    .sort(([a], [b]) => a - b)
}
