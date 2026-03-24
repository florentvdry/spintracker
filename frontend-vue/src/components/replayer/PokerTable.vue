<script setup>
import { computed } from 'vue'
import { useReplayerStore } from '@/stores/replayerStore'
import PlayerSeat from './PlayerSeat.vue'
import Card from './Card.vue'
import Chips from './Chips.vue'
import logoUrl from '@/assets/logo.png'

const store = useReplayerStore()

// Seat mapping: find Hero and put them at the bottom (seat-0)
const heroIndex = computed(() => {
  if (!store.players) return 0
  const idx = store.players.findIndex(p => p.isHero)
  return idx === -1 ? 0 : idx
})

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

const getSeatPosition = (index) => {
  const count = store.players.length
  // Rotate seats so hero is at bottom (seat 0)
  const relativeIndex = (index - heroIndex.value + count) % count
  
  if (count <= 3) {
    return `seat-${relativeIndex}`
  } else {
    return `seat-6-${relativeIndex}`
  }
}

const getWinnerPositionClass = (playerName) => {
  if (!playerName) return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
  const idx = store.players.findIndex(p => p.name === playerName)
  if (idx === -1) return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
  
  const pos = getSeatPosition(idx)
  if (pos === 'seat-0' || pos === 'seat-6-0') return 'top-[90%] left-[50%] -translate-x-1/2 -translate-y-1/2'
  if (pos === 'seat-6-3') return 'top-[0%] left-[50%] -translate-x-1/2 -translate-y-1/2'
  if (pos === 'seat-1') return 'top-[20%] left-[5%] -translate-x-1/2 -translate-y-1/2'
  if (pos === 'seat-2') return 'top-[20%] left-[95%] -translate-x-1/2 -translate-y-1/2'
  if (pos === 'seat-6-1') return 'top-[75%] left-[5%] -translate-x-1/2 -translate-y-1/2'
  if (pos === 'seat-6-2') return 'top-[25%] left-[5%] -translate-x-1/2 -translate-y-1/2'
  if (pos === 'seat-6-4') return 'top-[25%] left-[95%] -translate-x-1/2 -translate-y-1/2'
  if (pos === 'seat-6-5') return 'top-[75%] left-[95%] -translate-x-1/2 -translate-y-1/2'
  
  return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
}
</script>

<template>
  <div class="replayer-container w-full h-full flex items-center justify-center p-[4%]">
    <div class="poker-table-wrapper relative w-full max-w-[1200px] aspect-[21/9]">
      
      <!-- Ambient Lighting Glow -->
      <div class="absolute inset-0 bg-blue-500/10 blur-[100px] rounded-full opacity-50"></div>

      <!-- Table Structure -->
      <div class="absolute inset-0 flex items-center justify-center">
        <!-- The Rail (Leather-like texture) -->
        <div class="poker-table w-full h-full bg-[#0a0a0a] rounded-[500px] border-[min(1.8vw,16px)] border-[#16191d] shadow-[0_40px_100px_-10px_rgba(0,0,0,0.8)] relative overflow-hidden ring-1 ring-white/5">
          
          <!-- Inner felt with deep texture -->
          <div class="absolute inset-[min(0.4vw,6px)] bg-[#07251a] rounded-[500px] border-[min(0.5vw,4px)] border-black/40 overflow-hidden shadow-[inset_0_20px_60px_rgba(0,0,0,0.6)]">
            
            <!-- Felt Gradient -->
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_#1b4332_0%,_#07251a_70%)] opacity-80"></div>
            
            <!-- Felt Noise Texture Overlay -->
            <div class="absolute inset-0 opacity-[0.15] mix-blend-overlay pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')]"></div>
            
            <!-- Table Branding (Logo) -->
            <div class="absolute inset-0 flex items-center justify-center opacity-[0.12] pointer-events-none select-none">
              <div class="flex flex-col items-center">
                <img :src="logoUrl" class="w-[min(20vw,240px)] h-auto mb-2" alt="SpinTracker" />
              </div>
            </div>

            <!-- Betting Line (H2N style: thin, elegant) -->
            <div class="absolute inset-[18%] border border-white/5 rounded-[500px]"></div>
          </div>
          
          <!-- Board Cards (Centered on felt) -->
          <div class="absolute inset-0 flex items-center justify-center gap-[min(0.6vw,10px)] z-10 drop-shadow-[0_15px_30px_rgba(0,0,0,0.6)]">
            <Card v-for="(card, i) in store.board" :key="i + card" :card="card" size="adaptive" class="transition-all" />
            <!-- Placeholders for missing cards - only shown if board has at least one card -->
            <template v-if="store.board.length > 0">
              <div v-for="i in (5 - store.board.length)" :key="'empty-' + i" class="adaptive-card-placeholder border border-white/5 bg-black/40 rounded-[min(0.5cqw,8px)] backdrop-blur-sm"></div>
            </template>
          </div>

          <!-- Pot Display (Floating Capsule) -->
          <div v-if="store.pot > 0" class="absolute top-[32%] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-700">
            <Chips :amount="store.pot" :bb-value="bbValue" size="lg" />
            <div class="bg-black/40 backdrop-blur-xl px-[min(2.5vw,20px)] py-[min(1vw,8px)] rounded-full border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-3">
              <span class="text-blue-400 text-[min(1.8vw,0.7rem)] font-black uppercase tracking-[0.2em] opacity-80">Pot</span>
              <span class="text-white font-mono font-black text-[min(4vw,1.6rem)] leading-none drop-shadow-lg">
                {{ formatValue(store.pot) }}
              </span>
              <span class="text-gray-500 text-[min(1.5vw,0.6rem)] font-bold uppercase tracking-widest">{{ unitLabel }}</span>
            </div>
          </div>

          <!-- Winner Chips Animation -->
          <div v-if="store.currentAction?.type === 'CollectPot'" class="absolute inset-0 pointer-events-none z-30">
            <transition name="pot-fly" appear>
              <div 
                :key="store.currentAction.order"
                class="absolute flex flex-col items-center justify-center drop-shadow-2xl"
                :class="getWinnerPositionClass(store.currentAction.playerName)"
              >
                <div class="bg-green-500/20 text-green-400 font-black px-4 py-1 rounded-full border border-green-500/50 mb-2 shadow-[0_0_20px_rgba(34,197,94,0.4)]">
                  +{{ formatValue(store.currentAction.amount) }}
                </div>
                <Chips :amount="store.currentAction.amount" :bb-value="bbValue" size="lg" />
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- Players -->
      <PlayerSeat 
        v-for="(player, index) in store.players" 
        :key="player.name" 
        :player="player"
        :position="getSeatPosition(index)"
      />
    </div>
  </div>
</template>

<style scoped>
.replayer-container {
  container-type: size;
}

.adaptive-card-placeholder {
  width: min(9cqw, 64px);
  height: min(12.5cqw, 88px);
}

.poker-table-wrapper {
  max-height: 100%;
  margin: auto;
}

/* Aspect ratio maintainer for the oval */
@media (max-aspect-ratio: 21/9) {
  .poker-table-wrapper {
    width: 100%;
    height: auto;
  }
}

@media (min-aspect-ratio: 21/9) {
  .poker-table-wrapper {
    height: 100%;
    width: auto;
  }
}

/* Winner Pot Fly Animation */
.pot-fly-enter-active {
  transition: all 0.7s cubic-bezier(0.25, 1, 0.5, 1);
}
.pot-fly-leave-active {
  transition: all 0.3s ease-in;
}
.pot-fly-enter-from {
  top: 32% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) scale(1.5) !important;
  opacity: 0;
}
.pot-fly-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
</style>
