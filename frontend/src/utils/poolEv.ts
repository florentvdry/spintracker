import { MULTIPLIER_PRESETS, type PresetRow } from '@/views/VarianceSimulator/multiplierPresets'

/** One editable line of a multiplier table; kept as text so the user can type freely. */
export interface PoolEvRow {
  multiplier: string
  weight: string
}

/** Tables by room key (`winamax`) with optional per buy-in overrides (`winamax:5`). */
export type PoolEvTables = Record<string, PoolEvRow[]>

/** Rooms the table can be edited for; the presets cover some of them, the others start empty. */
export const POOL_EV_ROOMS = ['winamax', 'betclic', 'unibet'] as const

/** Tables the simulator presets define, copied so editing never touches the shared source. */
export function defaultPoolEvTables(): PoolEvTables {
  const tables: PoolEvTables = {}
  for (const room of POOL_EV_ROOMS) {
    const preset: PresetRow[] | undefined = (MULTIPLIER_PRESETS as Record<string, PresetRow[]>)[room]
    tables[room] = preset ? preset.map((row) => ({ ...row })) : []
  }
  return tables
}

/** Mean multiplier of a table, `null` when no line is usable. */
export function meanMultiplier(rows: PoolEvRow[]): number | null {
  let weighted = 0
  let total = 0
  for (const row of rows) {
    const multiplier = Number(row.multiplier)
    const weight = Number(row.weight)
    if (multiplier > 0 && weight > 0) {
      weighted += multiplier * weight
      total += weight
    }
  }
  return total > 0 ? weighted / total : null
}

/** The payload the backend stores: numeric lines only. */
export function toStoredTables(tables: PoolEvTables): Record<string, { multiplier: number; weight: number }[]> {
  const stored: Record<string, { multiplier: number; weight: number }[]> = {}
  for (const [key, rows] of Object.entries(tables)) {
    const lines = rows
      .map((row) => ({ multiplier: Number(row.multiplier), weight: Number(row.weight) }))
      .filter((row) => row.multiplier > 0 && row.weight > 0)
    if (lines.length > 0) stored[key] = lines
  }
  return stored
}

/** Reads what the backend stored back into editable rows, `null` when nothing valid was saved. */
export function fromStoredTables(raw: unknown): PoolEvTables | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const tables: PoolEvTables = {}
  for (const [key, rows] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue
    tables[key] = rows.map((row) => ({ multiplier: String(row?.multiplier ?? ''), weight: String(row?.weight ?? '') }))
  }
  return Object.keys(tables).length > 0 ? tables : null
}
