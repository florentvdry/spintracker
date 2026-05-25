import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref([])
  const history = ref([])
  const timeouts = new Map()

  const addNotification = (notification) => {
    const id = Date.now()
    const newNotification = {
      id,
      type: 'info',
      duration: 5000,
      ...notification,
    }

    notifications.value = [...notifications.value, newNotification]
    history.value = [
      {
        ...newNotification,
        read: false,
        timestamp: new Date().toISOString()
      },
      ...history.value
    ].slice(0, 50)

    if (newNotification.duration > 0) {
      const timer = setTimeout(() => {
        removeNotification(id)
        timeouts.delete(id)
      }, newNotification.duration)
      timeouts.set(id, timer)
    }

    return id
  }

  const success = (message, title) => addNotification({ type: 'success', message, title })
  const error = (message, title) => addNotification({ type: 'error', message, title, duration: 8000 })
  const warning = (message, title) => addNotification({ type: 'warning', message, title })
  const info = (message, title) => addNotification({ type: 'info', message, title })

  const removeNotification = (id) => {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  const markAsRead = (id) => {
    history.value = history.value.map(n => n.id === id ? { ...n, read: true } : n)
  }

  const markAllAsRead = () => {
    history.value = history.value.map(n => ({ ...n, read: true }))
  }

  const removeHistoryItem = (id) => {
    history.value = history.value.filter(n => n.id !== id)
  }

  const clearHistory = () => {
    history.value = []
  }

  const clearAll = () => {
    notifications.value = []
    timeouts.forEach(t => clearTimeout(t))
    timeouts.clear()
  }

  return {
    notifications,
    history,
    addNotification,
    success,
    error,
    warning,
    info,
    removeNotification,
    markAsRead,
    markAllAsRead,
    removeHistoryItem,
    clearHistory,
    clearAll
  }
}, {
  persist: {
    key: 'notification-storage',
    pick: ['history']
  }
})
