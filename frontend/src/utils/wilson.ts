/** z for a 95 % confidence level. */
const Z_95 = 1.959964

export interface Interval {
  /** Percentages, 0 to 100. */
  low: number
  high: number
}

/**
 * The Wilson score interval of a proportion `num / den`, in percent. Unlike the usual normal
 * approximation it stays inside 0-100 and is sensible for the small samples a HUD shows.
 * `null` without opportunities.
 */
export function wilsonInterval(num: number, den: number, z = Z_95): Interval | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || num < 0 || num > den) return null
  const p = num / den
  const z2 = z * z
  const centre = (p + z2 / (2 * den)) / (1 + z2 / den)
  const margin = (z * Math.sqrt((p * (1 - p)) / den + z2 / (4 * den * den))) / (1 + z2 / den)
  return { low: Math.max(0, (centre - margin) * 100), high: Math.min(100, (centre + margin) * 100) }
}

/** `35 % (24-48)`-style text for a popup: the figure and the range it is likely to lie in. */
export function formatInterval(interval: Interval | null, decimals = 0): string {
  return interval ? `${interval.low.toFixed(decimals)}-${interval.high.toFixed(decimals)} %` : ''
}
