<template>
  <header class="h-16 bg-dark-800 border-b border-dark-700 flex items-center justify-between px-6">
    <div class="flex items-center gap-4">
      <input
        v-model="heroName"
        type="text"
        placeholder="Nom du héros..."
        class="bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-64"
        @change="onHeroChange"
      />
      <select
        v-model="dateRange"
        class="bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary-500"
        @change="onFilterChange"
      >
        <option v-for="option in dateRangeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
    <div class="flex items-center gap-4">
      <button
        @click="refresh"
        class="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors"
        title="Actualiser"
      >
        <RefreshCw class="w-5 h-5" :class="{ 'animate-spin': isLoading }" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { useFilterStore } from '../stores/filter'
import { useAppStore } from '../stores/app'

const filterStore = useFilterStore()
const appStore = useAppStore()

const heroName = ref(filterStore.heroName)
const dateRange = ref(filterStore.dateRange)
const dateRangeOptions = filterStore.dateRangeOptions

const isLoading = computed(() => appStore.isLoading)

watch(() => filterStore.heroName, (newVal) => {
  heroName.value = newVal
})

watch(() => filterStore.dateRange, (newVal) => {
  dateRange.value = newVal
})

function onHeroChange() {
  filterStore.setHeroName(heroName.value)
  refresh()
}

function onFilterChange() {
  filterStore.setDateRange(dateRange.value)
  refresh()
}

function refresh() {
  const { dateFrom, dateTo } = filterStore.getDateRangeParams
  appStore.refreshAll(
    filterStore.heroName,
    dateFrom,
    dateTo,
    filterStore.buyIn === 'all' ? null : parseFloat(filterStore.buyIn)
  )
}
</script>
