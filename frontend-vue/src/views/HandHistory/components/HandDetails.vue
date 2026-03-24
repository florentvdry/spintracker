<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex gap-1">
          <PlayingCard v-for="(c, i) in parseCards(hand.hero_cards)" :key="i" :card="c" size="sm" />
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
        <div class="flex gap-0.5 justify-end">
          <PlayingCard v-for="(c, i) in parseCards(villainCards)" :key="i" :card="c" size="xs" />
          <span v-if="villainCards === '—'">—</span>
        </div>
      </InfoRow>
      <InfoRow :label="$t('hand_history.table.pot')" :value="`${hand.total_pot || 0} ${$t('common.chips')}`" />
      <InfoRow :label="'Multiplier'" :value="`${hand.multiplier || 1}x`" />
    </div>

    <div v-if="hand.flop || hand.turn || hand.river" class="p-4 bg-dark-200 rounded-lg">
      <p class="text-sm text-gray-400 mb-2">Board</p>
      <div class="flex gap-1">
        <PlayingCard v-for="(c, i) in parseCards(hand.flop)" :key="'flop-'+i" :card="c" size="sm" />
        <PlayingCard v-if="hand.turn" :card="hand.turn" size="sm" />
        <PlayingCard v-if="hand.river" :card="hand.river" size="sm" />
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
import PlayingCard from '@/components/common/PlayingCard.vue'
import { parseCards } from '@/utils/formatters'
import InfoRow from './InfoRow.vue'
import ActionBlock from './ActionBlock.vue'

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
