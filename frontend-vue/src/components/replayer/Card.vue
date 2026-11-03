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

const cardStyle = computed(() => {
  switch (suit.value) {
    case 'h':
      return 'heart'
    case 'd':
      return 'diamond'
    case 's':
      return 'spade'
    case 'c':
      return 'club'
    default:
      return 'spade'
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
    class="card-tile relative flex select-none items-center justify-center font-black shadow-[0_8px_18px_rgba(0,0,0,0.38)]"
    :class="[sizeClasses, cardStyle]"
  >
    <span class="leading-none">{{ rank }}</span>
  </div>
</template>

<style scoped>
.card-tile {
  border-radius: 5px;
  color: #fff;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.26);
}

.card-tile.heart {
  background: #ef1f2d;
}

.card-tile.diamond {
  background: #2563eb;
}

.card-tile.club {
  background: #34c27a;
}

.card-tile.spade {
  background: #6b7280;
}
</style>
