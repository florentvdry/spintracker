<template>
  <div class="bg-dark-400 px-4 py-3 flex flex-col gap-0.5 min-w-0">
    <p class="stat-label flex items-center gap-1.5">
      <component :is="icon" v-if="icon" class="w-3.5 h-3.5 text-gray-500" />
      {{ label }}
    </p>
    <p class="stat-value" :class="valueClass">{{ formattedValue }}</p>
    <div v-if="subStats" class="mt-1 space-y-0.5">
      <div v-for="stat in subStats" :key="stat.label" class="flex justify-between text-xs">
        <span class="text-gray-500">{{ stat.label }}</span>
        <span class="text-gray-200 font-mono">{{ formatValue(stat.value, stat.format) }}</span>
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
