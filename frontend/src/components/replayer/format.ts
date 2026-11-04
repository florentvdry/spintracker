import type { ReplayerViewMode } from '@/stores/replayerStore'

/** Big blind from a "small/big" blinds string, or 0 when unknown. */
export function parseBigBlind(blinds: unknown): number {
  if (!blinds) return 0
  const parts = String(blinds).split('/')
  return parts.length === 2 ? Number(parts[1]) || 0 : 0
}

/** Compact amount for seats and pot: chips, or big blinds when available. */
export function formatReplayValue(value: unknown, mode: ReplayerViewMode, bbValue: number): string {
  const amount = Number(value || 0)
  if (mode === 'bb' && bbValue > 0) {
    const bb = amount / bbValue
    return bb < 10 ? bb.toFixed(1) : Math.round(bb).toString()
  }
  return Math.round(amount).toLocaleString()
}
