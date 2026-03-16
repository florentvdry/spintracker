import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useFilterStore = defineStore('filter', () => {
  const heroName = ref('')
  const buyIn = ref('all')
  const dateRange = ref('all')
  const customDateFrom = ref(null)
  const customDateTo = ref(null)

  const dateRangeOptions = [
    { value: 'all', label: 'Toutes les dates' },
    { value: 'today', label: 'Aujourd\'hui' },
    { value: 'yesterday', label: 'Hier' },
    { value: 'week', label: 'Cette semaine' },
    { value: 'month', label: 'Ce mois' },
    { value: 'year', label: 'Cette année' },
    { value: 'custom', label: 'Personnalisé' }
  ]

  const getDateRangeParams = computed(() => {
    const now = new Date()
    let dateFrom = null
    let dateTo = null

    switch (dateRange.value) {
      case 'today':
        dateFrom = now.toISOString().split('T')[0]
        dateTo = now.toISOString().split('T')[0]
        break
      case 'yesterday':
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)
        dateFrom = yesterday.toISOString().split('T')[0]
        dateTo = yesterday.toISOString().split('T')[0]
        break
      case 'week':
        const weekStart = new Date(now)
        weekStart.setDate(weekStart.getDate() - 7)
        dateFrom = weekStart.toISOString().split('T')[0]
        break
      case 'month':
        const monthStart = new Date(now)
        monthStart.setMonth(monthStart.getMonth() - 1)
        dateFrom = monthStart.toISOString().split('T')[0]
        break
      case 'year':
        const yearStart = new Date(now)
        yearStart.setFullYear(yearStart.getFullYear() - 1)
        dateFrom = yearStart.toISOString().split('T')[0]
        break
      case 'custom':
        dateFrom = customDateFrom.value
        dateTo = customDateTo.value
        break
    }

    return { dateFrom, dateTo }
  })

  function setHeroName(name) {
    heroName.value = name
  }

  function setBuyIn(value) {
    buyIn.value = value
  }

  function setDateRange(value) {
    dateRange.value = value
  }

  function setCustomDateRange(from, to) {
    customDateFrom.value = from
    customDateTo.value = to
    dateRange.value = 'custom'
  }

  return {
    heroName,
    buyIn,
    dateRange,
    customDateFrom,
    customDateTo,
    dateRangeOptions,
    getDateRangeParams,
    setHeroName,
    setBuyIn,
    setDateRange,
    setCustomDateRange
  }
})
