<template>
  <div class="card p-4">
    <div class="flex items-center gap-4">
      <div v-if="icon" class="w-12 h-12 rounded-lg bg-primary-500/10 flex items-center justify-center">
        <component :is="icon" class="w-6 h-6 text-primary-400" />
      </div>
      <div class="flex-1">
        <p class="stat-label">{{ label }}</p>
        <div class="flex items-baseline gap-2">
          <p class="stat-value" :class="valueClass">{{ formattedValue }}</p>
        </div>
      </div>
    </div>
    <div v-if="subStats" class="mt-4 grid grid-cols-2 gap-2">
      <div v-for="stat in subStats" :key="stat.label" class="flex justify-between text-xs">
        <span class="text-gray-400">{{ stat.label }}</span>
        <span class="text-gray-200 font-medium">{{ formatValue(stat.value, stat.format) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: String,
  value: [Number, String],
  format: String,
  icon: [Object, Function],
  subStats: Array
})

const formatValue = (val, format) => {
  if (val === null || val === undefined) return '—'
  
  if (format === 'profit') {
    const sign = val >= 0 ? '+' : ''
    return `${sign}${Number(val).toFixed(2)}€`
  }
  
  if (format === 'percent') {
    return `${Number(val).toFixed(1)}%`
  }
  
  if (format === 'number') {
    return Number(val).toLocaleString()
  }
  
  return val
}

const formattedValue = computed(() => {
  return formatValue(props.value, props.format)
})

const valueClass = computed(() => {
  if (props.format === 'profit') {
    return props.value > 0 ? 'profit-positive' : props.value < 0 ? 'profit-negative' : ''
  }
  return ''
})
</script>
