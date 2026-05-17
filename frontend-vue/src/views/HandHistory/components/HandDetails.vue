<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="card-row">
          <span v-for="(c, i) in parseCards(hand.hero_cards)" :key="i" :class="['card-tile', cardTone(c)]">{{ cardRank(c) }}</span>
        </div>
        <div>
          <p class="text-xs text-gray-400">{{ hand.date_time }}</p>
        </div>
      </div>
      <button @click="$emit('close')" class="btn-icon">
        <X class="w-4 h-4" />
      </button>
    </div>

    <div class="p-4 bg-dark-200 rounded-lg text-center">
      <p class="text-sm text-gray-400 mb-1">{{ $t('common.result') }}</p>
      <p :class="['text-2xl font-bold', isPositive ? 'profit-positive' : 'profit-negative']">
        {{ isPositive ? '+' : '' }}{{ profit.toFixed(2) }} {{ $t('common.chips') }}
      </p>
      <p class="text-sm text-gray-400 mt-1">
        EV: {{ ev >= 0 ? '+' : '' }}{{ ev.toFixed(2) }}
      </p>
    </div>

    <div class="space-y-2">
      <InfoRow :label="$t('common.position')" :value="hand.hero_position" />
      <InfoRow :label="'Stack'" :value="`${hand.hero_stack || 0} ${$t('common.chips')}`" />
      <InfoRow :label="$t('common.villain')" :value="villainPosition" />
      <InfoRow :label="$t('common.villain_cards')">
        <div class="card-row justify-end">
          <template v-if="villainCards !== '—'">
            <span v-for="(c, i) in parseCards(villainCards)" :key="i" :class="['card-tile', cardTone(c)]">{{ cardRank(c) }}</span>
          </template>
          <span v-else>—</span>
        </div>
      </InfoRow>
      <InfoRow :label="$t('hand_history.table.pot')" :value="`${hand.total_pot || 0} ${$t('common.chips')}`" />
      <InfoRow :label="'Multiplier'" :value="`${hand.multiplier || 1}x`" />
    </div>

    <div v-if="hand.flop || hand.turn || hand.river" class="p-4 bg-dark-200 rounded-lg">
      <p class="text-sm text-gray-400 mb-2">Board</p>
      <div class="card-row">
        <span v-for="(c, i) in parseCards(hand.flop)" :key="'flop-'+i" :class="['card-tile', cardTone(c)]">{{ cardRank(c) }}</span>
        <span v-if="hand.turn" :class="['card-tile', cardTone(hand.turn)]">{{ cardRank(hand.turn) }}</span>
        <span v-if="hand.river" :class="['card-tile', cardTone(hand.river)]">{{ cardRank(hand.river) }}</span>
      </div>
    </div>

    <div class="space-y-2">
      <ActionBlock v-if="hand.preflop_action" title="Preflop" :content="hand.preflop_action" />
      <ActionBlock v-if="hand.flop_action" title="Flop" :content="hand.flop_action" />
      <ActionBlock v-if="hand.turn_action" title="Turn" :content="hand.turn_action" />
      <ActionBlock v-if="hand.river_action" title="River" :content="hand.river_action" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { parseCards } from '@/utils/formatters'
import InfoRow from './InfoRow.vue'
import ActionBlock from './ActionBlock.vue'

const cardRank = (card = '') => {
  const clean = String(card).trim()
  return clean.length > 1 ? clean.slice(0, -1).toUpperCase() : clean.toUpperCase()
}

const cardTone = (card = '') => {
  const suit = String(card).trim().slice(-1).toLowerCase()
  if (suit === 'h') return 'heart'
  if (suit === 'd') return 'diamond'
  if (suit === 'c') return 'club'
  return 'spade'
}

const props = defineProps({
  hand: Object,
  onClose: Function
})

const profit = computed(() => props.hand?.hero_profit || 0)
const isPositive = computed(() => profit.value >= 0)

const ev = computed(() => {
  if (props.hand?.ev_chips !== null && props.hand?.ev_chips !== undefined) {
    return props.hand.ev_chips
  }
  return profit.value
})

const villain = computed(() => props.hand?.players?.find(p => !p.IsHero))
const villainPosition = computed(() => props.hand?.villain_position || villain.value?.Position || '—')
const villainCards = computed(() => props.hand?.villain_cards || villain.value?.Cards || '—')
</script>

<style scoped>
.card-row {
  display: flex;
  gap: 3px;
  align-items: center;
}

.card-row.justify-end {
  justify-content: flex-end;
}

.card-tile {
  width: 31px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  border-radius: 5px;
  color: #fff;
  font-weight: 950;
  font-size: 15px;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.26);
}

.card-tile.heart {
  background: #ef1f2d;
}

.card-tile.diamond {
  background: #2563eb;
}

.card-tile.club {
  background: #10b85f;
}

.card-tile.spade {
  background: #6b7280;
}
</style>
