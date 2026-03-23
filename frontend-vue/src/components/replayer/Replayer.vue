import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useReplayerStore } from '@/stores/replayerStore'
import PokerTable from './PokerTable.vue'
import { 
  Play, Pause, SkipBack, SkipForward, 
  FastForward, Rewind, Info, List, Settings2,
  ChevronLeft, ChevronRight
} from 'lucide-vue-next'

const store = useReplayerStore()
const showLogs = ref(false)
const showSettings = ref(false)

const bbValue = computed(() => {
  if (!store.handData?.blinds) return 0
  const parts = store.handData.blinds.split('/')
  return parts.length === 2 ? parseFloat(parts[1]) : 0
})

const formatValue = (val) => {
  if (store.viewMode === 'bb' && bbValue.value > 0) {
    return (val / bbValue.value).toFixed(2) + ' bb'
  }
  return val.toFixed(1) + ' chips'
}

onUnmounted(() => {
  store.stop()
})

const speeds = [
  { label: '0.5x', value: 2000 },
  { label: '1x', value: 1000 },
  { label: '2x', value: 500 },
  { label: '4x', value: 250 }
]

const togglePlay = () => {
  if (store.isPlaying) store.stop()
  else store.play()
}

const handleKeyDown = (e) => {
  if (e.key === ' ') {
    e.preventDefault()
    togglePlay()
  } else if (e.key === 'ArrowRight') {
    store.nextStep()
  } else if (e.key === 'ArrowLeft') {
    store.prevStep()
  }
}

onMounted(() => window.addEventListener('keydown', handleKeyDown))
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown))
</script>

<template>
  <div class="flex flex-col h-screen bg-[#0f172a] text-gray-200 overflow-hidden select-none relative">
    <!-- Queue Navigation -->
    <div v-if="store.handQueue.length > 1" class="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 bg-black/40 backdrop-blur-md border border-white/10 p-2 rounded-xl shadow-2xl">
      <button @click="store.prevHand()" :disabled="store.queueIndex === 0" class="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
        <ChevronLeft :size="18" />
      </button>
      <div class="text-xs font-bold whitespace-nowrap">
        Main {{ store.queueIndex + 1 }} / {{ store.handQueue.length }}
      </div>
      <button @click="store.nextHand()" :disabled="store.queueIndex >= store.handQueue.length - 1" class="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
        <ChevronRight :size="18" />
      </button>
    </div>

    <!-- Floating Hand Info -->
    <div v-if="store.handData" class="absolute top-4 left-4 z-30 pointer-events-none">
      <div class="bg-black/40 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-2xl">
        <div class="flex items-center gap-3">
          <span class="text-lg font-black text-white tracking-tighter uppercase">{{ store.handData.room }}</span>
          <div class="h-4 w-px bg-white/20"></div>
          <span class="text-blue-400 font-mono font-bold">{{ store.handData.blinds }}</span>
        </div>
        <div class="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-medium opacity-60">
          {{ store.handData.date }}
        </div>
      </div>
    </div>

    <!-- Right Top Buttons -->
    <div class="absolute top-4 right-4 z-30 flex gap-2">
      <button 
        @click="showLogs = !showLogs"
        class="p-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all shadow-2xl"
        :class="showLogs ? 'text-blue-400 border-blue-500/50' : 'text-gray-400'"
      >
        <List :size="20" />
      </button>
    </div>

    <main class="flex-1 flex overflow-hidden relative">
      <!-- Main Replayer Area -->
      <div class="flex-1 flex flex-col items-center justify-center relative">
        <div v-if="store.loading" class="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>

        <PokerTable v-if="store.handData" />
      </div>

        <!-- Action Log Sidebar (Overlays if screen is small) -->      <aside 
        v-if="showLogs"
        class="absolute right-0 top-0 bottom-0 w-80 bg-gray-900/90 backdrop-blur-xl border-l border-white/10 flex flex-col z-40 animate-in slide-in-from-right duration-300"
      >
        <div class="p-4 border-b border-white/10 font-black text-xs uppercase tracking-widest bg-black/20 flex justify-between items-center">
          <span>Action Log</span>
          <button @click="showLogs = false" class="text-gray-500 hover:text-white">✕</button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
          <div 
            v-for="(action, i) in store.handData?.actions" 
            :key="i"
            @click="store.jumpTo(i + 1)"
            class="p-3 rounded-xl text-xs cursor-pointer transition-all duration-200"
            :class="[
              i < store.currentIndex ? 'bg-blue-500/5 text-blue-300' : 'text-gray-600 hover:bg-white/5',
              i === store.currentIndex - 1 ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/20 scale-[1.02]' : ''
            ]"
          >
            <div class="flex justify-between items-center mb-1">
              <span class="font-black uppercase text-[9px] opacity-40">{{ action.street }}</span>
              <span class="opacity-30">#{{ action.order }}</span>
            </div>
            <div class="leading-relaxed">{{ action.description }}</div>
          </div>
        </div>
      </aside>
    </main>

    <!-- Controls Bar -->
    <footer class="bg-black/40 backdrop-blur-xl border-t border-white/5 p-6 z-30">
      <div class="max-w-6xl mx-auto flex flex-col gap-6">
        <!-- Progress Slider -->
        <div class="relative group">
          <div class="absolute inset-0 bg-blue-500/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-full"></div>
          <input 
            type="range" 
            min="0" 
            :max="store.totalActions" 
            v-model.number="store.currentIndex"
            @input="store.jumpTo(store.currentIndex)"
            class="relative w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 transition-all hover:h-2"
          />
        </div>

        <div class="flex items-center justify-between">
          <!-- Playback Controls -->
          <div class="flex items-center gap-2">
            <button @click="store.resetTable()" class="p-3 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
              <Rewind :size="22" />
            </button>
            <button @click="store.prevStep()" class="p-3 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
              <SkipBack :size="22" />
            </button>
            
            <button 
              @click="togglePlay"
              class="w-14 h-14 rounded-2xl flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-95 shadow-2xl shadow-blue-600/20 hover:shadow-blue-500/40"
            >
              <Pause v-if="store.isPlaying" :size="28" />
              <Play v-else :size="28" class="ml-1" />
            </button>

            <button @click="store.nextStep()" class="p-3 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
              <SkipForward :size="22" />
            </button>
            <button @click="store.jumpTo(store.totalActions)" class="p-3 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
              <FastForward :size="22" />
            </button>
          </div>

          <!-- Current Action Info -->
          <div class="hidden lg:flex flex-col items-center">
            <div v-if="store.currentAction" class="bg-blue-500/10 border border-blue-500/20 px-6 py-2 rounded-full text-sm font-bold text-blue-400 animate-in fade-in slide-in-from-top-2 duration-300">
              {{ store.currentAction.description }}
            </div>
            <div v-else class="text-sm font-bold text-gray-600 tracking-widest uppercase opacity-50">Prêt</div>
          </div>

          <!-- Speed & View Mode Toggle -->
          <div class="flex items-center gap-4">
            <!-- View Mode Toggle -->
            <div class="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
              <button 
                @click="store.viewMode = 'chips'"
                class="px-3 py-1.5 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all"
                :class="store.viewMode === 'chips' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'"
              >
                Chips
              </button>
              <button 
                @click="store.viewMode = 'bb'"
                class="px-3 py-1.5 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all"
                :class="store.viewMode === 'bb' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'"
              >
                BB
              </button>
            </div>

            <div class="flex items-center gap-1 bg-black/40 p-1.5 rounded-2xl border border-white/5 shadow-inner">
              <button 
                v-for="s in speeds" 
                :key="s.value"
                @click="store.setSpeed(s.value)"
                class="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                :class="store.playbackSpeed === s.value ? 'bg-white/10 text-white shadow-lg border border-white/10' : 'text-gray-500 hover:text-gray-300'"
              >
                {{ s.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
}
</style>
