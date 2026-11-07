/** The table window the HUD sizes were drawn for: at this size a panel is shown at its own scale. */
export const REFERENCE_TABLE_WIDTH_PX = 1800
export const REFERENCE_TABLE_HEIGHT_PX = 1000
/** The default smallest a panel gets on a small table: below it the figures stop being readable. */
export const MIN_TABLE_SCALE = 0.7
/** The range a profile can set that smallest size in. */
export const LOWEST_MIN_TABLE_SCALE = 0.3
export const HIGHEST_MIN_TABLE_SCALE = 1
/** A big table would only blow the panels up. */
export const MAX_TABLE_SCALE = 1.5

/** How much the panels shrink or grow with the table window, so that a small table keeps its room. */
export function tableScale(width: number, height: number, smallest = MIN_TABLE_SCALE): number {
  if (!(width > 0) || !(height > 0)) return 1
  const fit = Math.min(width / REFERENCE_TABLE_WIDTH_PX, height / REFERENCE_TABLE_HEIGHT_PX)
  return Math.min(MAX_TABLE_SCALE, Math.max(smallest, fit))
}
