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

const showCards = computed(() => {
  const show = props.player.isHero || props.player.showCards
  console.log(`PlayerSeat: ${props.player.name}, isHero: ${props.player.isHero}, showCards: ${props.player.showCards}, finalShow: ${show}, cards: ${props.player.cards}`)
  return show
})

const cardsToShow = computed(() => {
  if (props.player.isFolded) return []
  return cards.value
})

const currentActionText = computed(() => {
  const action = store.currentAction
  if (!action || action.playerName !== props.player.name || !store.isRealAction(action)) return null
  
  if (store.viewMode === 'bb' && bbValue.value > 0 && action.amount > 0 && ['Bet', 'Raise', 'Call', 'AllIn'].includes(action.type)) {
     const formatted = formatValue(action.amount)
     // Replace the number with the formatted value in the description
     return action.description.replace(/\d+/, formatted)
  }
  return action.description
})

const positionLabel = computed(() => {
  const pos = props.player.position || ''
  if (pos.includes('BTN')) return 'BTN'
  if (pos.includes('SB')) return 'SB'
  if (pos.includes('BB')) return 'BB'
  return pos || '-'
})

const actionColorClass = computed(() => {
  const action = store.currentAction
  if (!action || action.playerName !== props.player.name) return ''

  const typeColors = {
    Fold: 'action-fold',
    Check: 'action-check',
    Call: 'action-call',
    Bet: 'action-bet',
    Raise: 'action-raise',
    AllIn: 'action-allin',
    PostSB: 'action-blind',
    PostBB: 'action-blind'
  }
  return typeColors[action.type] || ''
})
</script>

<template>
  <div
    class="player-seat"
    :class="[
      player.isFolded ? 'is-folded' : '',
      player.isAllIn ? 'is-allin' : '',
      player.isActive ? 'is-active' : '',
      !store.showFoldedPlayers && player.isFolded ? 'hidden-folded' : ''
    ]"
    :style="{ left: seat.x, top: seat.y, transform: seat.transform }"
  >
    <div v-if="player.isFolded" class="fold-badge">FOLD</div>
    <div v-if="player.isAllIn" class="allin-badge">ALL-IN</div>

    <div v-if="currentActionText" class="action-bubble" :class="[seat.actionClass, actionColorClass]">
      {{ currentActionText }}
    </div>

    <transition-group name="card-deal" appear :css="true" tag="div" class="cards-row" :class="{ invisible: player.isFolded }">
      <template v-if="showCards && cardsToShow.length > 0">
        <!-- Show face-up cards at showdown or for hero -->
        <Card 
          v-for="(card, index) in cardsToShow" 
          :key="`${player.name}-${card}-${index}`" 
          :card="card" 
          size="seat"
          :style="{ animationDelay: `${index * 150}ms` }"
        />
      </template>
      <template v-else-if="!player.isFolded">
        <!-- Show face-down cards -->
        <Card :key="`${player.name}-hidden-1`" :hidden="true" size="seat" />
        <Card :key="`${player.name}-hidden-2`" :hidden="true" size="seat" />
      </template>
    </transition-group>

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
  --seat-width: clamp(100px, 15cqw, 160px);
  position: absolute;
  width: var(--seat-width);
  display: grid;
  justify-items: center;
  gap: clamp(2px, 0.6cqw, 6px);
  z-index: 10;
  transition: opacity 180ms ease, filter 180ms ease;
}

.player-seat.is-folded {
  opacity: 0.35;
  filter: grayscale(0.8);
}

.player-seat.is-allin .seat-panel {
  border-color: rgba(245, 158, 11, 0.85);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.25), 0 16px 40px rgba(245, 158, 11, 0.15);
}

.player-seat.hidden-folded {
  display: none;
}

.player-seat.is-active .seat-panel {
  border-color: rgba(96, 165, 250, 0.85);
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.25), 0 16px 40px rgba(37, 99, 235, 0.2);
}

.cards-row {
  display: flex;
  justify-content: center;
  margin-bottom: 0;
}

.cards-row > * {
  margin-left: clamp(-10px, -1.2cqw, -4px);
}

.cards-row > *:first-child {
  margin-left: 0;
}

.seat-panel {
  width: 100%;
  min-height: clamp(48px, 6cqw, 68px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.98), rgba(9, 13, 24, 0.98));
  box-shadow: 0 18px 35px rgba(0, 0, 0, 0.38);
  padding: clamp(5px, 0.9cqw, 10px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
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
  font-size: clamp(11px, 1.4cqw, 15px);
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.stack-line {
  margin-top: 2px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  min-width: 0;
}

.stack-value {
  min-width: 0;
  color: #e5e7eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: clamp(12px, 1.5cqw, 17px);
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
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

.action-bubble.action-fold {
  background: rgba(220, 38, 38, 0.96);
  border-color: rgba(220, 38, 38, 0.35);
}

.action-bubble.action-check {
  background: rgba(107, 114, 128, 0.96);
  border-color: rgba(107, 114, 128, 0.35);
}

.action-bubble.action-call,
.action-bubble.action-bet {
  background: rgba(59, 130, 246, 0.96);
  border-color: rgba(59, 130, 246, 0.35);
}

.action-bubble.action-raise {
  background: rgba(34, 197, 94, 0.96);
  border-color: rgba(34, 197, 94, 0.35);
}

.action-bubble.action-allin {
  background: rgba(245, 158, 11, 0.96);
  border-color: rgba(245, 158, 11, 0.35);
  color: #111827;
}

.action-bubble.action-blind {
  background: rgba(139, 92, 246, 0.96);
  border-color: rgba(139, 92, 246, 0.35);
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

.fold-badge,
.allin-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  z-index: 15;
}

.fold-badge {
  background: #dc2626;
  color: white;
}

.allin-badge {
  background: #f59e0b;
  color: #111827;
}

@media (max-width: 680px) {
  .player-seat {
    --seat-width: clamp(96px, 26cqw, 132px);
  }

  .action-bubble {
    max-width: 180px;
  }
  
  .player-name {
    font-size: clamp(10px, 2.8vw, 13px);
  }
  
  .stack-value {
    font-size: clamp(11px, 2.5vw, 15px);
  }
  
  .cards-row > :deep(*) {
    margin-left: clamp(-8px, -2vw, -4px);
  }
}

.card-deal-enter-active,
.card-deal-appear-active {
  animation: cardFlip 400ms ease-out forwards;
  opacity: 0;
}

.card-deal-leave-active {
  transition: opacity 200ms ease;
}

.card-deal-enter-from,
.card-deal-appear-from {
  opacity: 0;
  transform: translateY(-20px) rotateY(90deg);
}

.card-deal-enter-to,
.card-deal-appear-to {
  opacity: 1;
  transform: translateY(0) rotateY(0);
}

@keyframes cardFlip {
  0% {
    opacity: 0;
    transform: translateY(-20px) rotateY(90deg);
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
    transform: translateY(0) rotateY(0);
  }
}
</style>
