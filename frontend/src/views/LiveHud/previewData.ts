import { figureKey, requestsOf, type HudFigures, type HudLayout } from './hudGrid'

/** Example players for the previews. These are made-up figures, never read from the database. */

/** A stable pseudo-random number in `[0, 1)` from a string, so previews do not flicker. */
function hash01(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

const EXAMPLE_HU_HANDS = 37
const EXAMPLE_THREE_WAY_HANDS = 125
const MAX_EXAMPLE_BUCKET_HANDS = 14
const MAX_EXAMPLE_SAMPLE = 40

/** Example figures for every figure a layout shows. */
export function previewFigures(layout: HudLayout): HudFigures {
  const figures: HudFigures = {}
  for (const r of requestsOf(layout)) {
    const key = figureKey(r.section, r.label, r.column, r.bucket)
    const roll = hash01(key)
    if (r.section === 'meta') {
      const count = r.column === 'three_way' ? EXAMPLE_THREE_WAY_HANDS : r.column === 'hu' ? EXAMPLE_HU_HANDS : Math.round(roll * MAX_EXAMPLE_BUCKET_HANDS)
      figures[key] = { pct: null, num: count, den: count }
    } else {
      // Some figures rest on very few opportunities, so that the low-sample display is visible.
      const den = Math.round(1 + hash01(`${key}#`) * (MAX_EXAMPLE_SAMPLE - 1))
      const num = Math.round(roll * den)
      figures[key] = { pct: den === 0 ? null : Math.round((1000 * num) / den) / 10, num, den }
    }
  }
  return figures
}
