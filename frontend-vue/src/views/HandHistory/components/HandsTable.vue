<template>
  <div class="table-container">
    <table class="table w-full text-xs">
      <thead class="text-gray-500 border-b border-dark-100/30">
        <tr>
          <th class="px-4 py-2 text-left cursor-pointer hover:bg-dark-300" @click="handleSort('date')">
            <div class="flex items-center gap-1">
              {{ $t('common.date') }}
              <ArrowUpDown class="w-3 h-3" :class="sortBy?.startsWith('date') ? 'text-primary-400' : 'text-gray-600'" />
            </div>
          </th>
          <th class="px-4 py-2 text-left">{{ $t('common.cards') }}</th>
          <th class="px-4 py-2 text-left">{{ $t('common.position') }}</th>
          <th class="px-4 py-2 text-right cursor-pointer hover:bg-dark-300" @click="handleSort('cev')">
            <div class="flex items-center justify-end gap-1">
              CEV
              <ArrowUpDown class="w-3 h-3" :class="sortBy?.startsWith('cev') ? 'text-primary-400' : 'text-gray-600'" />
            </div>
          </th>
          <th class="px-4 py-2 text-right cursor-pointer hover:bg-dark-300" @click="handleSort('profit')">
            <div class="flex items-center justify-end gap-1">
              {{ $t('common.result') }}
              <ArrowUpDown class="w-3 h-3" :class="sortBy?.startsWith('profit') ? 'text-primary-400' : 'text-gray-600'" />
            </div>
          </th>
          <th class="px-4 py-2 text-center w-12"></th>
        </tr>
      </thead>
      <tbody>
        <tr 
          v-for="hand in hands" 
          :key="hand.id" 
          class="hover:bg-primary-500/5 cursor-pointer border-b border-dark-100/10 last:border-0"
          :class="{ 'bg-primary-500/10': selectedHand?.id === hand.id }"
          @click="$emit('select-hand', hand.id)"
        >
          <td class="px-4 py-2 text-gray-500">
            {{ formatHandTime(hand.date_time) }}
          </td>
          <td class="px-4 py-2">
            <div class="card-row">
              <span v-for="(c, i) in parseCards(hand.hero_cards || hand.dyn_hero_cards)" :key="i" :class="['card-tile', cardTone(c)]">{{ cardRank(c) }}</span>
            </div>
          </td>
          <td class="px-4 py-2">
            <span class="px-1.5 py-0.5 rounded bg-dark-300 text-[10px] text-gray-400">
              {{ hand.hero_position || hand.dyn_hero_position }}
            </span>
          </td>
          <td :class="[
            'px-4 py-2 text-right font-mono',
            getHandCev(hand) > 0 ? 'text-emerald-500/80' : getHandCev(hand) < 0 ? 'text-rose-500/80' : 'text-gray-500'
          ]">
            {{ formatCev(getHandCev(hand)) }}
          </td>
          <td :class="[
            'px-4 py-2 text-right font-semibold',
            getHandProfit(hand) > 0 ? 'text-emerald-500/80' : getHandProfit(hand) < 0 ? 'text-rose-500/80' : 'text-gray-500'
          ]">
            {{ formatHandProfit(getHandProfit(hand)) }}
          </td>
          <td class="px-4 py-2 text-center">
            <button 
              @click.stop="$emit('replay-hand', hand.id)"
              class="p-1 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all"
              title="Replay Hand"
            >
              <Play style="width: 12px; height: 12px;" fill="currentColor" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { Play, ArrowUpDown } from 'lucide-vue-next'
import { parseCards } from '@/utils/formatters'

const props = defineProps({
  hands: Array,
  selectedHand: Object,
  sortBy: String
})
const emit = defineEmits(['select-hand', 'replay-hand', 'sort'])

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

const getHandProfit = (hand) => hand.hero_profit || hand.dyn_hero_profit || 0

const getHandCev = (hand) => {
  if (hand.ev_chips !== null && hand.ev_chips !== undefined) {
    return hand.ev_chips
  }
  return getHandProfit(hand)
}

const formatCev = (cev) => {
  if (cev === null || cev === undefined) return '—'
  return `${cev > 0 ? '+' : ''}${cev.toFixed(1)}`
}

const formatHandProfit = (profit) => {
  return `${profit > 0 ? '+' : ''}${profit.toFixed(0)}`
}

const formatHandTime = (dateTime) => {
  return new Date(dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const handleSort = (field) => {
  let newSort = `${field}_desc`
  if (props.sortBy === `${field}_desc`) newSort = `${field}_asc`
  else if (props.sortBy === `${field}_asc`) newSort = `${field}_desc`
  emit('sort', newSort)
}
</script>

<style scoped>
.card-row {
  display: flex;
  gap: 3px;
  align-items: center;
}

.card-tile {
  width: 24px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border-radius: 4px;
  color: #fff;
  font-weight: 950;
  font-size: 11px;
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
