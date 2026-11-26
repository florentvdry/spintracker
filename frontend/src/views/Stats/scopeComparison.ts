import type { Json } from '@/services/ipcService'

/** The three populations compared side by side. */
export const COMPARED_SCOPES = ['me', 'reg', 'fish'] as const
export type ComparedScope = (typeof COMPARED_SCOPES)[number]

export interface ScopeFigure {
  /** Percentage, or a count for the stats that are only counted. */
  value: number | null
  /** Opportunities behind the figure. */
  sample: number
}

export interface ComparisonRow {
  stat: string
  figures: Record<ComparedScope, ScopeFigure>
}

const NO_FIGURE: ScopeFigure = { value: null, sample: 0 }

/** The figure of a preflop row of the `/db/detailed-stats` answer, over every table column. */
function figureOf(row: Json | undefined): ScopeFigure {
  if (!row) return NO_FIGURE
  const sample = Number(row.samples?.tot?.den ?? 0)
  const value = typeof row.tot === 'number' ? row.tot : null
  return { value: sample > 0 ? value : null, sample }
}

/**
 * One row per preflop stat with the figure of the hero, of the regulars and of the fish. A stat
 * missing from an answer (a scope without data) shows no figure rather than a zero.
 */
export function comparisonRows(answers: Record<ComparedScope, Json | null>): ComparisonRow[] {
  const byScope = Object.fromEntries(
    COMPARED_SCOPES.map((scope) => [scope, new Map<string, Json>(((answers[scope]?.preflop ?? []) as Json[]).map((row) => [String(row.stat), row]))]),
  ) as Record<ComparedScope, Map<string, Json>>
  const order: string[] = []
  for (const scope of COMPARED_SCOPES) for (const stat of byScope[scope].keys()) if (!order.includes(stat)) order.push(stat)
  return order.map((stat) => ({
    stat,
    figures: {
      me: figureOf(byScope.me.get(stat)),
      reg: figureOf(byScope.reg.get(stat)),
      fish: figureOf(byScope.fish.get(stat)),
    },
  }))
}
