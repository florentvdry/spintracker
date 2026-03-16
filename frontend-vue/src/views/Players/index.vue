<template>
  <div class="h-full flex flex-col p-6 space-y-6 overflow-hidden bg-dark-400">
    <div class="flex items-center justify-between bg-dark-300 p-4 rounded-xl border border-white/5 shadow-lg">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center border border-primary-500/20 shadow-inner">
          <Users class="w-6 h-6 text-primary-400" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-white tracking-tight">{{ $t('players.title') }}</h1>
          <p class="text-xs text-gray-500">{{ $t('players.subtitle') }}</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            :placeholder="$t('common.search')"
            v-model="searchTerm"
            @input="page = 1"
            class="pl-9 pr-4 py-2 bg-dark-400 border border-dark-200 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-primary-500 w-64"
          />
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <button
        v-for="f in ['all', 'reg', 'fish']"
        :key="f"
        @click="handleFilterChange(f)"
        :class="[
          'px-4 py-2 rounded-lg text-sm font-medium transition-all',
          filter === f 
            ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' 
            : 'bg-dark-300 text-gray-400 hover:text-white hover:bg-dark-200'
        ]"
      >
        <span v-if="f === 'all'">{{ $t('players.filter_all') }}</span>
        <span v-else-if="f === 'reg'" class="flex items-center gap-2">
          <Crown class="w-4 h-4 text-yellow-400" />
          {{ $t('players.filter_reg') }}
        </span>
        <span v-else-if="f === 'fish'" class="flex items-center gap-2">
          <Fish class="w-4 h-4 text-blue-400" />
          {{ $t('players.filter_fish') }}
        </span>
      </button>
    </div>

    <div class="flex-1 bg-dark-200 rounded-2xl shadow-2xl border border-white/5 flex flex-col min-h-0 overflow-hidden">
      <div class="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-dark-300/30">
        <div class="flex items-center gap-2">
          <Filter class="w-4 h-4 text-primary-400" />
          <h2 class="text-sm font-bold text-gray-200 uppercase tracking-widest">
            {{ $t('players.list') }} ({{ filteredPlayers.length }})
          </h2>
        </div>
      </div>

      <div class="flex-1 overflow-auto custom-scrollbar">
        <div v-if="loading" class="flex items-center justify-center h-full">
          <Loader2 class="w-8 h-8 text-primary-500 animate-spin" />
        </div>
        <table v-else class="w-full">
          <thead class="bg-dark-300/50 sticky top-0">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                {{ $t('players.player') }}
              </th>
              <th class="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                {{ $t('players.hands') }}
              </th>
              <th class="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                {{ $t('players.profit') }}
              </th>
              <th class="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                {{ $t('players.type') }}
              </th>
              <th class="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                {{ $t('players.auto_detected') }}
              </th>
              <th class="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                {{ $t('players.actions') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            <tr v-for="player in paginatedPlayers" :key="player.id" class="hover:bg-dark-300/30 transition-colors">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-dark-400 flex items-center justify-center text-xs font-bold text-gray-400">
                    {{ player.name.charAt(0).toUpperCase() }}
                  </div>
                  <span class="text-sm font-medium text-white">{{ player.name }}</span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right">
                <span class="text-sm text-gray-300">{{ (player.total_hands || 0).toLocaleString() }}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right">
                <span :class="['text-sm font-bold', (player.total_profit || 0) >= 0 ? 'text-green-400' : 'text-red-400']">
                  {{ (player.total_profit || 0) >= 0 ? '+' : '' }}{{ (player.total_profit || 0).toFixed(0) }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-center">
                <button
                  @click="handleToggleReg(player)"
                  :disabled="updatingId === player.id"
                  :class="[
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all',
                    player.is_reg 
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30' 
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                  ]"
                  :title="player.is_reg ? $t('players.mark_fish') : $t('players.mark_reg')"
                >
                  <Loader2 v-if="updatingId === player.id" class="w-3 h-3 animate-spin" />
                  <Crown v-else-if="player.is_reg" class="w-3 h-3" />
                  <Fish v-else class="w-3 h-3" />
                  {{ player.is_reg ? $t('players.is_reg') : $t('players.is_fish') }}
                </button>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-center">
                <span v-if="player.is_reg_forced" class="text-xs text-gray-500">{{ $t('players.manual') }}</span>
                <span v-else-if="player.total_hands >= 500" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                  <Crown class="w-3 h-3" />
                  Auto
                </span>
                <span v-else class="text-xs text-gray-500">-</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right">
                <div class="flex items-center justify-end gap-3">
                  <button
                    @click="handleViewHands(player)"
                    class="text-xs text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1"
                    :title="$t('players.view_hands')"
                  >
                    <Eye class="w-3 h-3" />
                    {{ $t('players.view_hands') }}
                  </button>
                  <button
                    @click="handleToggleReg(player)"
                    :disabled="updatingId === player.id"
                    :class="[
                      'text-xs font-medium transition-colors',
                      player.is_reg 
                        ? 'text-yellow-400 hover:text-yellow-300' 
                        : 'text-blue-400 hover:text-blue-300'
                    ]"
                    :title="player.is_reg ? $t('players.mark_fish') : $t('players.mark_reg')"
                  >
                    {{ player.is_reg ? $t('players.set_fish') : $t('players.set_reg') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-dark-300/30">
        <span class="text-xs text-gray-500">
          {{ $t('players.page') }} {{ page }} / {{ totalPages }}
        </span>
        <div class="flex gap-2">
          <button
            @click="page = Math.max(1, page - 1)"
            :disabled="page === 1"
            class="p-2 rounded-lg bg-dark-400 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>
          <button
            @click="page = Math.min(totalPages, page + 1)"
            :disabled="page === totalPages"
            class="p-2 rounded-lg bg-dark-400 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="selectedPlayer" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" @click.self="closeModal">
      <div class="bg-dark-200 rounded-2xl shadow-2xl border border-white/10 w-full max-w-5xl max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between p-5 border-b border-white/10 bg-dark-300/30 rounded-t-2xl">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center border border-primary-500/20">
              <Users class="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">
                {{ $t('players.hands_against') }} <span class="text-primary-400">{{ selectedPlayer.name }}</span>
              </h2>
              <p class="text-xs text-gray-400">
                {{ playerHands?.total || 0 }} {{ $t('players.total_hands') }}
                <span v-if="heroName" class="ml-2 text-primary-400">• Hero: {{ heroName }}</span>
                <span v-else class="ml-2 text-yellow-400">• Sélectionnez un héros</span>
              </p>
            </div>
          </div>
          <button
            @click="closeModal"
            class="p-2 rounded-lg hover:bg-dark-300 text-gray-400 hover:text-white transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="flex-1 overflow-auto custom-scrollbar">
          <div v-if="handsLoading && !playerHands" class="flex items-center justify-center h-64">
            <Loader2 class="w-8 h-8 text-primary-500 animate-spin" />
          </div>
          <div v-else-if="playerHands?.hands?.length > 0" class="table-container">
            <table class="table w-full">
              <thead class="bg-dark-300/50 sticky top-0 z-10">
                <tr>
                  <th class="w-10 text-center">#</th>
                  <th class="text-left cursor-pointer hover:bg-dark-300 transition-colors" @click="handleHandsSort('date')">
                    <div class="flex items-center gap-1">
                      {{ $t('common.date') }}
                      <ArrowUpDown :class="['w-3 h-3', handsSortBy?.startsWith('date') ? 'opacity-100 text-primary-400' : 'opacity-0']" />
                    </div>
                  </th>
                  <th class="text-left">{{ $t('common.cards') }}</th>
                  <th class="text-left">{{ $t('common.position') }}</th>
                  <th class="text-right">{{ $t('common.blinds') }}</th>
                  <th class="text-right cursor-pointer hover:bg-dark-300 transition-colors" @click="handleHandsSort('cev')">
                    <div class="flex items-center justify-end gap-1">
                      CEV
                      <ArrowUpDown :class="['w-3 h-3', handsSortBy?.startsWith('cev') ? 'opacity-100 text-primary-400' : 'opacity-0']" />
                    </div>
                  </th>
                  <th class="text-right cursor-pointer hover:bg-dark-300 transition-colors" @click="handleHandsSort('profit')">
                    <div class="flex items-center justify-end gap-1">
                      {{ $t('common.result') }}
                      <ArrowUpDown :class="['w-3 h-3', handsSortBy?.startsWith('profit') ? 'opacity-100 text-primary-400' : 'opacity-0']" />
                    </div>
                  </th>
                  <th class="w-12"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                <template v-for="(hand, idx) in playerHands.hands" :key="hand.id || idx">
                  <tr 
                    class="hover:bg-dark-300/30 transition-colors cursor-pointer group"
                    @click="toggleHandExpand(hand.id)"
                  >
                    <td class="text-center">
                      <ChevronDown v-if="expandedHands[hand.id]" class="w-4 h-4 text-primary-400 mx-auto" />
                      <ChevronRight v-else class="w-4 h-4 text-gray-500 mx-auto" />
                    </td>
                    <td class="text-gray-300 text-sm">
                      <div class="flex flex-col">
                        <span>{{ new Date(hand.date_time).toLocaleDateString() }}</span>
                        <span class="text-xs text-gray-500">{{ new Date(hand.date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
                      </div>
                    </td>
                    <td class="py-3">
                      <div class="flex gap-0.5">
                        <PlayingCard v-for="(card, i) in parseCards(hand.dyn_hero_cards || hand.hero_cards || '')" :key="i" :card="card" size="sm" />
                      </div>
                    </td>
                    <td>
                      <span :class="[
                        'px-2 py-1 rounded text-xs font-medium',
                        hand.opponent_position === 'BB' || hand.opponent_position === 'SB' ? 'bg-purple-500/20 text-purple-400' :
                        hand.opponent_position === 'BTN' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-dark-400 text-gray-400'
                      ]">
                        {{ hand.opponent_position }}
                      </span>
                      <span class="ml-1 text-xs text-gray-500">
                        ({{ hand.player_count === 2 ? 'HU' : hand.player_count + 'max' }})
                      </span>
                    </td>
                    <td class="text-right text-gray-400 text-sm font-mono">
                      {{ hand.blinds || '-' }}
                    </td>
                    <td :class="[
                      'text-right font-mono text-sm',
                      (hand.ev_chips || 0) > 0 ? 'text-emerald-400' : (hand.ev_chips || 0) < 0 ? 'text-rose-400' : 'text-gray-400'
                    ]">
                      {{ (hand.ev_chips || 0) > 0 ? '+' : '' }}{{ (hand.ev_chips || 0).toFixed(1) }}
                    </td>
                    <td :class="[
                      'text-right font-semibold text-sm',
                      (hand.dyn_hero_profit || hand.hero_profit || 0) > 0 ? 'text-emerald-400' : (hand.dyn_hero_profit || hand.hero_profit || 0) < 0 ? 'text-rose-400' : 'text-gray-400'
                    ]">
                      {{ (hand.dyn_hero_profit || hand.hero_profit || 0) > 0 ? '+' : '' }}{{ (hand.dyn_hero_profit || hand.hero_profit || 0).toFixed(0) }}
                    </td>
                    <td class="px-2">
                      <button 
                        @click.stop="handleOpenReplayer(hand.id)"
                        class="p-1.5 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all opacity-0 group-hover:opacity-100"
                        title="Replay Hand"
                      >
                        <Play class="w-3.5 h-3.5" fill="currentColor" />
                      </button>
                    </td>
                  </tr>

                  <tr v-if="expandedHands[hand.id]">
                    <td colSpan="8" class="p-0 bg-dark-900/30">
                      <div class="border-l-2 border-primary-500/50 ml-4 my-2">
                        <div class="p-4 space-y-3">
                          <div class="flex items-center gap-6 flex-wrap">
                            <div class="flex items-center gap-2">
                              <span class="text-xs text-gray-500">Room:</span>
                              <span class="text-xs text-gray-300 uppercase font-bold">{{ hand.room || '-' }}</span>
                            </div>
                            <div class="flex items-center gap-2">
                              <span class="text-xs text-gray-500">Buy-in:</span>
                              <span class="text-xs text-gray-300">{{ hand.buy_in ? hand.buy_in + '€' : '-' }}</span>
                            </div>
                            <div class="flex items-center gap-2">
                              <span class="text-xs text-gray-500">Table:</span>
                              <span class="text-xs text-gray-300">{{ hand.table_id || '-' }}</span>
                            </div>
                            <span v-if="hand.dyn_hero_all_in || hand.hero_all_in" class="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400">
                              ALL-IN
                            </span>
                            <span v-if="hand.went_to_showdown" class="px-2 py-0.5 rounded text-xs font-medium bg-dark-400 text-gray-400">
                              SD
                            </span>
                          </div>

                          <div v-if="hand.flop || hand.turn || hand.river" class="flex items-center gap-3">
                            <span class="text-xs text-gray-500">Board:</span>
                            <div class="flex gap-0.5">
                              <PlayingCard v-for="(card, i) in parseCards(hand.flop || '')" :key="'flop-'+i" :card="card" size="sm" />
                              <PlayingCard v-if="hand.turn" :card="hand.turn" size="sm" />
                              <PlayingCard v-if="hand.river" :card="hand.river" size="sm" />
                            </div>
                          </div>

                          <div v-if="hand.went_to_showdown" class="flex items-center gap-2 text-xs">
                            <span class="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">SD</span>
                            <span :class="(hand.dyn_hero_profit || hand.hero_profit || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'">
                              {{ (hand.dyn_hero_profit || hand.hero_profit || 0) > 0 ? $t('common.won') : $t('common.lost') }}
                            </span>
                          </div>
                          <div v-else-if="(hand.dyn_hero_profit || hand.hero_profit || 0) > 0" class="flex items-center gap-2 text-xs">
                            <span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">Fold</span>
                            <span class="text-emerald-400">{{ $t('common.won') }}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div v-else class="text-center text-gray-400 py-12">
            <Users class="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{{ $t('players.no_hands') }}</p>
          </div>

          <div v-if="playerHands && playerHands.hands?.length < playerHands.total" class="p-4 border-t border-white/5 text-center">
            <button
              @click="loadMoreHands"
              :disabled="handsLoading"
              class="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
            >
              <Loader2 v-if="handsLoading" class="w-4 h-4 animate-spin inline" />
              <span v-else>{{ $t('players.load_more') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Users, Search, Filter, Crown, Fish, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Loader2, Eye, X, Play, ArrowUpDown } from 'lucide-vue-next'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { useReplayerStore } from '@/stores/replayerStore'
import PlayingCard from '@/components/common/PlayingCard.vue'
import { parseCards } from '@/utils/formatters'

const { t } = useI18n()
const filterStore = useFilterStore()
const replayerStore = useReplayerStore()

const heroName = computed(() => filterStore.heroName)

const players = ref([])
const loading = ref(true)
const searchTerm = ref('')
const filter = ref('all')
const updatingId = ref(null)
const page = ref(1)
const selectedPlayer = ref(null)
const playerHands = ref(null)
const handsLoading = ref(false)
const handsPage = ref(1)
const handsSortBy = ref('date_desc')
const expandedHands = ref({})
const pageSize = 50

const filteredPlayers = computed(() => {
  if (!searchTerm.value) return players.value
  return players.value.filter(p => 
    p.name.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
})

const paginatedPlayers = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredPlayers.value.slice(start, start + pageSize)
})

const totalPages = computed(() => Math.ceil(filteredPlayers.value.length / pageSize))

const loadPlayers = async () => {
  loading.value = true
  try {
    const options = { 
      limit: 1000, 
      minHands: 1,
      isRegFilter: filter.value === 'all' ? null : filter.value
    }
    const result = await ipcService.getPlayers(options)
    if (result.success) {
      players.value = result.data || []
    }
  } catch (error) {
    console.error('Failed to load players:', error)
  } finally {
    loading.value = false
  }
}

const handleFilterChange = (f) => {
  filter.value = f
  page.value = 1
  loadPlayers()
}

const handleToggleReg = async (player) => {
  updatingId.value = player.id
  try {
    const newIsReg = !player.is_reg
    const result = await ipcService.updatePlayerRegStatus(player.id, newIsReg)
    if (result.success) {
      players.value = players.value.map(p => 
        p.id === player.id ? { ...p, is_reg: newIsReg, is_reg_forced: true } : p
      )
    }
  } catch (error) {
    console.error('Failed to update player reg status:', error)
  } finally {
    updatingId.value = null
  }
}

const handleViewHands = async (player) => {
  selectedPlayer.value = player
  handsPage.value = 1
  expandedHands.value = {}
  handsLoading.value = true
  try {
    const result = await ipcService.getHandsAgainstPlayer(player.name, heroName.value, 20, 1)
    if (result.success) {
      playerHands.value = result.data
    }
  } catch (error) {
    console.error('Failed to load player hands:', error)
  } finally {
    handsLoading.value = false
  }
}

const toggleHandExpand = (handId) => {
  expandedHands.value = {
    ...expandedHands.value,
    [handId]: !expandedHands.value[handId]
  }
}

const handleHandsSort = (field) => {
  let newSort = `${field}_desc`
  if (handsSortBy.value === `${field}_desc`) newSort = `${field}_asc`
  else if (handsSortBy.value === `${field}_asc`) newSort = `${field}_desc`
  handsSortBy.value = newSort
  
  if (playerHands.value?.hands) {
    const sorted = [...playerHands.value.hands].sort((a, b) => {
      let valA, valB
      switch (field) {
        case 'date':
          valA = new Date(a.date_time)
          valB = new Date(b.date_time)
          break
        case 'profit':
          valA = a.dyn_hero_profit || a.hero_profit || 0
          valB = b.dyn_hero_profit || b.hero_profit || 0
          break
        case 'cev':
          valA = a.ev_chips || 0
          valB = b.ev_chips || 0
          break
        default:
          return 0
      }
      if (newSort.endsWith('_desc')) return valB - valA
      return valA - valB
    })
    playerHands.value = { ...playerHands.value, hands: sorted }
  }
}

const loadMoreHands = async () => {
  if (!selectedPlayer.value || handsLoading.value) return
  handsLoading.value = true
  try {
    const nextPage = handsPage.value + 1
    const result = await ipcService.getHandsAgainstPlayer(selectedPlayer.value.name, heroName.value, 20, nextPage)
    if (result.success) {
      playerHands.value = {
        ...result.data,
        hands: [...(playerHands.value?.hands || []), ...result.data.hands]
      }
      handsPage.value = nextPage
    }
  } catch (error) {
    console.error('Failed to load more hands:', error)
  } finally {
    handsLoading.value = false
  }
}

const closeModal = () => {
  selectedPlayer.value = null
  playerHands.value = null
  handsPage.value = 1
}

const handleOpenReplayer = async (handId) => {
  try {
    await replayerStore.loadHand(handId)
  } catch (error) {
    console.error('Failed to open replayer:', error)
  }
}

onMounted(() => {
  loadPlayers()
})
</script>
