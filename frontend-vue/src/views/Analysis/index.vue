<template>
  <div class="h-full flex flex-col p-6 space-y-6 overflow-hidden">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold gradient-text">
        {{ $t('analysis.title') }}
      </h1>
      <div class="flex gap-2">
        <div class="flex bg-dark-300 rounded-lg p-1 mr-4 border border-dark-100">
          <button
            @click="activeTab = 'stats'"
            :class="['px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all', activeTab === 'stats' ? 'bg-primary-500 text-white shadow' : 'text-gray-400 hover:text-white']"
          >
            <Grid class="w-4 h-4" />
            Stats
          </button>
          <button
            @click="activeTab = 'hands'"
            :class="['px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all', activeTab === 'hands' ? 'bg-primary-500 text-white shadow' : 'text-gray-400 hover:text-white']"
          >
            <List class="w-4 h-4" />
            {{ $t('analysis.tabs.hands') }}
          </button>
        </div>

        <button @click="saveConfig" class="btn btn-secondary flex items-center gap-2">
          <Save class="w-4 h-4" />
        </button>
        <button @click="loadConfig" class="btn btn-secondary flex items-center gap-2">
          <Upload class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div class="flex-1 flex gap-6 min-h-0">
      <div class="w-80 flex-shrink-0 overflow-y-auto custom-scrollbar">
        <AnalysisFilters :filters="combinedFilters" @change="handleFilterChange" />
      </div>

      <div class="flex-1 overflow-hidden pr-2 flex flex-col">
        <div v-if="activeTab === 'stats'" class="h-full flex items-center justify-center text-gray-400">
          <div class="text-center">
            <Grid class="w-16 h-16 mb-4 opacity-50" />
            <p>{{ $t('analysis.coming_soon') }}</p>
          </div>
        </div>
        <div v-else-if="activeTab === 'hands'" class="h-full flex items-center justify-center text-gray-400">
          <div class="text-center">
            <List class="w-16 h-16 mb-4 opacity-50" />
            <p>{{ $t('analysis.coming_soon') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Save, Upload, List, Grid } from 'lucide-vue-next'
import { usePlayersStore } from '@/stores/playersStore'
import { useFilterStore } from '@/stores/filterStore'
import { ipcService } from '@/services/ipcService'
import AnalysisFilters from './components/AnalysisFilters.vue'

const { t } = useI18n()
const playersStore = usePlayersStore()
const filterStore = useFilterStore()

const heroName = computed(() => filterStore.heroName)
const dateRange = computed(() => filterStore.dateRange)

const activeTab = ref('stats')

const localFilters = ref({
  Situation: '',
  Action: '',
  PlayerCount: null,
  MinStackBB: null,
  MaxStackBB: null,
  Positions: [],
  PreflopBtnAction: '',
  PreflopSbAction: '',
  PreflopBbAction: '',
  FlopBtnAction: '',
  FlopSbAction: '',
  FlopBbAction: '',
  TurnBtnAction: '',
  TurnSbAction: '',
  TurnBbAction: '',
  RiverBtnAction: '',
  RiverSbAction: '',
  RiverBbAction: ''
})

const combinedFilters = computed(() => {
  const { dateFrom, dateTo } = filterStore.getDateRangeParams()
  return {
    HeroName: heroName.value,
    DateFrom: dateFrom,
    DateTo: dateTo,
    ...localFilters.value
  }
})

const handleFilterChange = (updates) => {
  localFilters.value = { ...localFilters.value, ...updates }
}

const saveConfig = () => {
  localStorage.setItem('analysis_config_v2', JSON.stringify(localFilters.value))
  alert(t('analysis.config_saved'))
}

const loadConfig = () => {
  const saved = localStorage.getItem('analysis_config_v2')
  if (saved) {
    localFilters.value = JSON.parse(saved)
    alert(t('analysis.config_loaded'))
  }
}

onMounted(() => {
  playersStore.loadPlayers({ limit: 1000 })
})
</script>
