<template>
  <div class="table-container">
    <table class="table w-full">
      <thead>
        <tr>
          <th class="w-10 text-center">#</th>
          <th class="cursor-pointer hover:bg-dark-300 transition-colors" @click="handleSort('date')">
            <div class="flex items-center gap-1">
              {{ $t('common.date') }}
              <ArrowUpDown :class="['w-3 h-3', sortBy?.startsWith('date') ? 'opacity-100 text-primary-400' : 'opacity-0 group-hover:opacity-50']" />
            </div>
          </th>
          <th class="cursor-pointer hover:bg-dark-300 transition-colors" @click="handleSort('room')">
            <div class="flex items-center gap-1">
              Room
              <ArrowUpDown :class="['w-3 h-3', sortBy?.startsWith('room') ? 'opacity-100 text-primary-400' : 'opacity-0']" />
            </div>
          </th>
          <th class="cursor-pointer hover:bg-dark-300 transition-colors" @click="handleSort('buyin')">
            <div class="flex items-center gap-1">
              Buy-in
              <ArrowUpDown :class="['w-3 h-3', sortBy?.startsWith('buyin') ? 'opacity-100 text-primary-400' : 'opacity-0']" />
            </div>
          </th>
          <th class="cursor-pointer hover:bg-dark-300 transition-colors text-right" @click="handleSort('hands')">
            <div class="flex items-center justify-end gap-1">
              {{ $t('common.hands') }}
              <ArrowUpDown :class="['w-3 h-3', sortBy?.startsWith('hands') ? 'opacity-100 text-primary-400' : 'opacity-0']" />
            </div>
          </th>
          <th class="cursor-pointer hover:bg-dark-300 transition-colors text-right" @click="handleSort('cev')">
            <div class="flex items-center justify-end gap-1">
              Avg CEV
              <ArrowUpDown :class="['w-3 h-3', sortBy?.startsWith('cev') ? 'opacity-100 text-primary-400' : 'opacity-0']" />
            </div>
          </th>
          <th class="cursor-pointer hover:bg-dark-300 transition-colors text-right" @click="handleSort('profit')">
            <div class="flex items-center justify-end gap-1">
              {{ $t('common.result') }}
              <ArrowUpDown :class="['w-3 h-3', sortBy?.startsWith('profit') ? 'opacity-100 text-primary-400' : 'opacity-0']" />
            </div>
          </th>
          <th class="w-12"></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="tourn in tournaments" :key="tourn.gameId || tourn.GameId">
          <tr
            @click="handleSelectTournament(tourn)"
            :class="[
              'cursor-pointer transition-colors hover:bg-dark-300/50',
              isSelected(tourn) && 'bg-primary-500/10'
            ]"
          >
            <td class="text-center">
              <ChevronDown v-if="isSelected(tourn)" class="w-4 h-4 text-primary-400 mx-auto" />
              <ChevronRight v-else class="w-4 h-4 text-gray-500 mx-auto" />
            </td>
            <td class="text-gray-300 text-sm">
              {{ formatDate(tourn.dateTime || tourn.DateTime) }}
            </td>
            <td>
              <span class="text-gray-400 text-xs uppercase font-bold tracking-wider">{{ tourn.room || tourn.Room }}</span>
            </td>
            <td>
              <span class="text-white font-medium">{{ tourn.buyIn || tourn.BuyIn }}€</span>
            </td>
            <td class="text-right text-gray-400 text-sm font-mono">
              {{ tourn.handCount || tourn.HandCount }}
            </td>
            <td :class="[
              'text-right font-mono text-sm',
              getCev(tourn) > 0 ? 'text-emerald-400' : getCev(tourn) < 0 ? 'text-rose-400' : 'text-gray-400'
            ]">
              {{ formatCev(getCev(tourn)) }}
            </td>
            <td :class="[
              'text-right font-semibold',
              getProfit(tourn) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            ]">
              {{ formatProfit(getProfit(tourn)) }}
            </td>
            <td class="px-2">
              <button 
                @click.stop="handleReplayTournament(tourn)"
                class="p-1.5 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all"
                title="Replay Tournament"
              >
                <Play style="width: 14px; height: 14px;" fill="currentColor" />
              </button>
            </td>
          </tr>

          <tr v-if="isSelected(tourn)">
            <td colSpan="8" class="p-0 bg-dark-900/30">
              <div class="border-l-2 border-primary-500/50 ml-4 my-2">
                <div v-if="isLoadingHands" class="p-4 text-center text-xs text-gray-500 italic">
                  {{ $t('hand_history.loading_hands') }}
                </div>
                <div v-else class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead class="text-gray-500 border-b border-dark-100/30">
                      <tr>
                        <th class="px-4 py-2 text-left">{{ $t('hand_history.time') }}</th>
                        <th class="px-4 py-2 text-left">{{ $t('common.cards') }}</th>
                        <th class="px-4 py-2 text-left">{{ $t('common.position') }}</th>
                        <th class="px-4 py-2 text-right">CEV</th>
                        <th class="px-4 py-2 text-right">{{ $t('common.result') }}</th>
                        <th class="px-4 py-2 text-center w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr 
                        v-for="hand in tournamentHands" 
                        :key="hand.id" 
                        class="hover:bg-primary-500/5 cursor-pointer border-b border-dark-100/10 last:border-0"
                        @click="handleSelectHand(hand)"
                      >
                        <td class="px-4 py-2 text-gray-500">
                          {{ formatHandTime(hand.date_time) }}
                        </td>
                        <td class="px-4 py-2">
                          <div class="flex gap-0.5">
                            <PlayingCard v-for="(c, i) in parseCards(hand.hero_cards || hand.dyn_hero_cards)" :key="i" :card="c" size="xs" />
                          </div>
                        </td>
                        <td class="px-4 py-2">
                          <span class="px-1.5 py-0.5 rounded bg-dark-300 text-[10px] text-gray-400">
                            {{ hand.hero_position || hand.dyn_hero_position }} ({{ hand.player_count === 2 ? 'HU' : '3W' }})
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
                            @click.stop="handleReplayHand(hand.id)"
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
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ChevronDown, ChevronRight, ArrowUpDown, Play } from 'lucide-vue-next'
import PlayingCard from '@/components/common/PlayingCard.vue'
import { formatDate, parseCards } from '@/utils/formatters'

const props = defineProps({
  tournaments: Array,
  selectedTournament: Object,
  tournamentHands: Array,
  isLoadingHands: Boolean,
  sortBy: String,
  onSelectTournament: Function,
  onSelectHand: Function,
  onSort: Function,
  onReplayTournament: Function,
  onReplayHand: Function
})

const isSelected = (tourn) => {
  return (props.selectedTournament?.gameId || props.selectedTournament?.GameId) === (tourn.gameId || tourn.GameId)
}

const getProfit = (tourn) => tourn.netProfit ?? tourn.NetProfit ?? 0
const getCev = (tourn) => tourn.avgCev ?? tourn.AvgCev ?? 0
const getHandProfit = (hand) => hand.hero_profit || hand.dyn_hero_profit || 0

const getHandCev = (hand) => {
  if (hand.ev_chips !== null && hand.ev_chips !== undefined) {
    return hand.ev_chips
  }
  return getHandProfit(hand)
}

const formatProfit = (profit) => {
  const isPositive = profit >= 0
  return `${isPositive ? '+' : ''}${profit.toFixed(2)}€`
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

const handleSelectTournament = (tourn) => {
  props.onSelectTournament(isSelected(tourn) ? null : tourn)
}

const handleSelectHand = (hand) => {
  props.onSelectHand(hand.id)
}

const handleReplayTournament = (tourn) => {
  props.onReplayTournament(tourn.gameId || tourn.GameId)
}

const handleReplayHand = (handId) => {
  props.onReplayHand(handId)
}

const handleSort = (field) => {
  let newSort = `${field}_desc`
  if (props.sortBy === `${field}_desc`) newSort = `${field}_asc`
  else if (props.sortBy === `${field}_asc`) newSort = `${field}_desc`
  props.onSort(newSort)
}
</script>
