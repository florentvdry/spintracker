<template>
  <div class="h-[calc(100vh-180px)] flex flex-col">
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
      <div>
        <h1 class="text-lg font-semibold text-gray-100">{{ $t('charts.title') }}</h1>
        <p class="text-gray-400 mt-1">{{ $t('charts.subtitle') }}</p>
      </div>
      
      <div class="flex flex-wrap items-center gap-4">
        <select
          v-model="chartPosition"
          class="bg-[#14171d] text-white px-4 py-2 rounded-lg border border-[#374151] focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
        >
          <option v-for="pos in positions" :key="pos.value" :value="pos.value">
            {{ $t(`charts.positions.${pos.value}`, pos.label) }}
          </option>
        </select>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3 mb-4">
      <button
        v-for="(color, key) in lineColors"
        :key="key"
        @click="toggleLine(key)"
        :class="['flex items-center gap-1.5 text-xs transition-opacity', !visibleLines[key] && 'opacity-40']"
      >
        <div class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: color }"></div>
        <span class="text-gray-300">{{ lineLabels[key] }}</span>
      </button>
    </div>

    <div 
      class="flex-1 w-full relative min-h-0" 
      ref="chartContainer"
      @contextmenu.prevent="handleResetZoom"
    >
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>

      <div v-show="!isLoading && !heroName" class="flex flex-col items-center justify-center h-full text-gray-400">
        <BarChart2 class="w-16 h-16 mb-4" />
        <p class="text-lg">{{ $t('dashboard.no_hero') }}</p>
        <p class="text-sm">{{ $t('dashboard.select_hero_prompt') }}</p>
      </div>

      <div v-show="!isLoading && heroName && (!data || data.length === 0)" class="flex flex-col items-center justify-center h-full text-gray-400">
        <BarChart2 class="w-16 h-16 mb-4" />
        <p class="text-lg">{{ $t('dashboard.no_data') }}</p>
        <p class="text-sm">{{ $t('dashboard.no_data_chart') }}</p>
      </div>

      <div v-show="!isLoading && heroName && data && data.length > 0" ref="chartRef" class="w-full h-full"></div>
      
      <div 
        v-if="finalStats"
        class="absolute bg-[#14171d]/95 backdrop-blur-sm border border-[#374151] rounded-lg p-3 shadow-xl select-none"
        :style="{ left: boxPosition.x + 'px', top: boxPosition.y + 'px', cursor: isDragging ? 'grabbing' : 'grab', minWidth: '200px' }"
        @mousedown="handleMouseDown"
      >
        <div class="flex items-center justify-between mb-2 border-b border-[#374151] pb-2">
          <span class="text-xs font-medium text-gray-400 uppercase">Stats</span>
          <GripHorizontal class="w-4 h-4 text-gray-500" />
        </div>
        
        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-xs text-gray-400">Tournaments</span>
            <span class="text-sm font-mono font-medium text-white">
              {{ chartPosition === 'all' ? globalStats?.total_tournaments : stats?.total_tournaments }}
            </span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-xs text-gray-400">CEV</span>
            <span :class="['text-sm font-mono font-medium', finalStats.cev >= 0 ? 'text-profit-positive' : 'text-profit-negative']">
              {{ finalStats.cev >= 0 ? '+' : '' }}{{ finalStats.cev.toFixed(2) }}
            </span>
          </div>
          
          <div v-if="globalStats && globalStats.cev_by_position" class="mt-3 pt-2 border-t border-[#374151]">
            <div class="grid grid-cols-2 gap-x-3 gap-y-1">
              <div>
                <p class="text-[9px] text-gray-500">Heads-Up</p>
                <PositionStat label="SB" :value="getPosValue('HU_SB')" :isSelected="chartPosition === 'HU_SB'" />
                <PositionStat label="BB" :value="getPosValue('HU_BB')" :isSelected="chartPosition === 'HU_BB'" />
              </div>
              <div>
                <p class="text-[9px] text-gray-500">3-Way</p>
                <PositionStat label="BTN" :value="getPosValue('3W_BTN')" :isSelected="chartPosition === '3W_BTN'" />
                <PositionStat label="SB" :value="getPosValue('3W_SB')" :isSelected="chartPosition === '3W_SB'" />
                <PositionStat label="BB" :value="getPosValue('3W_BB')" :isSelected="chartPosition === '3W_BB'" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import * as echarts from 'echarts'
import { BarChart2, GripHorizontal } from 'lucide-vue-next'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import PositionStat from './components/PositionStat.vue'

const { t } = useI18n()
const filterStore = useFilterStore()

const heroName = computed(() => filterStore.heroName)
const buyIn = computed(() => filterStore.buyIn)

const chartRef = ref(null)
const chartContainer = ref(null)
let chartInstance = null

const chartPosition = ref('all')
const stats = ref(null)
const globalStats = ref(null)
const data = ref([])
const isLoading = ref(true)
const isZoomed = ref(false)
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const boxPosition = ref({ x: 80, y: 280 })

const positions = [
  { value: 'all', label: 'All Positions' },
  { value: 'HU_SB', label: 'HU SB' },
  { value: 'HU_BB', label: 'HU BB' },
  { value: '3W_BTN', label: '3W BTN' },
  { value: '3W_SB', label: '3W SB' },
  { value: '3W_BB', label: '3W BB' }
]

const lineColors = {
  chipsWon: '#34c27a',
  netExpected: '#eab308',
  wonWithShowdown: '#3b82f6',
  wonWithoutShowdown: '#e5594f'
}

const lineLabels = computed(() => ({
  chipsWon: t('common.chips_won', 'Chips Won'),
  netExpected: t('hand_history.table.ev_chips', 'EV Chips'),
  wonWithShowdown: t('common.showdown_winning', 'Showdown Won'),
  wonWithoutShowdown: t('common.non_showdown_winning', 'Non-Showdown Won')
}))

const visibleLines = ref({
  chipsWon: true,
  netExpected: true,
  wonWithShowdown: true,
  wonWithoutShowdown: true
})

const toggleLine = (key) => {
  visibleLines.value[key] = !visibleLines.value[key]
}

const loadChartData = async () => {
  if (!heroName.value) {
    data.value = []
    isLoading.value = false
    return
  }

  isLoading.value = true
  try {
    const { dateFrom, dateTo } = filterStore.getDateRangeParams()
    const buyInParam = buyIn.value === 'all' ? null : Number(buyIn.value)
    const positionParam = chartPosition.value === 'all' ? null : chartPosition.value
    const result = await ipcService.getWinrateChartData({ 
      dateFrom, 
      dateTo, 
      heroName: heroName.value, 
      buyIn: buyInParam,
      position: positionParam
    })
    
    if (result && result.success && result.data) {
      const raw = result.data
      
      if (Array.isArray(raw) && raw.length > 0) {
        const groupedData = new Map()
        
        raw.forEach(item => {
          const label = item.date || 'Unknown'
          if (!groupedData.has(label)) {
            groupedData.set(label, {
              label,
              lastProfit: 0,
              lastCumulative: 0,
              lastShowdown: 0,
              lastNoShowdown: 0
            })
          }
          const entry = groupedData.get(label)
          entry.lastProfit = item.profit ?? item.realWin ?? 0
          entry.lastCumulative = item.cumulative ?? item.theoricalWin ?? 0
          entry.lastShowdown = item.chips_won_showdown ?? item.chipsWonShowdown ?? 0
          entry.lastNoShowdown = item.chips_won_no_showdown ?? item.chipsWonNoShowdown ?? 0
        })
        
        data.value = Array.from(groupedData.values()).map((item, index) => ({
          time: index + 1,
          label: item.label,
          chipsWon: item.lastProfit,
          netExpected: item.lastCumulative,
          wonWithShowdown: item.lastShowdown,
          wonWithoutShowdown: item.lastNoShowdown
        }))
      } else {
        data.value = []
      }
    } else {
      data.value = []
    }
  } catch (error) {
    console.error('Failed to load chart data:', error)
    data.value = []
  } finally {
    isLoading.value = false
  }
}

const loadStats = async () => {
  if (!heroName.value) {
    stats.value = null
    return
  }

  try {
    const { dateFrom, dateTo } = filterStore.getDateRangeParams()
    const buyInParam = buyIn.value === 'all' ? null : Number(buyIn.value)
    const positionParam = chartPosition.value === 'all' ? null : chartPosition.value
    const result = await ipcService.getDashboardStats(heroName.value, dateFrom, dateTo, buyInParam, positionParam)
    if (result && result.success && result.data) {
      stats.value = result.data
    } else {
      stats.value = null
    }
  } catch (error) {
    console.error('Failed to load stats:', error)
    stats.value = null
  }
}

const loadGlobalStats = async () => {
  if (!heroName.value) {
    globalStats.value = null
    return
  }

  try {
    const { dateFrom, dateTo } = filterStore.getDateRangeParams()
    const buyInParam = buyIn.value === 'all' ? null : Number(buyIn.value)
    const result = await ipcService.getDashboardStats(heroName.value, dateFrom, dateTo, buyInParam, null)
    if (result && result.success && result.data) {
      globalStats.value = result.data
    }
  } catch (error) {
    console.error('Failed to load global stats:', error)
  }
}

const finalStats = computed(() => {
  const statsToUse = chartPosition.value === 'all' ? globalStats.value : stats.value
  if (!statsToUse) return null
  return {
    cev: statsToUse.avg_chips_ev || 0,
    chipsWon: statsToUse.total_ev || 0
  }
})

const getPosValue = (positionKey) => {
  if (chartPosition.value === 'all') {
    const totalTournaments = globalStats.value?.total_tournaments || 1
    const value = globalStats.value?.cev_by_position?.[positionKey] || 0
    return (value / totalTournaments).toFixed(2)
  } else {
    if (positionKey === chartPosition.value) {
      const totalTournaments = globalStats.value?.tournaments_by_position?.[positionKey] || 1
      const value = globalStats.value?.cev_by_position?.[positionKey] || 0
      return (value / totalTournaments).toFixed(2)
    }
    return '0.00'
  }
}

const getOption = computed(() => {
  if (!data.value.length) return {}

  const seriesList = []
  
  if (visibleLines.value.chipsWon) {
    seriesList.push({
      name: lineLabels.value.chipsWon,
      type: 'line',
      data: data.value.map(d => d.chipsWon),
      itemStyle: { color: lineColors.chipsWon },
      showSymbol: false,
      lineStyle: { width: 2 },
      emphasis: { focus: 'series' },
      large: true
    })
  }

  if (visibleLines.value.netExpected) {
    seriesList.push({
      name: lineLabels.value.netExpected,
      type: 'line',
      data: data.value.map(d => d.netExpected),
      itemStyle: { color: lineColors.netExpected },
      showSymbol: false,
      lineStyle: { width: 2 },
      emphasis: { focus: 'series' },
      large: true
    })
  }

  if (visibleLines.value.wonWithShowdown) {
    seriesList.push({
      name: lineLabels.value.wonWithShowdown,
      type: 'line',
      data: data.value.map(d => d.wonWithShowdown),
      itemStyle: { color: lineColors.wonWithShowdown },
      showSymbol: false,
      lineStyle: { width: 2 },
      emphasis: { focus: 'series' },
      large: true
    })
  }

  if (visibleLines.value.wonWithoutShowdown) {
    seriesList.push({
      name: lineLabels.value.wonWithoutShowdown,
      type: 'line',
      data: data.value.map(d => d.wonWithoutShowdown),
      itemStyle: { color: lineColors.wonWithoutShowdown },
      showSymbol: false,
      lineStyle: { width: 2 },
      emphasis: { focus: 'series' },
      large: true
    })
  }

  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#9ca3af' }
    },
    brush: {
      xAxisIndex: 0,
      brushLink: 'all',
      outOfBrush: { colorAlpha: 0.1 }
    },
    dataZoom: [
      { type: 'slider', show: false, xAxisIndex: 0 },
      { type: 'inside', xAxisIndex: 0, disabled: true }
    ],
    grid: { top: 30, right: 30, bottom: 30, left: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.value.map(d => d.label),
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#4b5563' } },
      axisLabel: { color: '#9ca3af', showMaxLabel: true },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9ca3af' },
      splitLine: { show: true, lineStyle: { color: '#242936' } }
    },
    series: seriesList
  }
})

const initChart = () => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value, 'dark')
    updateChart()
  }
}

const updateChart = () => {
  if (chartInstance && getOption.value) {
    chartInstance.setOption(getOption.value)
    
    chartInstance.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: { brushType: 'lineX', brushMode: 'single' }
    })
  }
}

const handleBrushEnd = (params) => {
  if (params.areas && params.areas.length > 0) {
    const area = params.areas[0]
    const coordRange = area.coordRange
    
    if (coordRange && chartInstance) {
      chartInstance.dispatchAction({
        type: 'dataZoom',
        startValue: coordRange[0],
        endValue: coordRange[1]
      })
      chartInstance.dispatchAction({ type: 'brush', areas: [] })
      isZoomed.value = true
    }
  }
}

const handleResetZoom = () => {
  if (chartInstance) {
    chartInstance.dispatchAction({ type: 'restore' })
  }
  isZoomed.value = false
}

const handleMouseDown = (e) => {
  isDragging.value = true
  const rect = e.currentTarget.getBoundingClientRect()
  dragOffset.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

const handleMouseMove = (e) => {
  if (!isDragging.value || !chartContainer.value) return
  const rect = chartContainer.value.getBoundingClientRect()
  const newX = e.clientX - rect.left - dragOffset.value.x
  const newY = e.clientY - rect.top - dragOffset.value.y
  boxPosition.value = {
    x: Math.max(0, Math.min(newX, rect.width - 250)),
    y: Math.max(0, Math.min(newY, rect.height - 150))
  }
}

const handleMouseUp = () => {
  isDragging.value = false
}

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
  }
}

watch([heroName, buyIn, chartPosition, () => filterStore.dateRange, () => filterStore.selectedSession], () => {
  loadChartData()
  loadStats()
})

watch(data, () => {
  updateChart()
})

onMounted(async () => {
  await loadChartData()
  await loadStats()
  await loadGlobalStats()
  initChart()
  
  if (chartInstance) {
    chartInstance.on('brushEnd', handleBrushEnd)
    chartInstance.on('restore', () => { isZoomed.value = false })
    window.addEventListener('resize', handleResize)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
  }
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.off('brushEnd', handleBrushEnd)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('mouseup', handleMouseUp)
    window.removeEventListener('mousemove', handleMouseMove)
    chartInstance.dispose()
  }
})
</script>
