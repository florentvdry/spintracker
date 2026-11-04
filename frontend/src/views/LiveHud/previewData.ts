import { statKey, type HudStatRow } from './hudProfile'
import type { HudFigure } from '@/components/livehud/HudPanel'

/** Example players for the previews. These are made-up figures, never read from the database. */
export const PREVIEW_HANDS = 184

const PREVIEW_PCT = [71, 38, 42, 54, 48, 46, 29, 12, 47, 33, 14, 40]
/** Opportunities behind each example figure: high enough not to hit a sample threshold by accident. */
const PREVIEW_DEN = 60

/** Example figures for a list of rows, in row order. */
export function previewFigures(rows: HudStatRow[]): Record<string, HudFigure> {
  return Object.fromEntries(rows.map((row, i) => [statKey(row), { pct: PREVIEW_PCT[i % PREVIEW_PCT.length], den: PREVIEW_DEN }]))
}
