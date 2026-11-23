import type { DateRange } from '@/stores/filterStore'

/** The global filters a preset keeps: what to look at, never who (the hero stays the one selected). */
export interface PresetFilters {
  dateRange: Exclude<DateRange, 'session'>
  customDateFrom: string | null
  customDateTo: string | null
  buyIn: string | number
  position: string
  result: string
}

export interface FilterPreset {
  id: string
  name: string
  filters: PresetFilters
}

export const MAX_PRESETS = 20
export const MAX_PRESET_NAME = 40

const DATE_RANGES: PresetFilters['dateRange'][] = ['all', 'today', 'week', 'month', 'custom']

interface FilterSnapshot {
  dateRange: DateRange
  customDateFrom: string | null
  customDateTo: string | null
  buyIn: string | number
  position: string
  result: string
}

/**
 * What a preset keeps of the current filters. A single session is tied to its own dates and does
 * not make a reusable filter: it is kept as "all".
 */
export function snapshotOf(state: FilterSnapshot): PresetFilters {
  return {
    dateRange: state.dateRange === 'session' ? 'all' : state.dateRange,
    customDateFrom: state.dateRange === 'custom' ? state.customDateFrom : null,
    customDateTo: state.dateRange === 'custom' ? state.customDateTo : null,
    buyIn: state.buyIn,
    position: state.position,
    result: state.result,
  }
}

/** The name a user typed, tidied; `null` when nothing is left. */
export function cleanName(name: string): string | null {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, MAX_PRESET_NAME)
  return cleaned === '' ? null : cleaned
}

/** Presets read back from the storage: anything that does not look like a preset is dropped. */
export function sanitizePresets(raw: unknown): FilterPreset[] {
  if (!Array.isArray(raw)) return []
  const out: FilterPreset[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { id, name, filters } = item as Partial<FilterPreset>
    const cleanedName = typeof name === 'string' ? cleanName(name) : null
    if (typeof id !== 'string' || !cleanedName || !filters || typeof filters !== 'object') continue
    const range = DATE_RANGES.includes(filters.dateRange) ? filters.dateRange : 'all'
    const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback)
    out.push({
      id,
      name: cleanedName,
      filters: {
        dateRange: range,
        customDateFrom: typeof filters.customDateFrom === 'string' ? filters.customDateFrom : null,
        customDateTo: typeof filters.customDateTo === 'string' ? filters.customDateTo : null,
        buyIn: typeof filters.buyIn === 'number' || typeof filters.buyIn === 'string' ? filters.buyIn : 'all',
        position: text(filters.position, 'all'),
        result: text(filters.result, 'all'),
      },
    })
    if (out.length >= MAX_PRESETS) break
  }
  return out
}
