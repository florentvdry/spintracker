import { create } from 'zustand'

/** Hands and tournaments one room has delivered during an import. */
export interface RoomProgress {
  room: string
  totalHands: number
  handsImported: number
  handsSkipped: number
  tournaments: number
}

interface ProgressDetails {
  rooms: RoomProgress[]
  hands: number
  tournaments: number
}

interface ProgressState {
  isVisible: boolean
  title: string
  message: string
  progress: number
  /** Per-room figures, only for an import. */
  details: ProgressDetails | null
  start: (options: { title: string; message?: string }) => void
  update: (options: { progress?: number; message?: string; details?: ProgressDetails | null }) => void
  finish: () => void
}

export const useProgressStore = create<ProgressState>((set) => ({
  isVisible: false,
  title: '',
  message: '',
  progress: 0,
  details: null,
  start: ({ title, message = '' }) => set({ isVisible: true, title, message, progress: 0, details: null }),
  update: ({ progress, message, details }) =>
    set((state) => ({ progress: progress ?? state.progress, message: message ?? state.message, details: details === undefined ? state.details : details })),
  finish: () => set({ isVisible: false, title: '', message: '', progress: 0, details: null }),
}))

/** Share of a room's hands already handled, 0..100; a room with no counted hands shows 0. */
export function roomPercent(room: RoomProgress): number {
  if (room.totalHands <= 0) return 0
  return Math.min(100, ((room.handsImported + room.handsSkipped) / room.totalHands) * 100)
}
