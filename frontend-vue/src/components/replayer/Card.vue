<script setup>
import { computed } from 'vue'

const props = defineProps({
  card: String,
  hidden: Boolean,
  size: { type: String, default: 'md' }
})

const rank = computed(() => {
  if (!props.card) return ''
  const value = props.card.slice(0, -1)
  return value === 'T' ? '10' : value
})

const suit = computed(() => props.card?.slice(-1).toLowerCase() || '')

const config = computed(() => {
  switch (suit.value) {
    case 'h':
      return { color: 'text-[#ef4444]', symbol: 'H', bg: 'from-white to-red-50' }
    case 'd':
      return { color: 'text-[#2563eb]', symbol: 'D', bg: 'from-white to-blue-50' }
    case 's':
      return { color: 'text-[#111827]', symbol: 'S', bg: 'from-white to-slate-100' }
    case 'c':
      return { color: 'text-[#16a34a]', symbol: 'C', bg: 'from-white to-emerald-50' }
    default:
      return { color: 'text-gray-400', symbol: '?', bg: 'from-white to-gray-50' }
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'w-8 h-11 text-[13px] rounded-sm'
    case 'lg':
      return 'w-14 h-20 text-2xl rounded-lg'
    case 'seat':
      return 'w-[clamp(28px,4.6cqw,44px)] h-[clamp(40px,6.5cqw,62px)] text-[clamp(12px,2cqw,18px)] rounded-[clamp(4px,0.7cqw,7px)]'
    case 'board':
    case 'adaptive':
      return 'w-[clamp(36px,6.4cqw,66px)] h-[clamp(50px,8.8cqw,92px)] text-[clamp(16px,2.9cqw,28px)] rounded-[clamp(5px,0.8cqw,9px)]'
    case 'adaptive-sm':
      return 'w-[clamp(28px,4.6cqw,44px)] h-[clamp(40px,6.5cqw,62px)] text-[clamp(12px,2cqw,18px)] rounded-[clamp(4px,0.7cqw,7px)]'
    default:
      return 'w-10 h-14 text-lg rounded-md'
  }
})
</script>

<template>
  <div
    v-if="hidden"
    class="relative flex items-center justify-center overflow-hidden border border-white/80 bg-[#1e293b] shadow-[0_8px_18px_rgba(0,0,0,0.35)]"
    :class="sizeClasses"
  >
    <div class="absolute inset-[11%] rounded-[inherit] border border-sky-400/35 bg-[#2d3a4f]">
      <div class="h-full w-full opacity-25 bg-[radial-gradient(circle_at_center,_#60a5fa_0%,_transparent_68%)]"></div>
    </div>
  </div>

  <div
    v-else
    class="relative flex select-none flex-col items-center justify-center border border-gray-200 bg-gradient-to-b font-black tracking-tighter shadow-[0_8px_18px_rgba(0,0,0,0.38)] ring-1 ring-black/5"
    :class="[sizeClasses, config.color, config.bg]"
  >
    <span class="leading-none">{{ rank }}</span>
    <span class="mt-[-0.1em] text-[0.72em] font-black leading-none opacity-80">{{ config.symbol }}</span>
    <span class="absolute left-1 top-0.5 text-[0.38em] opacity-30">{{ config.symbol }}</span>
  </div>
</template>
