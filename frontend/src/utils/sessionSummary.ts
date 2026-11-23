/** Minutes of inactivity after which the summary of the last session is shown; 0 turns it off. */
export const DEFAULT_INACTIVITY_MINUTES = 30
/** A session that ended longer ago than this is history, not a session that just finished. */
export const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000
const MS_PER_MINUTE = 60_000

/** Parses a stored hand time (`2026-01-03 02:05:11`); `null` when it cannot be read. */
export function parseSessionTime(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const time = Date.parse(value.replace(' ', 'T'))
  return Number.isNaN(time) ? null : time
}

export interface SessionLike {
  session_date?: string
  session_end?: string
}

/**
 * Whether the summary of `session` should pop up now: it ended at least `inactivityMinutes` ago,
 * not more than a day ago, and has not been shown yet.
 */
export function shouldShowSummary(session: SessionLike | undefined, now: number, inactivityMinutes: number, lastShownStart: string | null): boolean {
  if (!session?.session_date || inactivityMinutes <= 0) return false
  if (session.session_date === lastShownStart) return false
  const end = parseSessionTime(session.session_end ?? session.session_date)
  if (end === null) return false
  const idle = now - end
  return idle >= inactivityMinutes * MS_PER_MINUTE && idle <= MAX_SESSION_AGE_MS
}
