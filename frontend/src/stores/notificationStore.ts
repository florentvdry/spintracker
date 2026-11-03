import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: number
  type: NotificationType
  title?: string
  message: string
  duration: number
}

export interface HistoryItem extends Notification {
  read: boolean
  timestamp: string
}

const HISTORY_LIMIT = 50
const DEFAULT_DURATION = 5000
const ERROR_DURATION = 8000

interface NotificationState {
  notifications: Notification[]
  history: HistoryItem[]
  addNotification: (notification: Partial<Notification> & { message: string }) => number
  success: (message: string, title?: string) => number
  error: (message: string, title?: string) => number
  warning: (message: string, title?: string) => number
  info: (message: string, title?: string) => number
  removeNotification: (id: number) => void
  markAsRead: (id: number) => void
  markAllAsRead: () => void
  removeHistoryItem: (id: number) => void
  clearHistory: () => void
  clearAll: () => void
}

const timers = new Map<number, ReturnType<typeof setTimeout>>()
let lastId = 0

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      history: [],

      addNotification: (notification) => {
        // Monotonic ids: Date.now() alone collides for notifications in the same ms.
        const id = Math.max(Date.now(), lastId + 1)
        lastId = id
        const created: Notification = { type: 'info', duration: DEFAULT_DURATION, ...notification, id }

        set((state) => ({
          notifications: [...state.notifications, created],
          history: [{ ...created, read: false, timestamp: new Date().toISOString() }, ...state.history].slice(0, HISTORY_LIMIT),
        }))

        if (created.duration > 0) {
          timers.set(
            id,
            setTimeout(() => {
              get().removeNotification(id)
            }, created.duration),
          )
        }
        return id
      },

      success: (message, title) => get().addNotification({ type: 'success', message, title }),
      error: (message, title) => get().addNotification({ type: 'error', message, title, duration: ERROR_DURATION }),
      warning: (message, title) => get().addNotification({ type: 'warning', message, title }),
      info: (message, title) => get().addNotification({ type: 'info', message, title }),

      removeNotification: (id) => {
        const timer = timers.get(id)
        if (timer) clearTimeout(timer)
        timers.delete(id)
        set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }))
      },
      markAsRead: (id) => set((state) => ({ history: state.history.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllAsRead: () => set((state) => ({ history: state.history.map((n) => ({ ...n, read: true })) })),
      removeHistoryItem: (id) => set((state) => ({ history: state.history.filter((n) => n.id !== id) })),
      clearHistory: () => set({ history: [] }),
      clearAll: () => {
        timers.forEach((timer) => clearTimeout(timer))
        timers.clear()
        set({ notifications: [] })
      },
    }),
    { name: 'notification-storage', partialize: (state) => ({ history: state.history }) },
  ),
)
