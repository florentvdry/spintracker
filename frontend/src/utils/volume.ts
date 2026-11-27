export type GoalPeriodKey = 'week' | 'month'

export interface GoalProgress {
  period: GoalPeriodKey
  target: number
  done: number
}

export interface VolumeSummary {
  volume: {
    tournaments: number
    sessions: number
    play_hours: number
    tournaments_per_hour: number
    average_duration_minutes: number
  }
  goals: GoalProgress[]
}

export const DEFAULT_INACTIVITY_MINUTES = 30
export const MIN_INACTIVITY_MINUTES = 1
export const MAX_INACTIVITY_MINUTES = 24 * 60

/** Percentage of a goal reached, capped at 100. A missing target counts as no goal (0). */
export function goalPercent(done: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, (done / target) * 100)
}

/**
 * Whether the latest session is still running: its last hand is recent enough.
 * `sessionEnd` is the backend's local "YYYY-MM-DD HH:MM:SS" text.
 */
export function sessionStatus(sessionEnd: string, now: Date, inactivityMinutes: number): 'ongoing' | 'ended' {
  const end = new Date(sessionEnd.replace(' ', 'T'))
  if (Number.isNaN(end.getTime())) return 'ended'
  const minutesSince = (now.getTime() - end.getTime()) / 60_000
  return minutesSince <= inactivityMinutes ? 'ongoing' : 'ended'
}

/** Parses a player-typed number; null when it is empty, not a number or outside `[min, max]`. */
export function parseBounded(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < min || value > max) return null
  return value
}
