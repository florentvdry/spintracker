import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Json } from '@/services/ipcService'
import { DEFAULT_INACTIVITY_MINUTES } from '@/utils/sessionSummary'

interface SessionSummaryState {
  inactivityMinutes: number
  /** Start of the last session whose summary popped up, so it pops up once. */
  lastShownStart: string | null
  /** The session whose summary is open, `null` when closed. */
  openSession: Json | null
  setInactivityMinutes: (minutes: number) => void
  open: (session: Json, automatic?: boolean) => void
  close: () => void
}

export const useSessionSummaryStore = create<SessionSummaryState>()(
  persist(
    (set) => ({
      inactivityMinutes: DEFAULT_INACTIVITY_MINUTES,
      lastShownStart: null,
      openSession: null,
      setInactivityMinutes: (minutes) => set({ inactivityMinutes: Math.max(0, Math.floor(minutes) || 0) }),
      open: (session, automatic = false) =>
        set((state) => ({ openSession: session, lastShownStart: automatic ? session.session_date : state.lastShownStart })),
      close: () => set({ openSession: null }),
    }),
    { name: 'spintracker-session-summary', partialize: (state) => ({ inactivityMinutes: state.inactivityMinutes, lastShownStart: state.lastShownStart }) },
  ),
)
