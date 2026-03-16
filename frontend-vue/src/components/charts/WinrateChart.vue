<template>
  <div>
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
      <div class="flex bg-[#1e2533] p-1 rounded-lg">
        <button
          @click="chartMode = 'chips'"
          :class="[
            'px-4 py-1.5 text-xs font-medium rounded-md transition-all',
            chartMode === 'chips' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
          ]"
        >
          CEV (Chips)
        </button>
        <button
          @click="chartMode = 'euro'"
          :class="[
            'px-4 py-1.5 text-xs font-medium rounded-md transition-all',
            chartMode === 'euro' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
          ]"
        >
          Euros (€)
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-3">
        <template v-if="chartMode === 'chips'">
          <button
            v-for="(color, key) in lineColors"
            :key="key"
            @click="toggleLine(key)"
            :class="[
              'flex items-center gap-1.5 text-xs transition-opacity',
              !visibleLines[key] && 'opacity-40'
            ]"
          >
            <div class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: color }" />
            <span class="text-gray-300">{{ lineLabels[key] }}</span>
          </button>
        </template>
        <template v-else>
          <button
            @click="toggleLine('euroProfit')"
            :class="[
              'flex items-center gap-1.5 text-xs transition-opacity',
              !visibleLines.euroProfit && 'opacity-40'
            ]"
          >
            <div class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: lineColors.euroProfit }" />
            <span class="text-gray-300">{{ lineLabels.euroProfit }}</span>
          </button>
        </template>
      </div>
    </div>

    <div v-if="isLoading" class="flex items-center justify-center h-[500px]">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    </div>

    <div v-else-if="!data || data.length === 0" class="flex flex-col items-center justify-center h-[500px] text-gray-400">
      <p class="mb-2">{{ $t('dashboard.no_data_chart') }}</p>
    </div>

    <div v-else ref="chartContainer" class="h-[500px] w-full"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { useAppStore } from '@/stores/appStore'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const chartContainer = ref(null)
let chartInstance = null

const filterStore = useFilterStore()
const appStore = useAppStore()

const heroName = computed(() => filterStore.heroName)
const buyIn = computed(() => filterStore.buyIn)
const dateRange = computed(() => filterStore.dateRange)
const lastUpdate = computed(() => appStore.lastUpdate)

const chartMode = ref('chips')
const isLoading = ref(true)
const data = ref([])
const isZoomed = ref(false)

const lineColors = {
  chipsWon: '#10b981',
  netExpected: '#eab308',
  wonWithShowdown: '#3b82f6',
  wonWithoutShowdown: '#ef4444',
  euroProfit: '#10b981'
}

const lineLabels = computed(() => ({
  chipsWon: t('common.chips_won', 'Chips Won'),
  netExpected: t('hand_history.table.ev_chips', 'EV Chips'),
  wonWithShowdown: t('common.showdown_winning', 'Showdown Won'),
  wonWithoutShowdown: t('common.non_showdown_winning', 'Non-Showdown Won'),
  euroProfit: t('dashboard.net_profit', 'Net Profit (€)')
}))

const visibleLines = ref({
  chipsWon: true,
  netExpected: true,
  wonWithShowdown: true,
  wonWithoutShowdown: true,
  euroProfit: true
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
    const result = await ipcService.getWinrateChartData({ dateFrom, dateTo, heroName: heroName.value, buyIn: buyInParam })
    
    if (result && result.success && result.data) {
      const raw = result.data
      let chartData = []

      if (Array.isArray(raw)) {
        chartData = raw.map((item, index) => ({
          time: index + 1,
          label: item.date || `#${index + 1}`,
          chipsWon: item.profit ?? item.realWin ?? 0,
          netExpected: item.cumulative ?? item.theoricalWin ?? 0,
          wonWithShowdown: item.chips_won_showdown ?? item.chipsWonShowdown ?? 0,
          wonWithoutShowdown: item.chips_won_no_showdown ?? item.chipsWonNoShowdown ?? 0,
          euroProfit: item.euro_profit ?? 0
        }))
      } else if (raw.labels && Array.isArray(raw.labels)) {
        const { labels, realWin, theoricalWin, wonWithShowdown, wonWithoutShowdown, euro_profit } = raw
        chartData = labels.map((label, index) => ({
          time: index + 1,
          label: label,
          chipsWon: (realWin && realWin[index]) || 0,
          netExpected: (theoricalWin && theoricalWin[index]) || 0,
          wonWithShowdown: (wonWithShowdown && wonWithShowdown[index]) || 0,
          wonWithoutShowdown: (wonWithoutShowdown && wonWithoutShowdown[index]) || 0,
          euroProfit: (euro_profit && euro_profit[index]) || 0
        }))
      }
      data.value = chartData
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

const getOption = computed(() => {
  if (!data.value.length) return {}

  const seriesList = []
  
  if (chartMode.value === 'chips') {
    if (visibleLines.value.chipsWon) {
      seriesList.push({
        name: lineLabels.value.chipsWon,
        type: 'line',
        data: data.value.map(d => d.chipsWon),
        itemStyle: { color: lineColors.chipsWon },
        showSymbol: false,
        lineStyle: { width: 2 },
        emphasis: { focus: 'series' },
        large: true,
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
        large: true,
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
        large: true,
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
        large: true,
      })
    }
  } else {
    if (visibleLines.value.euroProfit) {
      seriesList.push({
        name: lineLabels.value.euroProfit,
        type: 'line',
        data: data.value.map(d => d.euroProfit),
        itemStyle: { color: lineColors.euroProfit },
        showSymbol: false,
        lineStyle: { width: 3 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
            { offset: 1, color: 'rgba(16, 185, 129, 0)' }
          ])
        },
        emphasis: { focus: 'series' },
        large: true,
      })
    }
  }

  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#9ca3af' },
      formatter: function (params) {
        let result = `<div class="font-mono text-xs text-gray-300 mb-1">${params[0].axisValueLabel}</div>`
        params.forEach(item => {
          const color = item.color
          const value = item.value
          const name = item.seriesName
          const sign = value >= 0 ? '+' : ''
          const formattedValue = chartMode.value === 'euro' 
            ? `${sign}${value.toFixed(2)}€`
            : `${sign}${Math.round(value)}`
          
          result += `<div class="flex items-center justify-between gap-4 text-xs">
              <span style="color:${color}">● ${name}</span>
              <span class="font-mono text-white font-medium">${formattedValue}</span>
          </div>`
        })
        return result
      },
      axisPointer: { type: 'cross', label: { backgroundColor: '#374151' } }
    },
    brush: {
      xAxisIndex: 0,
      brushLink: 'all',
      outOfBrush: { colorAlpha: 0.1 },
      brushStyle: {
        borderWidth: 1,
        color: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.5)'
      }
    },
    toolbox: { show: false },
    dataZoom: [
      { type: 'slider', show: false, xAxisIndex: 0 },
      { type: 'inside', xAxisIndex: 0, disabled: true }
    ],
    grid: {
      top: 30,
      right: 10,
      bottom: 20,
      left: 50,
      containLabel: true
    },
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
      axisLabel: { 
        color: '#9ca3af',
        formatter: (value) => chartMode.value === 'euro' ? `${value}€` : value
      },
      splitLine: { show: true, lineStyle: { color: '#2d3548' } }
    },
    series: seriesList
  }
})

const initChart = () => {
  if (chartContainer.value) {
    chartInstance = echarts.init(chartContainer.value, 'dark')
    updateChart()
  }
}

const updateChart = () => {
  if (chartInstance && getOption.value) {
    chartInstance.setOption(getOption.value)
    
    chartInstance.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: {
        brushType: 'lineX',
        brushMode: 'single'
      }
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
      chartInstance.dispatchAction({
        type: 'brush',
        areas: []
      })
      isZoomed.value = true
    }
  }
}

const handleRestore = () => {
  isZoomed.value = false
}

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
  }
}

const handleContextMenu = (e) => {
  e.preventDefault()
  if (chartInstance) {
    chartInstance.dispatchAction({ type: 'restore' })
  }
  isZoomed.value = false
}

watch([chartMode, visibleLines], () => {
  updateChart()
}, { deep: true })

watch([dateRange, buyIn, heroName, lastUpdate], () => {
  loadChartData()
})

watch(data, () => {
  updateChart()
})

onMounted(async () => {
  await loadChartData()
  initChart()
  
  if (chartInstance) {
    chartInstance.on('brushEnd', handleBrushEnd)
    chartInstance.on('restore', handleRestore)
    window.addEventListener('resize', handleResize)
  }
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.off('brushEnd', handleBrushEnd)
    chartInstance.off('restore', handleRestore)
    window.removeEventListener('resize', handleResize)
    chartInstance.dispose()
  }
})
</script>
