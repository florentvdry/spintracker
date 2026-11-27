/** One cell of the weekday x hour grid returned by the backend. */
export interface ResultCell {
  tournaments: number
  profit: number
}

export interface FishCell {
  opponents: number
  fish: number
}

export interface HourlyAnalysis {
  /** `[weekday][hour]`, weekdays Monday first. */
  results: ResultCell[][]
  by_hour: ResultCell[]
  fish: FishCell[][]
}

/** Opacity (0.15 to 1) of a cell, relative to the largest absolute value on the grid. */
export function shadeOpacity(value: number, maxAbs: number): number {
  if (maxAbs <= 0 || value === 0) return 0.15
  const MIN_OPACITY = 0.15
  return Math.min(1, MIN_OPACITY + (Math.abs(value) / maxAbs) * (1 - MIN_OPACITY))
}

/** Largest absolute profit over every cell of the grid. */
export function maxAbsProfit(grid: ResultCell[][]): number {
  return grid.reduce((max, day) => day.reduce((m, cell) => Math.max(m, Math.abs(cell.profit)), max), 0)
}

/** Share of fish among the opponents seen in a cell; null when no opponent was seen. */
export function fishShare(cell: FishCell): number | null {
  if (cell.opponents <= 0) return null
  return (cell.fish / cell.opponents) * 100
}
