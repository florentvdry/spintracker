<template>
  <div 
    v-if="card && card.length >= 2"
    :class="[
      'bg-white rounded shadow-sm border border-gray-300 select-none flex flex-col items-center justify-center relative overflow-hidden',
      sizeClasses[size],
      suit.color
    ]"
    :title="`${rank} of ${suit.name}`"
  >
    <span class="font-bold leading-none">{{ rank }}</span>
    <span class="leading-none">{{ suit.symbol }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  card: String,
  size: {
    type: String,
    default: 'md'
  }
})

const SUITS = {
  's': { symbol: '♠', color: 'text-gray-900', name: 'spades' },
  'h': { symbol: '♥', color: 'text-red-600', name: 'hearts' },
  'd': { symbol: '♦', color: 'text-blue-600', name: 'diamonds' },
  'c': { symbol: '♣', color: 'text-green-600', name: 'clubs' }
}

const sizeClasses = {
  xs: 'w-7 h-10 text-[10px]',
  sm: 'w-9 h-12 text-xs',
  md: 'w-12 h-16 text-sm',
  lg: 'w-16 h-24 text-lg',
  xl: 'w-24 h-36 text-2xl'
}

const rank = computed(() => props.card?.slice(0, -1) || '')
const suitChar = computed(() => props.card?.slice(-1).toLowerCase() || 's')
const suit = computed(() => SUITS[suitChar.value] || SUITS['s'])
</script>
