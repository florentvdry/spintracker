/** Rooms the rakeback settings offer. Identifiers as stored by the parsers, not display text. */
export const RAKEBACK_ROOMS = ['Winamax', 'Unibet', 'Betclic'] as const

export const MAX_RAKEBACK_PERCENT = 100

export interface RoomRakeback {
  room: string
  tournaments: number
  totalFees: number
  percent: number
  rakeback: number
}

/** Parses a percentage typed by the player; null when it is empty, not a number or out of range. */
export function parseRakebackPercent(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0 || value > MAX_RAKEBACK_PERCENT) return null
  return value
}

/** Total rakeback across rooms. */
export function totalRakeback(rows: RoomRakeback[]): number {
  return rows.reduce((sum, row) => sum + row.rakeback, 0)
}

/** Total entry fees across rooms. */
export function totalFees(rows: RoomRakeback[]): number {
  return rows.reduce((sum, row) => sum + row.totalFees, 0)
}
