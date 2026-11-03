<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-lg font-semibold text-gray-100">{{ $t('hand_history.title') }}</h1>
      <p class="text-gray-400 mt-1">
        {{ viewMode === 'tournaments' ? $t('hand_history.total_tournaments', { count: totalTournaments.toLocaleString() }) : $t('hand_history.total_hands', { count: totalHandsCount.toLocaleString() }) }}
      </p>
    </div>

    <Card flat class="relative z-20 flex flex-wrap items-center gap-4">
      <div class="flex bg-dark-200 rounded-lg p-1">
        <button 
            class="px-4 py-2 rounded-md"
            :class="viewMode === 'tournaments' ? 'bg-blue-600 text-white' : 'text-gray-400'"
            @click="setViewMode('tournaments')"
        >
            {{ $t('hand_history.by_tournaments') }}
        </button>
        <button 
            class="px-4 py-2 rounded-md"
            :class="viewMode === 'hands' ? 'bg-blue-600 text-white' : 'text-gray-400'"
            @click="setViewMode('hands')"
        >
            {{ $t('hand_history.by_hands') }}
        </button>
      </div>

      <select
        class="select w-36"
        :value="filters.result || ''"
        @change="handleResultFilter"
      >
        <option value="">{{ $t('common.result') }}</option>
        <option value="won">{{ $t('common.won') }}</option>
        <option value="lost">{{ $t('common.lost') }}</option>
      </select>
    </Card>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2">
        <Card :padding="'none'">
          <div v-if="isLoading" class="flex items-center justify-center py-20">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
          <template v-else-if="viewMode === 'tournaments' && tournaments.length > 0">
            <TournamentsTable 
              :tournaments="tournaments" 
              :selected-tournament="selectedTournament"
              :tournament-hands="tournamentHands"
              :is-loading-hands="isLoadingHands"
              :sort-by="filters.sortBy"
              @select-tournament="selectTournament"
              @select-hand="selectHand"
              @sort="setSortBy"
              @replay-tournament="handleReplayTournament"
              @replay-hand="handleReplayHand"
            />
            
            <div class="flex items-center justify-between p-4 border-t border-dark-100/30">
              <p class="text-sm text-gray-400">
                {{ $t('hand_history.page_info', { current: currentPage, total: totalPages || 1 }) }}
              </p>
              <div class="flex items-center gap-2">
                <button
                  @click="setPage(currentPage - 1)"
                  :disabled="currentPage === 1"
                  class="p-2 rounded-lg bg-dark-200 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft class="w-4 h-4" />
                </button>
                <button
                  @click="setPage(currentPage + 1)"
                  :disabled="currentPage >= totalPages"
                  class="p-2 rounded-lg bg-dark-200 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
            </div>
          </template>
          <template v-else-if="viewMode === 'hands' && handsList.length > 0">
            <HandsTable
              :hands="handsList"
              :selected-hand="selectedHand"
              :sort-by="filters.sortBy"
              @select-hand="selectHand"
              @replay-hand="handleReplayHand"
              @sort="setSortBy"
            />
            <!-- Pagination pour mains -->
            <div class="flex items-center justify-between p-4 border-t border-dark-100/30">
              <p class="text-sm text-gray-400">
                {{ $t('hand_history.page_info', { current: currentPage, total: totalPages || 1 }) }}
              </p>
              <div class="flex items-center gap-2">
                <button
                  @click="setPage(currentPage - 1)"
                  :disabled="currentPage === 1"
                  class="p-2 rounded-lg bg-dark-200 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft class="w-4 h-4" />
                </button>
                <button
                  @click="setPage(currentPage + 1)"
                  :disabled="currentPage >= totalPages"
                  class="p-2 rounded-lg bg-dark-200 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
            </div>
          </template>
          <div v-else class="flex flex-col items-center justify-center py-20 text-gray-400">
            <Users class="w-12 h-12 mb-4 opacity-50" />
            <p class="text-lg font-medium mb-2">{{ $t('hand_history.no_hands') }}</p>
            <p class="text-sm">{{ $t('hand_history.import_prompt') }}</p>
          </div>
        </Card>
      </div>

      <div>
        <Card :title="$t('hand_history.hand_details')">
          <div v-if="isLoadingHand" class="flex items-center justify-center py-20">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
          <HandDetails v-else-if="selectedHand" :hand="selectedHand" @close="selectHand(null)" />
          <p v-else class="text-gray-400 text-center py-8">
            {{ $t('hand_history.select_prompt') }}
          </p>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { ChevronLeft, ChevronRight, Users } from 'lucide-vue-next'
import { useHandsStore } from '@/stores/handsStore'
import { useFilterStore } from '@/stores/filterStore'
import { useReplayerStore } from '@/stores/replayerStore'
import Card from '@/components/ui/Card.vue'
import TournamentsTable from './components/TournamentsTable.vue'
import HandsTable from './components/HandsTable.vue'
import HandDetails from './components/HandDetails.vue'

const handsStore = useHandsStore()
const filterStore = useFilterStore()
const replayerStore = useReplayerStore()

const heroName = computed(() => filterStore.heroName)
const dateRange = computed(() => filterStore.dateRange)
const buyIn = computed(() => filterStore.buyIn)
const selectedSession = computed(() => filterStore.selectedSession)

// Mode vue
const viewMode = computed(() => handsStore.viewMode)
const setViewMode = (mode) => handsStore.setViewMode(mode)

const tournaments = computed(() => handsStore.tournaments)
const totalTournaments = computed(() => handsStore.totalTournaments)
const handsList = computed(() => handsStore.handsList)
const totalHandsCount = computed(() => handsStore.totalHandsCount)

const isLoading = computed(() => handsStore.isLoading)
const isLoadingHands = computed(() => handsStore.isLoadingHands)
const tournamentHands = computed(() => handsStore.tournamentHands)
const currentPage = computed(() => handsStore.currentPage)
const pageSize = computed(() => handsStore.pageSize)
const filters = computed(() => handsStore.filters)
const selectedHand = computed(() => handsStore.selectedHand)
const isLoadingHand = computed(() => handsStore.isLoadingHand)
const selectedTournament = computed(() => handsStore.selectedTournament)

const totalPages = computed(() => viewMode.value === 'tournaments' ? Math.ceil(totalTournaments.value / pageSize.value) : Math.ceil(totalHandsCount.value / pageSize.value))

const loadData = () => handsStore.loadData()
const setPage = (page) => {
    handsStore.currentPage = page
    loadData()
}
const setSortBy = (sortBy) => handsStore.setSortBy(sortBy)
const selectHand = (handId) => handsStore.selectHand(handId)
const selectTournament = (tournament) => handsStore.selectTournament(tournament)

const handleResultFilter = (e) => {
  handsStore.setFilters({ result: e.target.value || null })
}

const handleReplayTournament = async (gameId) => {
  const result = await handsStore.loadTournamentHands(gameId)
  if (result && result.success && result.data) {
    const handIds = result.data.map(h => h.id)
    replayerStore.openReplayerWindowForQueue(handIds, 0, heroName.value)
  }
}

const handleReplayHand = async (handId) => {
  replayerStore.openSingleHandReplayer(handId, heroName.value)
}

onMounted(() => {
  loadData()
})

watch([heroName, dateRange, buyIn, selectedSession, () => filters.value.result, () => filters.value.sortBy], () => {
  loadData()
})
</script>
