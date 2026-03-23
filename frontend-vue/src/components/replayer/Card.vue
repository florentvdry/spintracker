<script setup>
import { computed } from 'vue'

const props = defineProps({
  card: String, // e.g. "Ah", "Kd", "Tc"
  hidden: Boolean,
  size: { type: String, default: 'md' }
})

const rank = computed(() => {
  if (!props.card) return ''
  const r = props.card.slice(0, -1)
  return r === 'T' ? '10' : r
})

const suit = computed(() => props.card?.slice(-1).toLowerCase() || '')

const config = computed(() => {
  switch (suit.value) {
    case 'h': return { color: 'text-[#ff4b4b]', symbol: '♥', bg: 'from-white to-red-50' }
    case 'd': return { color: 'text-[#3b82f6]', symbol: '♦', bg: 'from-white to-blue-50' }
    case 's': return { color: 'text-[#1e293b]', symbol: '♠', bg: 'from-white to-slate-100' }
    case 'c': return { color: 'text-[#22c55e]', symbol: '♣', bg: 'from-white to-emerald-50' }
    default: return { color: 'text-gray-400', symbol: '?', bg: 'from-white to-gray-50' }
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'w-8 h-11 text-[13px] rounded-sm'
    case 'lg': return 'w-14 h-20 text-2xl rounded-lg'
    case 'adaptive': return 'w-[min(9cqw,64px)] h-[min(12.5cqw,88px)] text-[min(4cqw,1.5rem)] rounded-[min(0.8cqw,6px)]'
    case 'adaptive-sm': return 'w-[min(6.5cqw,44px)] h-[min(9cqw,62px)] text-[min(3cqw,1.1rem)] rounded-[min(0.5cqw,4px)]'
    default: return 'w-10 h-14 text-lg rounded-md'
  }
})
</script>

<template>
  <!-- Card Back -->
  <div 
    v-if="hidden"
    class="relative bg-[#1e293b] border-[min(0.4cqw,2px)] border-white shadow-[0_4px_10px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden"
    :class="sizeClasses"
  >
    <div class="absolute inset-[10%] border border-blue-500/30 rounded-sm bg-[#2d3a4f] flex items-center justify-center">
      <div class="w-full h-full opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-400 to-transparent"></div>
    </div>
  </div>
  
  <!-- Card Front -->
  <div 
    v-else
    class="relative bg-gradient-to-b border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.4)] flex flex-col items-center justify-center select-none font-black tracking-tighter ring-1 ring-black/5"
    :class="[sizeClasses, config.color, config.bg]"
  >
    <div class="flex flex-col items-center leading-none">
      <span>{{ rank }}</span>
      <span class="mt-[-0.1em] text-[1.1em] filter drop-shadow-sm">{{ config.symbol }}</span>
    </div>

    <!-- Mini suit in corner for adaptive sizes -->
    <div class="absolute top-0.5 left-1 text-[0.4em] opacity-30">{{ config.symbol }}</div>
  </div>
</template>
