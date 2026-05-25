import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ipcService } from '@/services/ipcService'

export const useFilterStore = defineStore('filter', () => {
  const heroName = ref(null)
  const aliases = ref([])
  const dateRange = ref('month')
  const customDateFrom = ref(null)
  const customDateTo = ref(null)
  const selectedSession = ref(null)
  const buyIn = ref('all')
  const position = ref('all')
  const result = ref('all')
  const _hasHydrated = ref(false)

  const setHasHydrated = (state) => {
    _hasHydrated.value = state
  }

  const setHeroName = (name) => {
    heroName.value = name
  }

  const setDateRange = (range) => {
    dateRange.value = range
    if (range !== 'custom' && range !== 'session') {
      customDateFrom.value = null
      customDateTo.value = null
      selectedSession.value = null
    }
  }

  const setCustomDateRange = (from, to) => {
    dateRange.value = 'custom'
    customDateFrom.value = from
    customDateTo.value = to
    selectedSession.value = null
  }

  const setSelectedSession = (session) => {
    if (session === null) {
      dateRange.value = 'all'
      selectedSession.value = null
    } else {
      dateRange.value = 'session'
      selectedSession.value = session
    }
  }

  const setBuyIn = (buyInValue) => {
    buyIn.value = buyInValue
  }

  const setFilters = (updates) => {
    if (updates.heroName !== undefined) heroName.value = updates.heroName
    if (updates.dateRange !== undefined) dateRange.value = updates.dateRange
    if (updates.customDateFrom !== undefined) customDateFrom.value = updates.customDateFrom
    if (updates.customDateTo !== undefined) customDateTo.value = updates.customDateTo
    if (updates.selectedSession !== undefined) selectedSession.value = updates.selectedSession
    if (updates.buyIn !== undefined) buyIn.value = updates.buyIn
    if (updates.position !== undefined) position.value = updates.position
    if (updates.result !== undefined) result.value = updates.result
  }

  const resetFilters = () => {
    dateRange.value = 'all'
    customDateFrom.value = null
    customDateTo.value = null
    selectedSession.value = null
    buyIn.value = 'all'
    position.value = 'all'
    result.value = 'all'
  }

  const getDateRangeParams = () => {
    let dateFrom = null
    let dateTo = null

    if (dateRange.value === 'all') return { dateFrom, dateTo }

    const now = new Date()
    const formatDate = (date) => {
      const pad = (n) => n.toString().padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    }

    const startOfDay = (date) => {
      const d = new Date(date)
      d.setHours(0, 0, 0, 0)
      return d
    }

    if (dateRange.value === 'today') {
      dateFrom = formatDate(startOfDay(now))
    } else if (dateRange.value === 'week') {
      const day = now.getDay()
      const monday = new Date(now)
      monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1))
      dateFrom = formatDate(startOfDay(monday))
    } else if (dateRange.value === 'month') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      dateFrom = formatDate(firstOfMonth)
    } else if (dateRange.value === 'custom') {
      const toDateTime = (val) => {
        if (!val) return null
        // "2026-05-25" → "2026-05-25 00:00:00"
        if (!val.includes('T')) return `${val} 00:00:00`
        // "2026-05-25T14:30" → "2026-05-25 14:30:00"
        return val.replace('T', ' ') + ':00'
      }
      dateFrom = toDateTime(customDateFrom.value)
      dateTo = toDateTime(customDateTo.value)
    } else if (dateRange.value === 'session' && selectedSession.value) {
      dateFrom = selectedSession.value.session_date
      dateTo = selectedSession.value.session_end
    }

    return { dateFrom, dateTo }
  }

  const fetchAliases = async () => {
    const res = await ipcService.getAliases()
    if (res?.success) {
      aliases.value = res.data
    }
  }

  return {
    heroName,
    aliases,
    dateRange,
    customDateFrom,
    customDateTo,
    selectedSession,
    buyIn,
    position,
    result,
    _hasHydrated,
    setHasHydrated,
    setHeroName,
    setDateRange,
    setCustomDateRange,
    setSelectedSession,
    setBuyIn,
    setFilters,
    resetFilters,
    getDateRangeParams,
    fetchAliases
  }
}, {
  persist: {
    key: 'poker-filters-storage',
    pick: ['heroName', 'dateRange', 'customDateFrom', 'customDateTo', 'buyIn', 'selectedSession'],
    onRehydrateStorage: () => {
      return (state) => {
        state.setHasHydrated(true)
      }
    }
  }
})
