<script setup>
import { computed } from 'vue'
import { useReplayerStore } from '@/stores/replayerStore'
import PlayerSeat from './PlayerSeat.vue'
import Card from './Card.vue'
import logoUrl from '@/assets/logo.png'

const store = useReplayerStore()

const heroIndex = computed(() => {
  const index = store.players.findIndex((player) => player.isHero)
  return index === -1 ? 0 : index
})

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

const seatLayouts = {
  2: [
    { x: '50%', y: '78%', transform: 'translate(-50%, -50%)', actionClass: 'action-top', betClass: 'bet-top' },
    { x: '50%', y: '22%', transform: 'translate(-50%, -50%)', actionClass: 'action-bottom', betClass: 'bet-bottom' }
  ],
  3: [
    { x: '50%', y: '78%', transform: 'translate(-50%, -50%)', actionClass: 'action-top', betClass: 'bet-top' },
    { x: '20%', y: '28%', transform: 'translate(-50%, -50%)', actionClass: 'action-bottom', betClass: 'bet-right' },
    { x: '80%', y: '28%', transform: 'translate(-50%, -50%)', actionClass: 'action-bottom', betClass: 'bet-left' }
  ],
  6: [
    { x: '50%', y: '78%', transform: 'translate(-50%, -50%)', actionClass: 'action-top', betClass: 'bet-top' },
    { x: '18%', y: '62%', transform: 'translate(-50%, -50%)', actionClass: 'action-top', betClass: 'bet-right' },
    { x: '18%', y: '32%', transform: 'translate(-50%, -50%)', actionClass: 'action-bottom', betClass: 'bet-right' },
    { x: '50%', y: '20%', transform: 'translate(-50%, -50%)', actionClass: 'action-bottom', betClass: 'bet-bottom' },
    { x: '82%', y: '32%', transform: 'translate(-50%, -50%)', actionClass: 'action-bottom', betClass: 'bet-left' },
    { x: '82%', y: '62%', transform: 'translate(-50%, -50%)', actionClass: 'action-top', betClass: 'bet-left' }
  ]
}

const seatEntries = computed(() => {
  const count = store.players.length
  const layout = count <= 2 ? seatLayouts[2] : count <= 3 ? seatLayouts[3] : seatLayouts[6]

  return store.players.map((player, index) => {
    const relativeIndex = (index - heroIndex.value + count) % count
    return {
      player,
      seat: layout[relativeIndex] || layout[0]
    }
  })
})

const missingBoardCards = computed(() => Math.max(0, 5 - store.board.length))

const winnerSeat = computed(() => {
  const winnerName = store.currentAction?.playerName
  if (!winnerName) return { x: '50%', y: '50%', transform: 'translate(-50%, -50%)' }
  return seatEntries.value.find((entry) => entry.player.name === winnerName)?.seat || { x: '50%', y: '50%', transform: 'translate(-50%, -50%)' }
})
</script>

<template>
  <div class="table-wrap">
    <div class="table-stage">
      <div class="ambient-glow"></div>

      <div class="table-shell">
        <div class="table-rail">
          <div class="table-felt">
            <div class="felt-gradient"></div>
            <div class="betting-line"></div>

            <div class="table-brand">
              <img :src="logoUrl" class="brand-logo" alt="SpinTracker" />
            </div>

            <div class="board-zone">
              <Card v-for="(card, index) in store.board" :key="`${card}-${index}-${store.board.length}`" :card="card" size="board" />
              <template v-if="store.board.length > 0">
                <div v-for="index in missingBoardCards" :key="`placeholder-${index}`" class="board-placeholder"></div>
              </template>
            </div>

            <div v-if="store.pot > 0" class="pot-panel">
              <span class="pot-label">Pot</span>
              <span class="pot-value">{{ formatValue(store.pot) }}</span>
              <span class="pot-unit">{{ unitLabel }}</span>
            </div>

            <div v-if="store.currentAction?.street" class="street-pill">
              {{ store.currentAction.street }}
            </div>
          </div>
        </div>
      </div>

      <PlayerSeat
        v-for="entry in seatEntries"
        :key="entry.player.name"
        :player="entry.player"
        :seat="entry.seat"
      />

      <transition name="pot-fly" appear mode="out-in">
        <div
          v-if="store.currentAction?.type === 'CollectPot'"
          :key="store.currentAction.playerName || 'pot'"
          class="winner-chip"
          :style="{ 
            left: winnerSeat.x, 
            top: winnerSeat.y, 
            transform: winnerSeat.transform 
          }"
        >
          +{{ formatValue(store.currentAction.amount) }}
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.table-wrap {
  width: min(100%, 1280px);
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(10px, 2vw, 24px);
}

.table-stage {
  container-type: inline-size;
  position: relative;
  width: 100%;
  max-width: 1180px;
  aspect-ratio: 16 / 9;
  min-height: 430px;
}

.ambient-glow {
  position: absolute;
  inset: 10%;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.16);
  filter: blur(80px);
}

.table-shell {
  position: absolute;
  inset: 15% 9% 19%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.table-rail {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: clamp(10px, 1.8cqw, 18px) solid #141820;
  border-radius: 999px;
  background: #080b10;
  box-shadow: 0 34px 80px rgba(0, 0, 0, 0.56), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.table-felt {
  position: absolute;
  inset: clamp(4px, 0.7cqw, 8px);
  overflow: hidden;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.55);
  background: #08261d;
  box-shadow: inset 0 22px 55px rgba(0, 0, 0, 0.5);
}

.felt-gradient {
  position: absolute;
  inset: 0;
  background: #0f1d1b;
}

.betting-line {
  position: absolute;
  inset: 18%;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 999px;
}

.table-brand {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  opacity: 0.1;
  pointer-events: none;
}

.brand-logo {
  width: clamp(120px, 20cqw, 240px);
}

.board-zone {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(5px, 0.8cqw, 10px);
  filter: drop-shadow(0 15px 28px rgba(0, 0, 0, 0.48));
}

.board-placeholder {
  width: clamp(36px, 6.4cqw, 66px);
  height: clamp(50px, 8.8cqw, 92px);
  border-radius: clamp(5px, 0.8cqw, 9px);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  background: rgba(2, 6, 23, 0.22);
}

.pot-panel {
  position: absolute;
  z-index: 6;
  left: 50%;
  top: 27%;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  transform: translateX(-50%);
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(2, 6, 23, 0.68);
  padding: 7px 13px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
}

.pot-label,
.pot-unit,
.street-pill {
  color: #94a3b8;
  font-size: clamp(9px, 1.15cqw, 11px);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.16em;
}

.pot-value {
  color: #f8fafc;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: clamp(17px, 2.4cqw, 28px);
  font-weight: 950;
  line-height: 1;
}

.street-pill {
  position: absolute;
  z-index: 5;
  left: 50%;
  bottom: 19%;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  padding: 5px 10px;
}

.winner-chip {
  position: absolute;
  z-index: 30;
  border-radius: 999px;
  border: 1px solid rgba(74, 222, 128, 0.48);
  background: rgba(22, 163, 74, 0.95);
  color: white;
  padding: 8px 12px;
  box-shadow: 0 18px 36px rgba(22, 163, 74, 0.28);
  font-size: clamp(12px, 1.6cqw, 15px);
  font-weight: 950;
}

.pot-fly-enter-active {
  animation: chipFlyIn 600ms ease-out forwards;
}

.pot-fly-leave-active {
  transition: opacity 300ms ease, transform 300ms ease;
}

.pot-fly-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.5);
}

.pot-fly-enter-to {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.pot-fly-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(1.2);
}

@keyframes chipFlyIn {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3) rotate(-15deg);
  }
  60% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.1) rotate(5deg);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1) rotate(0deg);
  }
}

@media (max-width: 760px) {
  .table-stage {
    aspect-ratio: 10 / 13;
    min-height: 600px;
  }

  .table-shell {
    inset: 24% 7% 25%;
  }

  .pot-panel {
    top: 31%;
  }
}
</style>
