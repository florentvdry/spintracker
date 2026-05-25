<template>
  <div class="h-full flex flex-col p-6 space-y-6 overflow-hidden bg-dark-400">
    <div class="flex items-center justify-between bg-dark-300 p-4 rounded-xl border border-white/5 shadow-lg">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center border border-primary-500/20 shadow-inner">
          <Layers class="w-6 h-6 text-primary-400" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-white tracking-tight">{{ $t('range_analysis.title') }}</h1>
          <p class="text-xs text-gray-500">{{ $t('range_analysis.subtitle') }}</p>
        </div>
      </div>
      <div class="flex gap-3">
        <button 
          @click="loadConfig"
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-400 border border-white/5 text-gray-400 hover:text-white hover:bg-dark-500 transition-all text-xs font-bold"
        >
          <Upload class="w-4 h-4" /> {{ $t('range_analysis.load_preset') }}
        </button>
        <button 
          @click="saveConfig"
          class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/20 transition-all text-xs font-bold"
        >
          <Save class="w-4 h-4" /> {{ $t('range_analysis.save_config') }}
        </button>
      </div>
    </div>

    <div class="flex-1 flex flex-col gap-6 min-h-0">
      <SituationSelector :filters="combinedFilters" @change="handleFilterChange" />

      <div class="flex items-center gap-4 bg-dark-300/50 p-3 rounded-lg border border-white/5">
        <div class="flex items-center gap-2">
          <Users class="w-4 h-4 text-gray-400" />
          <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">{{ $t('range_analysis.opponent_type') }}:</span>
        </div>
        <div class="flex gap-2">
          <button
            v-for="type in opponentTypes"
            :key="type.id"
            @click="opponentType = type.id"
            :class="[
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
              opponentType === type.id
                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20'
                : 'bg-dark-400 text-gray-400 hover:text-white hover:bg-dark-500'
            ]"
          >
            <component :is="type.icon" :class="['w-3.5 h-3.5', type.id === 'reg' && 'text-yellow-400', type.id === 'fish' && 'text-blue-400']" />
            {{ type.label }}
          </button>
        </div>
      </div>

      <div class="flex-1 flex gap-6 min-h-0">
        <div class="flex-1 bg-dark-200 rounded-2xl shadow-2xl border border-white/5 flex flex-col min-h-0 overflow-hidden relative">
          <div class="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <BarChart3 class="w-32 h-32" />
          </div>
          
          <div class="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-dark-300/30">
            <div class="flex items-center gap-2">
              <Filter class="w-4 h-4 text-primary-400" />
              <h2 class="text-sm font-bold text-gray-200 uppercase tracking-widest">{{ $t('range_analysis.matrix_title') }}</h2>
            </div>
            <div class="flex gap-4">
              <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#ef4444] shadow-sm shadow-red-500/50"></span><span class="text-[10px] font-bold text-gray-400 uppercase">2-3bb</span></div>
              <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#f97316] shadow-sm shadow-orange-500/50"></span><span class="text-[10px] font-bold text-gray-400 uppercase">4bb+</span></div>
              <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#ff9800] shadow-sm shadow-orange-500/50"></span><span class="text-[10px] font-bold text-gray-400 uppercase">{{ $t('actions.bet') }}</span></div>
              <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#4caf50] shadow-sm shadow-green-500/50"></span><span class="text-[10px] font-bold text-gray-400 uppercase">{{ $t('actions.call') }}</span></div>
              <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#9e9e9e] shadow-sm shadow-gray-500/50"></span><span class="text-[10px] font-bold text-gray-400 uppercase">{{ $t('actions.check') }}</span></div>
              <div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#b71c1c] shadow-sm shadow-red-900/50"></span><span class="text-[10px] font-bold text-gray-400 uppercase">{{ $t('actions.allin') }}</span></div>
            </div>
          </div>

          <div class="flex-1 p-6 overflow-auto flex items-center justify-center custom-scrollbar">
            <div v-if="rangeLoading" class="flex flex-col items-center gap-4 text-gray-500 animate-pulse">
              <div class="w-12 h-12 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div>
              <span class="text-sm font-medium tracking-wide">{{ $t('range_analysis.loading') }}</span>
            </div>
            <RangeGrid 
              v-else
              :data="rangeData" 
              size="lg" 
              @cell-click="handleCellClick"
              :selected-hand="selectedRangeHand"
              class="shadow-2xl border border-white/10"
            />
          </div>
        </div>
        
        <div class="w-[450px] flex flex-col gap-6 min-h-0">
          <div class="bg-dark-200 rounded-2xl shadow-xl border border-white/5 p-6 relative overflow-hidden flex-shrink-0">
            <div v-if="selectedRangeHand" class="space-y-4">
              <div class="flex items-end justify-between border-b border-white/5 pb-4">
                <div class="flex flex-col">
                  <span class="text-[10px] font-bold text-primary-400 uppercase tracking-widest mb-1">{{ $t('range_analysis.selected_hand') }}</span>
                  <div class="text-6xl font-black font-mono text-white leading-none">
                    {{ selectedRangeHand }}
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{{ $t('range_analysis.occurrences') }}</div>
                  <div class="text-3xl font-black text-white leading-none">
                    {{ selectedRangeStats?.TotalCount || 0 }}
                  </div>
                </div>
              </div>
              
              <div class="grid grid-cols-2 gap-3">
                <div class="bg-dark-300/50 p-4 rounded-xl border border-white/5">
                  <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{{ $t('range_analysis.total_profit') }}</div>
                  <div :class="['text-xl font-black', (selectedRangeStats?.TotalProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400']">
                    {{ (selectedRangeStats?.TotalProfit || 0).toFixed(0) }} <span class="text-[10px] opacity-50">{{ $t('common.chips') }}</span>
                  </div>
                </div>
                <div class="bg-dark-300/50 p-4 rounded-xl border border-white/5">
                  <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{{ $t('range_analysis.ev_realized') }}</div>
                  <div :class="['text-xl font-black', (selectedRangeStats?.TotalEv || 0) >= 0 ? 'text-yellow-400' : 'text-orange-500']">
                    {{ (selectedRangeStats?.TotalEv || 0).toFixed(1) }}
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="flex flex-col items-center justify-center py-8 text-gray-500 gap-3">
              <Info class="w-8 h-8 opacity-20" />
              <p class="text-sm font-medium text-center" v-html="$t('range_analysis.select_prompt').replace('\n', '<br/>')"></p>
            </div>
          </div>

          <div class="flex-1 bg-dark-200 rounded-2xl shadow-xl border border-white/5 flex flex-col min-h-0 overflow-hidden">
            <div class="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-dark-300/30">
              <div class="flex items-center gap-2">
                <BarChart3 class="w-4 h-4 text-primary-400" />
                <h2 class="text-sm font-bold text-gray-200 uppercase tracking-widest">{{ $t('range_analysis.distributions') }}</h2>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              <template v-if="selectedRangeHand">
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{{ $t('range_analysis.frequencies') }}</span>
                  </div>
                  <div class="grid grid-cols-3 gap-2">
                    <button
                      v-for="[action, count] in sortedActions"
                      :key="action"
                      @click="toggleActionFilter(action)"
                      :class="[
                        'flex flex-col p-3 rounded-xl border transition-all relative overflow-hidden group',
                        selectedActionFilter === action ? 'ring-2 ring-white border-transparent' : 'border-transparent'
                      ]"
                      :style="{ backgroundColor: (ACTION_COLORS[action] || ACTION_COLORS.None) + '22' }"
                    >
                      <div class="absolute top-0 left-0 w-1 h-full" :style="{ backgroundColor: ACTION_COLORS[action] || ACTION_COLORS.None }"></div>
                      <span class="text-[10px] font-bold uppercase opacity-60 mb-1">{{ action }}</span>
                      <span class="text-lg font-black text-white leading-none">{{ getActionPercent(count) }}%</span>
                      <span class="text-[9px] mt-1 opacity-40">{{ count }} {{ $t('common.hands') }}</span>
                    </button>
                  </div>
                </div>

                <div class="space-y-3 pt-4 border-t border-white/5">
                  <div class="flex justify-between items-center">
                    <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{{ $t('range_analysis.history') }}</span>
                    <button 
                      @click="handleReplayFiltered"
                      class="text-[10px] font-bold text-primary-400 hover:text-primary-300 flex items-center gap-1.5 uppercase transition-colors"
                    >
                      <Play class="w-3 h-3" /> {{ $t('range_analysis.replay_filtered') }}
                    </button>
                  </div>
                  <div class="space-y-2">
                    <div 
                      v-for="(hand, idx) in filteredHands" 
                      :key="handId(hand, idx)" 
                      @click="handleReplayHand(hand)"
                      class="flex items-center gap-3 p-3 bg-dark-400/50 rounded-xl border border-white/5 hover:border-white/10 hover:bg-dark-300 transition-all cursor-pointer group"
                    >
                      <div class="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center text-[10px] font-bold text-gray-500 group-hover:text-primary-400 transition-colors">
                        {{ idx + 1 }}
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-0.5">
                          <span :class="[
                            'text-[10px] font-black uppercase tracking-tighter',
                            getActionClass(hand.action || hand.Action)
                          ]">
                            {{ hand.action || hand.Action }}
                          </span>
                          <span class="text-[9px] text-gray-600 font-mono">
                            {{ formatHandDate(hand.date || hand.Date) }}
                          </span>
                        </div>
                        <div class="flex items-center gap-2">
                          <span :class="['text-xs font-bold', (hand.profit !== undefined ? hand.profit : hand.Profit || 0) >= 0 ? 'text-green-400' : 'text-red-400']">
                            {{ ((hand.profit !== undefined ? hand.profit : hand.Profit || 0) >= 0 ? '+' : '') }}{{ (hand.profit !== undefined ? hand.profit : hand.Profit || 0).toFixed(0) }} <span class="text-[9px] opacity-60">{{ $t('common.chips') }}</span>
                          </span>
                          <div class="w-1 h-1 rounded-full bg-white/5"></div>
                          <div class="flex items-center gap-1">
                            <span class="text-[9px] text-gray-500 font-bold uppercase">EV</span>
                            <span :class="['text-[10px] font-bold', ((hand.ev !== undefined ? hand.ev : hand.Ev || 0) >= 0 ? 'text-yellow-500/80' : 'text-orange-500/80')]">
                              {{ hand.ev !== undefined && hand.ev !== null ? (hand.ev || 0).toFixed(1) : '—' }}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight class="w-4 h-4 text-gray-600 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </template>
              <div v-else class="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                <Layers class="w-12 h-12" />
                <p class="text-xs text-center font-medium" v-html="$t('range_analysis.select_prompt').replace('\n', '<br/>')"></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Save, Upload, Layers, Info, Filter, BarChart3, ChevronRight, Play, Crown, Fish, Users } from 'lucide-vue-next'
import { usePlayersStore } from '@/stores/playersStore'
import { useReplayerStore } from '@/stores/replayerStore'
import { useFilterStore } from '@/stores/filterStore'
import { ipcService } from '@/services/ipcService'
import SituationSelector from './components/SituationSelector.vue'
import RangeGrid from '@/components/charts/RangeGrid.vue'

const { t } = useI18n()
const playersStore = usePlayersStore()
const replayerStore = useReplayerStore()
const filterStore = useFilterStore()

const heroName = computed(() => filterStore.heroName)
const dateRange = computed(() => filterStore.dateRange)

const localFilters = ref({
  Situation: 'Preflop',
  Action: '',
  PlayerCount: 3,
  MinStackBB: null,
  MaxStackBB: null,
  Positions: [],
  ActionSequence: [],
  SituationId: ''
})

const opponentType = ref('all')

const ACTION_COLORS = {
  AllIn: '#b71c1c',
  Raise: '#f44336',
  Raise2_3BB: '#ef4444',
  Raise4BB: '#f97316',
  Bet: '#ff9800',
  Call: '#4caf50',
  Check: '#9e9e9e',
  Fold: '#2196f3',
  None: '#1e293b'
}

const opponentTypes = computed(() => [
  { id: 'all', label: t('range_analysis.all_opponents'), icon: Users },
  { id: 'reg', label: t('range_analysis.regs_only'), icon: Crown },
  { id: 'fish', label: t('range_analysis.fish_only'), icon: Fish }
])

const combinedFilters = computed(() => {
  const { dateFrom, dateTo } = filterStore.getDateRangeParams()
  return {
    ...localFilters.value,
    HeroName: localFilters.value.HeroName !== undefined ? localFilters.value.HeroName : heroName.value,
    DateFrom: dateFrom,
    DateTo: dateTo,
    OpponentType: opponentType.value
  }
})

const rangeData = ref({})
const rangeLoading = ref(false)
const selectedRangeHand = ref(null)
const selectedRangeStats = ref(null)
const selectedActionFilter = ref(null)

const handleFilterChange = (updates) => {
  localFilters.value = { ...localFilters.value, ...updates }
}

const loadRangeData = async () => {
  rangeLoading.value = true
  selectedRangeHand.value = null
  selectedRangeStats.value = null
  try {
    const response = await ipcService.getRangeBreakdown(combinedFilters.value)
    if (response.success) {
      rangeData.value = response.data || {}
    }
  } catch (err) {
    console.error('Failed to fetch range breakdown', err)
  } finally {
    rangeLoading.value = false
  }
}

const handleCellClick = (hand, stats) => {
  selectedRangeHand.value = hand
  selectedRangeStats.value = stats
  selectedActionFilter.value = null
}

const sortedActions = computed(() => {
  if (!selectedRangeStats.value?.Actions) return []
  return Object.entries(selectedRangeStats.value.Actions).sort((a, b) => b[1] - a[1])
})

const getActionPercent = (count) => {
  const total = selectedRangeStats.value?.TotalCount || 0
  return total > 0 ? ((count / total) * 100).toFixed(0) : 0
}

const toggleActionFilter = (action) => {
  selectedActionFilter.value = selectedActionFilter.value === action ? null : action
}

const filteredHands = computed(() => {
  if (!selectedRangeStats.value?.Hands) return []
  if (!selectedActionFilter.value) return selectedRangeStats.value.Hands
  return selectedRangeStats.value.Hands.filter(h => {
    const action = h.action || h.Action
    const normAction = action?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
    const normFilter = selectedActionFilter.value.toLowerCase().replace(/[^a-z0-9]/g, '')
    return normAction.includes(normFilter) || normFilter.includes(normAction)
  })
})

const handId = (hand, idx) => (hand.id || hand.Id || idx)

const getActionClass = (action) => {
  if (action === 'Raise' || action === 'AllIn') return 'text-red-400'
  if (action === 'Call') return 'text-green-400'
  return 'text-blue-400'
}

const formatHandDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleDateString()
}

const handleReplayHand = async (hand) => {
  const id = hand.id || hand.Id
  if (id) {
    replayerStore.openSingleHandReplayer(id, heroName.value)
  }
}

const handleReplayFiltered = async () => {
  const list = selectedRangeStats.value?.Hands || []
  const filtered = selectedActionFilter.value
    ? list.filter(h => handMatchesAction(h, selectedActionFilter.value))
    : list
  const handIds = filtered.map(h => h.id || h.Id).filter(Boolean)
  if (handIds.length > 0) {
    replayerStore.openReplayerWindowForQueue(handIds, 0, heroName.value)
  }
}
const handMatchesAction = (hand, action) => {
  if (!action) return true
  const handAction = hand.action || hand.Action || ''
  const normAction = handAction.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normFilter = action.toLowerCase().replace(/[^a-z0-9]/g, '')
  return normAction.includes(normFilter) || normFilter.includes(normAction)
}

const saveConfig = () => {
  localStorage.setItem('range_research_config_v2', JSON.stringify(localFilters.value))
  alert(t('range_analysis.config_saved'))
}

const loadConfig = () => {
  const saved = localStorage.getItem('range_research_config_v2')
  if (saved) {
    localFilters.value = JSON.parse(saved)
    alert(t('range_analysis.config_loaded'))
  }
}

onMounted(() => {
  playersStore.loadPlayers({ limit: 1000 })
  if (heroName.value) {
    loadRangeData()
  }
})

let rangeFilterTimeout = null
watch(combinedFilters, () => {
  if (rangeFilterTimeout) clearTimeout(rangeFilterTimeout)
  rangeFilterTimeout = setTimeout(() => {
    loadRangeData()
  }, 300)
}, { deep: true })

onUnmounted(() => {
  if (rangeFilterTimeout) clearTimeout(rangeFilterTimeout)
})
</script>
