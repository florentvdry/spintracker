import { create } from 'zustand'

interface ProgressState {
  isVisible: boolean
  title: string
  message: string
  progress: number
  start: (options: { title: string; message?: string }) => void
  update: (options: { progress?: number; message?: string }) => void
  finish: () => void
}

export const useProgressStore = create<ProgressState>((set) => ({
  isVisible: false,
  title: '',
  message: '',
  progress: 0,
  start: ({ title, message = '' }) => set({ isVisible: true, title, message, progress: 0 }),
  update: ({ progress, message }) =>
    set((state) => ({ progress: progress ?? state.progress, message: message ?? state.message })),
  finish: () => set({ isVisible: false, title: '', message: '', progress: 0 }),
}))
