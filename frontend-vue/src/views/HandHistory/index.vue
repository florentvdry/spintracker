<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">{{ $t('hand_history.title') }}</h1>
      <p class="text-gray-400 mt-1">
        {{ $t('hand_history.total_tournaments', { count: totalTournaments.toLocaleString() }) }}
      </p>
    </div>

    <Card flat class="flex flex-wrap items-center gap-4">
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
          <template v-else-if="tournaments.length > 0">
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
import HandDetails from './components/HandDetails.vue'

const handsStore = useHandsStore()
const filterStore = useFilterStore()
const replayerStore = useReplayerStore()

const heroName = computed(() => filterStore.heroName)
const dateRange = computed(() => filterStore.dateRange)
const buyIn = computed(() => filterStore.buyIn)
const selectedSession = computed(() => filterStore.selectedSession)

const tournaments = computed(() => handsStore.tournaments)
const totalTournaments = computed(() => handsStore.totalTournaments)
const isLoading = computed(() => handsStore.isLoading)
const isLoadingHands = computed(() => handsStore.isLoadingHands)
const tournamentHands = computed(() => handsStore.tournamentHands)
const currentPage = computed(() => handsStore.currentPage)
const pageSize = computed(() => handsStore.pageSize)
const filters = computed(() => handsStore.filters)
const selectedHand = computed(() => handsStore.selectedHand)
const isLoadingHand = computed(() => handsStore.isLoadingHand)
const selectedTournament = computed(() => handsStore.selectedTournament)

const totalPages = computed(() => Math.ceil(totalTournaments.value / pageSize.value))

const loadTournaments = () => handsStore.loadTournaments()
const setPage = (page) => handsStore.setPage(page)
const setSortBy = (sortBy) => handsStore.setSortBy(sortBy)
const selectHand = (handId) => handsStore.selectHand(handId)
const selectTournament = (tournament) => handsStore.selectTournament(tournament)
const loadTournamentHands = (gameId) => handsStore.loadTournamentHands(gameId)

const handleResultFilter = (e) => {
  handsStore.setFilters({ result: e.target.value || null })
}

const handleReplayTournament = async (gameId) => {
  const result = await loadTournamentHands(gameId)
  if (result && result.success && result.data) {
    const handIds = result.data.map(h => h.id)
    replayerStore.loadHandQueue(handIds, heroName.value)
  }
}

const handleReplayHand = async (handId) => {
  replayerStore.loadHandQueue([handId], heroName.value)
}

onMounted(() => {
  loadTournaments()
})

watch([heroName, dateRange, buyIn, selectedSession, () => filters.value.result, () => filters.value.sortBy], () => {
  loadTournaments()
})
</script>
