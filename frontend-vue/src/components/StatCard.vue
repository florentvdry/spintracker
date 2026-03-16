<template>
  <div class="bg-dark-800 rounded-lg p-4 border border-dark-700">
    <div class="flex items-start justify-between mb-2">
      <p class="text-sm text-gray-400">{{ label }}</p>
      <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0">
        <component :is="iconComponent" class="w-5 h-5 text-primary-400" v-if="iconComponent" />
      </div>
    </div>
    <div v-if="format === 'profit'" class="text-2xl font-bold" :class="value >= 0 ? 'text-green-500' : 'text-red-500'">
      {{ formatProfit(value) }}
    </div>
    <div v-else-if="format === 'percent'" class="text-2xl font-bold text-white">
      {{ value }}%
    </div>
    <div v-else class="text-2xl font-bold text-white">
      {{ formatValue(value) }}
    </div>
    <div v-if="subStats" class="mt-2 space-y-1">
      <div v-for="(stat, index) in subStats" :key="index" class="flex justify-between text-xs">
        <span class="text-gray-500">{{ stat.label }}</span>
        <span class="text-gray-300">{{ formatValue(stat.value) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h } from 'vue'
import { DollarSign, Trophy, Hash, TrendingUp, Target } from 'lucide-vue-next'

const props = defineProps({
  label: String,
  value: [Number, String],
  format: {
    type: String,
    default: 'number'
  },
  icon: String,
  subStats: Array
})

const icons = {
  DollarSign,
  Trophy,
  Hash,
  TrendingUp,
  Target
}

const iconComponent = computed(() => {
  if (!props.icon) return null
  return icons[props.icon]
})

function formatProfit(val) {
  if (val === null || val === undefined) return '0'
  const num = Number(val)
  return num >= 0 ? `+${num.toLocaleString()}` : num.toLocaleString()
}

function formatValue(val) {
  if (val === null || val === undefined) return '0'
  if (typeof val === 'number') {
    return val.toLocaleString()
  }
  return val
}
</script>
