<script setup>
import { computed } from 'vue'
import { useReplayerStore } from '@/stores/replayerStore'
import Card from './Card.vue'
import Chips from './Chips.vue'

const props = defineProps({
  player: Object,
  position: String // seat-0, seat-1, etc.
})

const store = useReplayerStore()

const bbValue = computed(() => {
  if (!store.handData?.blinds) return 0
  const parts = store.handData.blinds.split('/')
  return parts.length === 2 ? parseFloat(parts[1]) : 0
})

const formatValue = (val) => {
  if (store.viewMode === 'bb' && bbValue.value > 0) {
    const bb = val / bbValue.value
    return bb < 0.1 ? bb.toFixed(2) : bb.toFixed(1)
  }
  return val.toFixed(1)
}

const unitLabel = computed(() => store.viewMode === 'bb' ? 'bb' : 'chips')

const cards = computed(() => {
  if (!props.player.cards) return []
  return props.player.cards.match(/.{1,2}/g) || []
})

const showCards = computed(() => {
  return props.player.isHero || props.player.showCards
})

const betPositionClass = computed(() => {
  // Logic to move chips towards the inner part of the table
  const pos = props.position
  if (pos === 'seat-0' || pos === 'seat-6-0') return 'bottom-[115%] left-1/2 -translate-x-1/2' // Bottom player -> chips above
  if (pos === 'seat-6-3') return 'top-[115%] left-1/2 -translate-x-1/2' // Top player -> chips below
  
  if (pos.includes('seat-1') || pos.includes('seat-6-1') || pos.includes('seat-6-2')) {
    return 'left-[105%] top-1/2 -translate-y-1/2' // Left side -> chips to the right
  }
  if (pos.includes('seat-2') || pos.includes('seat-6-4') || pos.includes('seat-6-5')) {
    return 'right-[105%] top-1/2 -translate-y-1/2' // Right side -> chips to the left
  }
  
  return 'top-[105%] left-1/2 -translate-x-1/2'
})

const betDx = computed(() => {
  const pos = props.position
  if (pos.includes('seat-1') || pos.includes('seat-6-1') || pos.includes('seat-6-2')) return '-40px'
  if (pos.includes('seat-2') || pos.includes('seat-6-4') || pos.includes('seat-6-5')) return '40px'
  return '0px'
})

const betDy = computed(() => {
  const pos = props.position
  if (pos === 'seat-0' || pos === 'seat-6-0') return '40px'
  if (pos === 'seat-6-3') return '-40px'
  return '0px'
})
</script>

<template>
  <div 
    class="absolute flex flex-col items-center transition-all duration-500"
    :class="[
      position,
      player.isFolded ? 'opacity-30 scale-90 grayscale-[0.5]' : 'opacity-100',
      player.isActive ? 'z-30' : 'z-20'
    ]"
  >
    <!-- Card Hand (H2N style: overlapping cards) -->
    <div v-if="!player.isFolded" class="flex -space-x-[min(2cqw,12px)] mb-[min(0.5cqw,4px)] drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]">
      <template v-if="showCards">
        <Card v-for="(card, i) in cards" :key="card" :card="card" size="adaptive-sm" class="transition-transform hover:-translate-y-1" :style="{ zIndex: i }" />
      </template>
      <template v-else-if="!player.isFolded">
        <Card :hidden="true" size="adaptive-sm" />
        <Card :hidden="true" size="adaptive-sm" />
      </template>
    </div>

    <!-- Player Info Box (H2N style: clean, dark, compact) -->
    <div 
      class="relative group"
    >
      <!-- Action Bubble -->
      <div 
        v-if="store.currentAction?.playerName === player.name && store.isRealAction(store.currentAction)"
        class="absolute -top-[135%] left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-none"
      >
        <div class="bg-blue-600/95 text-white text-[min(2.5cqw,0.85rem)] font-bold px-[min(2.5cqw,14px)] py-[min(0.8cqw,6px)] rounded-full whitespace-nowrap shadow-[0_8px_20px_rgba(37,99,235,0.6)] border border-blue-400/40 tracking-wide">
          {{ store.currentAction.description }}
        </div>
      </div>

      <!-- Active Glow -->
      <div v-if="player.isActive" class="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-lg blur opacity-40 animate-pulse"></div>
      
      <div 
        class="relative bg-[#111827] border-[min(0.3cqw,2px)] rounded-lg px-[min(1.5cqw,16px)] py-[min(0.8cqw,10px)] min-w-[min(16cqw,140px)] shadow-2xl transition-all"
        :class="player.isActive ? 'border-blue-500/50 bg-[#1e293b]' : 'border-white/5'"
      >
        <div class="flex flex-col items-center">
          <div class="text-[min(2.4cqw,0.85rem)] font-black truncate text-gray-100 uppercase tracking-tight w-full text-center">{{ player.name }}</div>
          
          <div class="flex items-center gap-1.5 mt-0.5">
            <div class="text-[min(3.2cqw,1.1rem)] font-mono font-black text-white leading-none">
              {{ formatValue(player.currentStack) }}
            </div>
            <div class="text-[min(1.8cqw,0.65rem)] text-gray-500 font-bold uppercase">{{ unitLabel }}</div>
          </div>
        </div>
        
        <!-- Dealer Button -->
        <div 
          v-if="player.position.includes('BTN')"
          class="absolute -top-[min(1.5cqw,10px)] -right-[min(1.5cqw,10px)] w-[min(5cqw,34px)] h-[min(5cqw,34px)] bg-white rounded-full flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.5)] ring-2 ring-black"
        >
          <span class="text-black font-black text-[min(2.5cqw,14px)]">D</span>
        </div>
      </div>

      <!-- Bet Amount (Floating Bubble) - Relative to Player Info Box -->
      <div 
        v-if="player.bet > 0"
        class="absolute z-50 pointer-events-none"
        :class="betPositionClass"
      >
        <transition name="bet" appear>
          <div :key="player.bet" class="flex flex-col items-center gap-1.5" :style="{'--bet-dx': betDx, '--bet-dy': betDy}">
            <Chips :amount="player.bet" :bb-value="bbValue" size="sm" />
            <div class="bg-black/90 backdrop-blur-md border border-white/20 text-white px-[min(2.5cqw,16px)] py-[min(0.6cqw,6px)] rounded-full text-[min(3cqw,1rem)] font-mono font-black shadow-[0_10px_30px_rgba(0,0,0,0.8)] whitespace-nowrap">
              <span class="text-yellow-400 mr-1.5">●</span> {{ formatValue(player.bet) }}
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Position utility classes - Fine tuned for oval table */
.seat-0 { bottom: -5%; left: 50%; transform: translateX(-50%); } 
.seat-1 { top: 15%; left: 0%; transform: translateX(-20%); } 
.seat-2 { top: 15%; right: 0%; transform: translateX(20%); } 

/* 6-max positions */
.seat-6-0 { bottom: -5%; left: 50%; transform: translateX(-50%); }
.seat-6-1 { bottom: 25%; left: -2%; }
.seat-6-2 { top: 25%; left: -2%; }
.seat-6-3 { top: -8%; left: 50%; transform: translateX(-50%); }
.seat-6-4 { top: 25%; right: -2%; }
.seat-6-5 { bottom: 25%; right: -2%; }

/* Bet Chip CSS Animation */
.bet-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bet-leave-active {
  transition: all 0.2s ease-in;
}
.bet-enter-from {
  opacity: 0;
  transform: translate(var(--bet-dx), var(--bet-dy)) scale(0.3);
}
.bet-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
</style>
