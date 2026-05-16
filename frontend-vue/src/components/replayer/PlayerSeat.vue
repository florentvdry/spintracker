<script setup>
import { computed } from 'vue'
import { useReplayerStore } from '@/stores/replayerStore'
import Card from './Card.vue'

const props = defineProps({
  player: { type: Object, required: true },
  seat: { type: Object, required: true }
})

const store = useReplayerStore()

const bbValue = computed(() => {
  if (!store.handData?.blinds) return 0
  const parts = String(store.handData.blinds).split('/')
  return parts.length === 2 ? Number(parts[1]) || 0 : 0
})

const unitLabel = computed(() => (store.viewMode === 'bb' ? 'bb' : 'chips'))

const formatValue = (value) => {
  const val = Number(value || 0)
  if (store.viewMode === 'bb' && bbValue.value > 0) {
    const bb = val / bbValue.value
    return bb < 10 ? bb.toFixed(1) : Math.round(bb).toString()
  }
  return Math.round(val).toLocaleString()
}

const cards = computed(() => {
  if (!props.player.cards) return []
  return String(props.player.cards).match(/.{1,2}/g) || []
})

const showCards = computed(() => props.player.isHero || props.player.showCards)

const currentActionText = computed(() => {
  const action = store.currentAction
  if (!action || action.playerName !== props.player.name || !store.isRealAction(action)) return null
  return action.description
})

const positionLabel = computed(() => {
  const pos = props.player.position || ''
  if (pos.includes('BTN')) return 'BTN'
  if (pos.includes('SB')) return 'SB'
  if (pos.includes('BB')) return 'BB'
  return pos || '-'
})
</script>

<template>
  <div
    class="player-seat"
    :class="[
      player.isFolded ? 'is-folded' : '',
      player.isActive ? 'is-active' : ''
    ]"
    :style="{ left: seat.x, top: seat.y, transform: seat.transform }"
  >
    <div v-if="currentActionText" class="action-bubble" :class="seat.actionClass">
      {{ currentActionText }}
    </div>

    <div class="cards-row" :class="{ invisible: player.isFolded }">
      <template v-if="showCards">
        <Card v-for="(card, index) in cards" :key="`${player.name}-${card}-${index}`" :card="card" size="seat" />
      </template>
      <template v-else>
        <Card :hidden="true" size="seat" />
        <Card :hidden="true" size="seat" />
      </template>
    </div>

    <div class="seat-panel">
      <div class="seat-topline">
        <span class="position-chip">{{ positionLabel }}</span>
        <span v-if="player.position?.includes('BTN')" class="dealer-button">D</span>
      </div>

      <div class="player-name" :title="player.name">{{ player.name }}</div>

      <div class="stack-line">
        <span class="stack-value">{{ formatValue(player.currentStack) }}</span>
        <span class="stack-unit">{{ unitLabel }}</span>
      </div>
    </div>

    <div v-if="player.bet > 0" class="bet-pill" :class="seat.betClass">
      <span class="bet-dot"></span>
      <span>{{ formatValue(player.bet) }}</span>
    </div>
  </div>
</template>

<style scoped>
.player-seat {
  --seat-width: clamp(112px, 17cqw, 176px);
  position: absolute;
  width: var(--seat-width);
  display: grid;
  justify-items: center;
  gap: clamp(3px, 0.8cqw, 8px);
  z-index: 10;
  transition: opacity 180ms ease, filter 180ms ease;
}

.player-seat.is-folded {
  opacity: 0.42;
  filter: grayscale(0.7);
}

.player-seat.is-active .seat-panel {
  border-color: rgba(96, 165, 250, 0.85);
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.25), 0 16px 40px rgba(37, 99, 235, 0.2);
}

.cards-row {
  display: flex;
  justify-content: center;
  margin-bottom: -2px;
}

.cards-row > :deep(*) + :deep(*) {
  margin-left: clamp(-12px, -1.3cqw, -5px);
}

.seat-panel {
  width: 100%;
  min-height: clamp(58px, 7.5cqw, 76px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.98), rgba(9, 13, 24, 0.98));
  box-shadow: 0 18px 35px rgba(0, 0, 0, 0.38);
  padding: clamp(7px, 1.1cqw, 12px);
  overflow: hidden;
}

.seat-topline {
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 2px;
}

.position-chip,
.dealer-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  min-width: 24px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.position-chip {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.14);
  border: 1px solid rgba(96, 165, 250, 0.18);
}

.dealer-button {
  color: #111827;
  background: #f8fafc;
}

.player-name {
  width: 100%;
  color: #f8fafc;
  font-size: clamp(12px, 1.55cqw, 15px);
  font-weight: 800;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stack-line {
  margin-top: 4px;
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}

.stack-value {
  min-width: 0;
  color: #e5e7eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: clamp(13px, 1.7cqw, 17px);
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stack-unit {
  flex: none;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.action-bubble {
  position: absolute;
  z-index: 20;
  max-width: min(240px, 52vw);
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid rgba(125, 211, 252, 0.35);
  background: rgba(37, 99, 235, 0.96);
  color: white;
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.28);
  font-size: clamp(11px, 1.4cqw, 13px);
  font-weight: 800;
  line-height: 1.15;
  text-align: center;
  pointer-events: none;
}

.action-top {
  bottom: calc(100% + 8px);
}

.action-bottom {
  top: calc(100% + 8px);
}

.bet-pill {
  position: absolute;
  z-index: 12;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 118px;
  padding: 5px 8px;
  border-radius: 999px;
  border: 1px solid rgba(250, 204, 21, 0.28);
  background: rgba(2, 6, 23, 0.9);
  color: #f8fafc;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.32);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: clamp(11px, 1.35cqw, 13px);
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bet-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #facc15;
  flex: none;
}

.bet-top {
  bottom: calc(100% - 2px);
}

.bet-bottom {
  top: calc(100% - 2px);
}

.bet-left {
  right: calc(100% - 12px);
  top: 50%;
  transform: translateY(-50%);
}

.bet-right {
  left: calc(100% - 12px);
  top: 50%;
  transform: translateY(-50%);
}

@media (max-width: 680px) {
  .player-seat {
    --seat-width: clamp(96px, 26cqw, 132px);
  }

  .action-bubble {
    max-width: 180px;
  }
}
</style>
