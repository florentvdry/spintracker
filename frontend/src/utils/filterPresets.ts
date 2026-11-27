/** The filters a preset remembers: everything except the hero, which belongs to the player, not to a view. */
export interface FilterPresetValues {
  dateRange: string
  customDateFrom: string | null
  customDateTo: string | null
  selectedSession: unknown | null
  buyIn: string | number
  position: string
  result: string
}

export interface FilterPreset {
  id: string
  name: string
  values: FilterPresetValues
}

export const PRESET_NAME_MAX_LENGTH = 40
export const MAX_PRESETS = 20

/** A usable preset name: not empty once trimmed, and short enough to fit the menu. */
export function validPresetName(raw: string): string | null {
  const name = raw.trim()
  if (name === '' || name.length > PRESET_NAME_MAX_LENGTH) return null
  return name
}

/** A new preset from the current filters. The id is given so the result is easy to test. */
export function makePreset(name: string, values: FilterPresetValues, id: string): FilterPreset {
  return { id, name, values: { ...values } }
}
