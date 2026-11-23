export interface TimeCell {
  weekday: number
  hour: number
  tournaments: number
  euro: number
  ev_chips: number
  fish_share: number | null
}

export type HeatmapMetric = 'euro' | 'cev' | 'fish'

export const WEEKDAYS = 7
export const HOURS = 24

const POSITIVE_RGB = '52, 194, 122'
const NEGATIVE_RGB = '255, 122, 107'
const NEUTRAL_RGB = '90, 160, 255'
const MIN_ALPHA = 0.12
const MAX_ALPHA = 0.9

/** The value a cell shows for a metric, `null` when it has none. */
export function cellValue(cell: TimeCell, metric: HeatmapMetric): number | null {
  switch (metric) {
    case 'euro':
      return cell.euro
    case 'cev':
      return cell.tournaments > 0 ? cell.ev_chips / cell.tournaments : null
    case 'fish':
      return cell.fish_share === null ? null : cell.fish_share * 100
  }
}

/** Indexes the cells by weekday and hour. */
export function cellGrid(cells: TimeCell[]): (TimeCell | undefined)[][] {
  const grid: (TimeCell | undefined)[][] = Array.from({ length: WEEKDAYS }, () => new Array<TimeCell | undefined>(HOURS).fill(undefined))
  for (const cell of cells) {
    if (cell.weekday >= 0 && cell.weekday < WEEKDAYS && cell.hour >= 0 && cell.hour < HOURS) grid[cell.weekday][cell.hour] = cell
  }
  return grid
}

/** Largest absolute value of the metric over the cells, to scale the colours. */
export function maxAbs(cells: TimeCell[], metric: HeatmapMetric): number {
  return cells.reduce((max, cell) => Math.max(max, Math.abs(cellValue(cell, metric) ?? 0)), 0)
}

/** Background of a cell: green above zero, red below, one blue ramp for the fish share. */
export function heatColor(value: number | null, max: number, metric: HeatmapMetric): string {
  if (value === null || max <= 0) return 'transparent'
  const strength = Math.min(1, Math.abs(value) / max)
  const alpha = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * strength
  const rgb = metric === 'fish' ? NEUTRAL_RGB : value >= 0 ? POSITIVE_RGB : NEGATIVE_RGB
  return `rgba(${rgb}, ${alpha.toFixed(2)})`
}
