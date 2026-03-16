<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">{{ $t('hand_history.title') }}</h1>
      <p class="text-gray-400 mt-1">
        {{ $t('hand_history.total_tournaments', { count: totalTournaments.toLocaleString() }) }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useHandsStore } from '@/stores/handsStore'
import { useFilterStore } from '@/stores/filterStore'

const handsStore = useHandsStore()
const filterStore = useFilterStore()

const tournaments = computed(() => handsStore.tournaments)
const totalTournaments = computed(() => handsStore.totalTournaments)
const isLoading = computed(() => handsStore.isLoading)

onMounted(() => {
  handsStore.loadTournaments()
})

watch(() => [
  filterStore.heroName,
  filterStore.dateRange,
  filterStore.customDateFrom,
  filterStore.customDateTo,
  filterStore.buyIn,
  filterStore.selectedSession
], () => {
  handsStore.loadTournaments()
})
</script>
