<template>
  <div ref="chartRef" class="w-full h-full"></div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
})

const chartRef = ref(null)
let chart = null

function initChart() {
  if (!chartRef.value) return
  
  chart = echarts.init(chartRef.value)
  updateChart()
  
  window.addEventListener('resize', () => {
    chart?.resize()
  })
}

function updateChart() {
  if (!chart) return
  
  const dates = props.data.map(d => d.date)
  const profits = props.data.map(d => d.profit || 0)
  
  let cumulative = 0
  const cumulativeData = profits.map(p => {
    cumulative += p
    return cumulative
  })
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#27272a',
      borderColor: '#3f3f46',
      textStyle: {
        color: '#fafafa'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: {
        lineStyle: {
          color: '#3f3f46'
        }
      },
      axisLabel: {
        color: '#a1a1aa'
      }
    },
    yAxis: {
      type: 'value',
      axisLine: {
        lineStyle: {
          color: '#3f3f46'
        }
      },
      axisLabel: {
        color: '#a1a1aa'
      },
      splitLine: {
        lineStyle: {
          color: '#27272a'
        }
      }
    },
    series: [
      {
        name: 'Profit cumulé',
        type: 'line',
        data: cumulativeData,
        smooth: true,
        lineStyle: {
          color: '#0ea5e9',
          width: 2
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(14, 165, 233, 0.3)' },
            { offset: 1, color: 'rgba(14, 165, 233, 0)' }
          ])
        },
        itemStyle: {
          color: '#0ea5e9'
        }
      }
    ]
  }
  
  chart.setOption(option)
}

onMounted(() => {
  initChart()
})

watch(() => props.data, () => {
  updateChart()
}, { deep: true })

onUnmounted(() => {
  chart?.dispose()
})
</script>
