<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  FastForward,
  List,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  X
} from 'lucide-vue-next'
import { useReplayerStore } from '@/stores/replayerStore'
import PokerTable from './PokerTable.vue'

const store = useReplayerStore()
const showLogs = ref(typeof window !== 'undefined' && window.innerWidth >= 1180)

const bbValue = computed(() => {
  if (!store.handData?.blinds) return 0
  const parts = String(store.handData.blinds).split('/')
  return parts.length === 2 ? Number(parts[1]) || 0 : 0
})

const formatValue = (value) => {
  const val = Number(value || 0)
  if (store.viewMode === 'bb' && bbValue.value > 0) {
    return `${(val / bbValue.value).toFixed(2)} bb`
  }
  return `${Math.round(val).toLocaleString()} chips`
}

const speeds = [
  { label: '0.5x', value: 2000 },
  { label: '1x', value: 1000 },
  { label: '2x', value: 500 },
  { label: '4x', value: 250 }
]

const realActions = computed(() => {
  return store.handData?.actions
    ?.map((action, index) => ({ action, index }))
    .filter((entry) => store.isRealAction(entry.action)) || []
})

const currentRealActionIndex = computed(() => {
  if (!store.handData || store.currentIndex === 0) return -1
  for (let index = store.currentIndex - 1; index >= 0; index -= 1) {
    if (store.isRealAction(store.handData.actions[index])) return index
  }
  return -1
})

const currentActionLabel = computed(() => {
  if (store.currentAction?.description) return store.currentAction.description
  return 'Pret a rejouer la main'
})

const togglePlay = () => {
  if (store.isPlaying) store.stop()
  else store.play()
}

const handleKeyDown = (event) => {
  if (event.key === ' ') {
    event.preventDefault()
    togglePlay()
  } else if (event.key === 'ArrowRight') {
    store.nextStep()
  } else if (event.key === 'ArrowLeft') {
    store.prevStep()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  store.stop()
})
</script>

<template>
  <div class="replayer-page">
    <header class="replayer-header">
      <div v-if="store.handData" class="hand-card">
        <div class="hand-title">
          <span>{{ store.handData.room }}</span>
          <span class="hand-buyin">{{ store.handData.buyIn }} EUR</span>
        </div>
        <div class="hand-meta">
          <span>{{ store.handData.date }}</span>
          <span v-if="store.handData.blinds">Blinds {{ store.handData.blinds }}</span>
        </div>
      </div>

      <div v-else class="hand-card">
        <div class="hand-title">Replayer</div>
        <div class="hand-meta">Aucune main chargee</div>
      </div>

      <div v-if="store.handQueue.length > 1" class="queue-card">
        <button class="icon-button" :disabled="store.queueIndex === 0" @click="store.prevHand()">
          <ChevronLeft :size="18" />
        </button>
        <span>Main {{ store.queueIndex + 1 }} / {{ store.handQueue.length }}</span>
        <button class="icon-button" :disabled="store.queueIndex >= store.handQueue.length - 1" @click="store.nextHand()">
          <ChevronRight :size="18" />
        </button>
      </div>

      <button
        class="log-toggle"
        :class="{ active: showLogs }"
        @click="showLogs = !showLogs"
      >
        <List :size="18" />
        <span>Actions</span>
      </button>
    </header>

    <main class="replayer-main" :class="{ 'with-log': showLogs }">
      <section class="table-panel">
        <div v-if="store.loading" class="loading-cover">
          <div class="spinner"></div>
        </div>

        <PokerTable v-if="store.handData" />

        <div v-else-if="!store.loading" class="empty-state">
          <h2>Selectionne une main pour lancer le replayer</h2>
          <p>Le nouveau layout garde les pseudos, stacks et actions visibles sur desktop, tablette et mobile.</p>
        </div>
      </section>

      <aside v-if="showLogs" class="action-panel">
        <div class="panel-header">
          <div>
            <span class="eyebrow">Timeline</span>
            <h2>Actions</h2>
          </div>
          <button class="icon-button" @click="showLogs = false">
            <X :size="17" />
          </button>
        </div>

        <div class="action-list">
          <button
            v-for="{ action, index } in realActions"
            :key="`${index}-${action.description}`"
            class="action-row"
            :class="{
              played: index < currentRealActionIndex,
              current: index === currentRealActionIndex
            }"
            @click="store.jumpTo(index + 1)"
          >
            <span class="action-street">{{ action.street || '-' }}</span>
            <span class="action-description">{{ action.description }}</span>
            <span class="action-order">#{{ action.order }}</span>
          </button>
        </div>
      </aside>
    </main>

    <footer class="control-panel">
      <div class="current-action">
        <span class="current-label">Action actuelle</span>
        <strong>{{ currentActionLabel }}</strong>
      </div>

      <div class="progress-row">
        <span>{{ store.currentIndex }}</span>
        <input
          v-model.number="store.currentIndex"
          type="range"
          min="0"
          :max="store.totalActions"
          class="progress-slider"
          @input="store.jumpTo(store.currentIndex)"
        />
        <span>{{ store.totalActions }}</span>
      </div>

      <div class="controls-row">
        <div class="playback-group">
          <button class="control-button" @click="store.resetTable()">
            <Rewind :size="20" />
          </button>
          <button class="control-button" @click="store.prevStep()">
            <SkipBack :size="20" />
          </button>
          <button class="play-button" @click="togglePlay">
            <Pause v-if="store.isPlaying" :size="26" />
            <Play v-else :size="26" class="ml-0.5" />
          </button>
          <button class="control-button" @click="store.nextStep()">
            <SkipForward :size="20" />
          </button>
          <button class="control-button" @click="store.jumpTo(store.totalActions)">
            <FastForward :size="20" />
          </button>
        </div>

        <div class="toggle-group" aria-label="Mode d'affichage">
          <button
            :class="{ active: store.viewMode === 'chips' }"
            @click="store.viewMode = 'chips'"
          >
            Chips
          </button>
          <button
            :class="{ active: store.viewMode === 'bb' }"
            @click="store.viewMode = 'bb'"
          >
            BB
          </button>
        </div>

        <div class="toggle-group" aria-label="Vitesse">
          <button
            v-for="speed in speeds"
            :key="speed.value"
            :class="{ active: store.playbackSpeed === speed.value }"
            @click="store.setSpeed(speed.value)"
          >
            {{ speed.label }}
          </button>
        </div>

        <div class="toggle-group" aria-label="Options">
          <button
            :class="{ active: store.showFoldedPlayers }"
            @click="store.showFoldedPlayers = !store.showFoldedPlayers"
          >
            <span class="toggle-icon">👥</span>
            Folded
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.replayer-page {
  height: 100vh;
  min-height: 620px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 0%, rgba(59, 130, 246, 0.18), transparent 32%),
    radial-gradient(circle at 86% 14%, rgba(20, 184, 166, 0.14), transparent 28%),
    #07111f;
  color: #e5e7eb;
  user-select: none;
}

.replayer-header,
.control-panel {
  position: relative;
  z-index: 40;
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(2, 6, 23, 0.76);
  backdrop-filter: blur(18px);
}

.replayer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom-width: 1px;
  padding: 12px clamp(14px, 2.4vw, 28px);
}

.hand-card,
.queue-card,
.log-toggle,
.current-action {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.22);
}

.hand-card {
  min-width: 0;
  padding: 10px 13px;
}

.hand-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: white;
  font-size: 15px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: -0.02em;
}

.hand-buyin {
  color: #60a5fa;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.hand-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 3px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
}

.queue-card,
.log-toggle {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 900;
}

.log-toggle {
  padding: 10px 12px;
  transition: border-color 160ms ease, color 160ms ease, background 160ms ease;
}

.log-toggle.active,
.toggle-group button.active {
  border-color: rgba(96, 165, 250, 0.48);
  background: rgba(37, 99, 235, 0.95);
  color: white;
}

.icon-button,
.control-button,
.play-button,
.log-toggle,
.toggle-group button,
.action-row {
  transition: transform 140ms ease, background 140ms ease, opacity 140ms ease;
}

.icon-button,
.control-button {
  display: inline-grid;
  place-items: center;
  border-radius: 11px;
  color: #cbd5e1;
}

.icon-button {
  width: 34px;
  height: 34px;
}

.control-button {
  width: 42px;
  height: 42px;
  background: rgba(255, 255, 255, 0.05);
}

.icon-button:hover,
.control-button:hover,
.log-toggle:hover,
.toggle-group button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.32;
}

.replayer-main {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  padding: clamp(8px, 1.6vw, 18px);
}

.replayer-main.with-log {
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
}

.table-panel,
.action-panel {
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 22px;
  background: rgba(2, 6, 23, 0.34);
}

.table-panel {
  position: relative;
  display: grid;
  place-items: center;
}

.loading-cover,
.empty-state {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.42);
}

.spinner {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 3px solid rgba(96, 165, 250, 0.22);
  border-bottom-color: #60a5fa;
  animation: spin 850ms linear infinite;
}

.empty-state {
  padding: 24px;
  text-align: center;
}

.empty-state h2 {
  color: white;
  font-size: clamp(20px, 3vw, 32px);
  font-weight: 950;
}

.empty-state p {
  max-width: 520px;
  margin-top: 8px;
  color: #94a3b8;
}

.action-panel {
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(18px);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.eyebrow,
.current-label,
.action-street,
.action-order {
  color: #64748b;
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.panel-header h2 {
  color: white;
  font-size: 18px;
  font-weight: 950;
}

.action-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.action-row {
  width: 100%;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 8px;
  border-radius: 14px;
  padding: 11px;
  color: #94a3b8;
  text-align: left;
}

.action-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.action-row.played {
  color: #bfdbfe;
  background: rgba(59, 130, 246, 0.08);
}

.action-row.current {
  color: white;
  background: rgba(37, 99, 235, 0.96);
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.2);
}

.action-description {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 800;
}

.control-panel {
  display: grid;
  gap: 12px;
  border-top-width: 1px;
  padding: 12px clamp(14px, 2.4vw, 28px) 14px;
}

.current-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 13px;
}

.current-action strong {
  min-width: 0;
  overflow: hidden;
  color: #dbeafe;
  font-size: 13px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-row,
.controls-row,
.playback-group,
.toggle-group {
  display: flex;
  align-items: center;
}

.progress-row {
  gap: 10px;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 900;
}

.progress-slider {
  width: 100%;
  height: 6px;
  cursor: pointer;
  appearance: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.11);
  accent-color: #3b82f6;
}

.progress-slider::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  appearance: none;
  border-radius: 999px;
  background: #60a5fa;
  box-shadow: 0 0 0 5px rgba(96, 165, 250, 0.12);
}

.controls-row {
  justify-content: space-between;
  gap: 12px;
}

.playback-group,
.toggle-group {
  gap: 7px;
}

.play-button {
  display: inline-grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border-radius: 18px;
  background: #2563eb;
  color: white;
  box-shadow: 0 18px 34px rgba(37, 99, 235, 0.24);
}

.play-button:hover {
  background: #3b82f6;
  transform: translateY(-1px);
}

.toggle-group {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.46);
  padding: 4px;
}

.toggle-group button {
  min-height: 34px;
  border-radius: 10px;
  padding: 0 11px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.toggle-group button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.toggle-icon {
  font-size: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .replayer-main.with-log {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(220px, 34vh);
  }

  .action-panel {
    border-radius: 18px;
  }
}

@media (max-width: 760px) {
  .replayer-page {
    min-height: 760px;
  }

  .replayer-header,
  .controls-row,
  .current-action {
    align-items: stretch;
    flex-direction: column;
  }

  .replayer-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .queue-card {
    grid-column: 1 / -1;
    justify-content: center;
  }

  .log-toggle {
    justify-content: center;
  }

  .playback-group,
  .toggle-group {
    justify-content: center;
    flex-wrap: wrap;
  }

  .current-action strong {
    white-space: normal;
  }
}
</style>
