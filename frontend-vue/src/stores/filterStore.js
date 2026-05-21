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
    Object.assign({ heroName, dateRange, customDateFrom, customDateTo, selectedSession, buyIn, position, result }, updates)
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
      const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      const monday = startOfDay(new Date(now.setDate(diff)))
      dateFrom = formatDate(monday)
    } else if (dateRange.value === 'month') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      dateFrom = formatDate(firstOfMonth)
    } else if (dateRange.value === 'custom') {
      dateFrom = customDateFrom.value ? `${customDateFrom.value} 00:00:00` : null
      dateTo = customDateTo.value ? `${customDateTo.value} 23:59:59` : null
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
