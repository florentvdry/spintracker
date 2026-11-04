import type { HudFigures } from '@/components/livehud/HudPanel'
import { requestsOf, figureKey, type HudLayout } from './hudProfile'

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

/** Example figures for every figure a layout shows. */
export function previewFigures(layout: HudLayout): HudFigures {
  const figures: HudFigures = {}
  for (const r of requestsOf(layout)) {
    const key = figureKey(r.section, r.label, r.column, r.bucket)
    const roll = hash01(key)
    if (r.section === 'meta') {
      const count = r.column === 'three_way' ? 125 : r.column === 'hu' ? 37 : Math.round(roll * 14)
      figures[key] = { pct: null, num: count, den: count }
    } else {
      const den = Math.round(1 + hash01(`${key}#`) * 24)
      figures[key] = { pct: Math.round(roll * 100), num: Math.round((roll * den)), den }
    }
  }
  return figures
}
