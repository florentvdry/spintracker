/**
 * The model of a user-defined stat, without React: its shape (the same JSON the backend stores),
 * the conditions the editor can build and the validation that mirrors the backend limits
 * (`crates/core/src/stats/custom/model.rs`, which stays the authority).
 */

export const SCHEMA_VERSION = 1

export const STREETS = ['preflop', 'flop', 'turn', 'river'] as const
export const ACTIONS = ['bet', 'raise', 'call', 'check', 'fold'] as const
export type Street = (typeof STREETS)[number]
export type ActionName = (typeof ACTIONS)[number]

export interface Range {
  min?: number | null
  max?: number | null
}

export type RangeLeafType = 'raiseSizeBb' | 'facingRaiseSizeBb' | 'limpersBefore' | 'raisesBefore' | 'playersSeeingFlop'

export type Cond =
  | { type: 'and' | 'or'; items: Cond[] }
  | { type: 'not'; item: Cond }
  | { type: 'flag'; name: string }
  | { type: 'action'; street: Street; action: ActionName; allIn?: boolean | null }
  | { type: 'inPosition' }
  | { type: 'facingAggression'; street: Street }
  | { type: RangeLeafType; range: Range }
  | { type: 'betSizePercentPot'; street: Street; range: Range }

export interface Filters {
  positions: string[]
  tableSizes: number[]
  stackBb?: Range | null
}

export interface CustomStatDef {
  schema: number
  name: string
  numerator: Cond
  denominator?: Cond | null
  filters: Filters
}

export interface CustomStatOptions {
  flags: string[]
  positions: string[]
  tableSizes: number[]
  limits: { nameChars: number; depth: number; leaves: number; stats: number }
  /** Example definitions; `id` is the key of the translated name (`customStats.preset.<id>`). */
  presets?: { id: string; definition: CustomStatDef }[]
}

export interface CustomStat {
  id: number
  name: string
  definition: CustomStatDef
  ready: boolean
}

/** Leaf types in the order the editor offers them. */
export const LEAF_TYPES = [
  'flag', 'action', 'inPosition', 'facingAggression', 'raiseSizeBb', 'facingRaiseSizeBb', 'limpersBefore', 'raisesBefore', 'playersSeeingFlop', 'betSizePercentPot',
] as const
export type LeafType = (typeof LEAF_TYPES)[number]

/** Upper bound of each range kind, as enforced by the backend. */
export const RANGE_LIMITS: Record<string, number> = {
  raiseSizeBb: 1000, facingRaiseSizeBb: 1000, limpersBefore: 8, raisesBefore: 8, playersSeeingFlop: 8, betSizePercentPot: 1000, stackBb: 1000,
}

/** Below this many opportunities a figure is shaky; the tables show it muted. */
export const LOW_SAMPLE = 30

export const DEFAULT_LIMITS: CustomStatOptions['limits'] = { nameChars: 40, depth: 4, leaves: 12, stats: 100 }

export function defaultLeaf(type: LeafType, firstFlag = 'Vpip'): Cond {
  switch (type) {
    case 'flag': return { type, name: firstFlag }
    case 'action': return { type, street: 'preflop', action: 'raise', allIn: null }
    case 'inPosition': return { type }
    case 'facingAggression': return { type, street: 'preflop' }
    case 'betSizePercentPot': return { type, street: 'flop', range: {} }
    default: return { type, range: {} }
  }
}

export function emptyDefinition(firstFlag = 'Vpip'): CustomStatDef {
  return {
    schema: SCHEMA_VERSION,
    name: '',
    numerator: { type: 'and', items: [defaultLeaf('flag', firstFlag)] },
    denominator: null,
    filters: { positions: [], tableSizes: [], stackBb: null },
  }
}

export const isGroup = (cond: Cond): cond is Extract<Cond, { items: Cond[] }> => cond.type === 'and' || cond.type === 'or'

export function countLeaves(cond: Cond): number {
  if (isGroup(cond)) return cond.items.reduce((sum, item) => sum + countLeaves(item), 0)
  if (cond.type === 'not') return countLeaves(cond.item)
  return 1
}

export function depthOf(cond: Cond): number {
  if (isGroup(cond)) return 1 + Math.max(0, ...cond.items.map(depthOf))
  if (cond.type === 'not') return 1 + depthOf(cond.item)
  return 1
}

function rangeError(range: Range | null | undefined, limit: number): string | null {
  if (!range) return null
  const bounds = [range.min, range.max].filter((b): b is number => b !== null && b !== undefined)
  if (bounds.some((b) => !Number.isFinite(b) || b < 0 || b > limit)) return 'range_bounds'
  if (range.min != null && range.max != null && range.min > range.max) return 'range_order'
  return null
}

function condError(cond: Cond, flags: ReadonlySet<string> | null): string | null {
  if (isGroup(cond)) {
    if (cond.items.length === 0) return 'empty_group'
    for (const item of cond.items) {
      const error = condError(item, flags)
      if (error) return error
    }
    return null
  }
  switch (cond.type) {
    case 'not': return condError(cond.item, flags)
    case 'flag': return flags && !flags.has(cond.name) ? 'unknown_flag' : null
    case 'action': return cond.street === 'preflop' && cond.action === 'check' ? 'preflop_check' : null
    case 'inPosition': return null
    case 'facingAggression': return null
    case 'betSizePercentPot': return cond.street === 'preflop' ? 'preflop_bet_size' : rangeError(cond.range, RANGE_LIMITS.betSizePercentPot)
    default: return rangeError(cond.range, RANGE_LIMITS[cond.type])
  }
}

/** The first problem of a definition as a key under `customStats.error`, or `null` when it is valid. */
export function validateDefinition(def: CustomStatDef, options?: Pick<CustomStatOptions, 'flags' | 'limits'>): string | null {
  const limits = options?.limits ?? DEFAULT_LIMITS
  const name = def.name.trim()
  if (name.length === 0 || [...name].length > limits.nameChars) return 'name'
  const flags = options ? new Set(options.flags) : null
  const conds = [def.numerator, ...(def.denominator ? [def.denominator] : [])]
  let leaves = 0
  for (const cond of conds) {
    if (depthOf(cond) > limits.depth) return 'depth'
    leaves += countLeaves(cond)
    const error = condError(cond, flags)
    if (error) return error
  }
  if (leaves > limits.leaves) return 'leaves'
  return rangeError(def.filters.stackBb, RANGE_LIMITS.stackBb)
}

/** Turns a text field into a range bound: empty is open, anything else must be a number. */
export function parseBound(text: string): number | null | undefined {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/** Readable form of a flag name: `FoldTo3BetOpp` becomes `Fold To 3 Bet Opp`. */
export function humanizeFlag(name: string): string {
  return name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([0-9])([A-Za-z])/g, '$1 $2')
}

/** A flag as the picker lists it: situations (the player could act) apart from the actions taken. */
export const isSituationFlag = (name: string) => name.endsWith('Opp')

export function flagLabel(name: string): string {
  return humanizeFlag(isSituationFlag(name) ? name.slice(0, -3) : name)
}

/** A copy of a definition under a new name that still respects the name limit. */
export function copyOf(def: CustomStatDef, suffix: string, maxChars: number): CustomStatDef {
  const name = [...`${def.name} ${suffix}`].slice(0, maxChars).join('')
  return { ...def, name }
}

/** Removes the empty optional parts the backend does not need, keeping the stored JSON small. */
export function cleanDefinition(def: CustomStatDef): CustomStatDef {
  const filters: Filters = { positions: def.filters.positions, tableSizes: def.filters.tableSizes }
  const stack = def.filters.stackBb
  if (stack && (stack.min != null || stack.max != null)) filters.stackBb = stack
  return { ...def, name: def.name.trim(), denominator: def.denominator ?? null, filters }
}
