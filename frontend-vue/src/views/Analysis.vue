<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Analyse</h1>
      <p class="text-gray-400 mt-1">Analysez votre jeu</p>
    </div>

    <div v-if="!heroName" class="text-center text-gray-500 py-8">
      Entrez un nom de héros pour voir les analyses
    </div>

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-dark-800 rounded-lg p-4 border border-dark-700">
          <h3 class="text-lg font-semibold mb-4">CEV par position</h3>
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-gray-400">CEV Global</span>
              <span class="font-mono text-primary-400 text-xl">{{ cevStats?.total_cev || 0 }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">CEV / Tournoi</span>
              <span class="font-mono text-white text-xl">{{ cevStats?.cev_per_tournament || 0 }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">HU SB</span>
              <span class="font-mono" :class="(cevStats?.hu_sb_cev || 0) >= 0 ? 'text-green-500' : 'text-red-500'">
                {{ cevStats?.hu_sb_cev || 0 }}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">HU BB</span>
              <span class="font-mono" :class="(cevStats?.hu_bb_cev || 0) >= 0 ? 'text-green-500' : 'text-red-500'">
                {{ cevStats?.hu_bb_cev || 0 }}
              </span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-gray-400">BTN</span>
              <span class="font-mono" :class="(cevStats?.btn_cev || 0) >= 0 ? 'text-green-500' : 'text-red-500'">
                {{ cevStats?.btn_cev || 0 }}
              </span>
            </div>
          </div>
        </div>

        <div class="bg-dark-800 rounded-lg p-4 border border-dark-700">
          <h3 class="text-lg font-semibold mb-4">Statistiques</h3>
          <div class="space-y-3">
            <div class="flex justify-between">
              <span class="text-gray-400">Total mains</span>
              <span class="text-white">{{ stats?.total_hands || 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Total tournois</span>
              <span class="text-white">{{ stats?.total_tournaments || 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Profit total</span>
              <span :class="(stats?.total_profit || 0) >= 0 ? 'text-green-500' : 'text-red-500'">
                {{ stats?.total_profit || 0 }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Buy-in moyen</span>
              <span class="text-white">{{ stats?.avg_buy_in || 0 }}€</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useFilterStore } from '../stores/filter'

const appStore = useAppStore()
const filterStore = useFilterStore()

const heroName = computed(() => filterStore.heroName)
const stats = computed(() => appStore.dashboardStats)
const cevStats = computed(() => appStore.cevStats)

onMounted(() => {
  if (heroName.value) {
    const { dateFrom, dateTo } = filterStore.getDateRangeParams
    appStore.refreshAll(
      heroName.value,
      dateFrom,
      dateTo,
      filterStore.buyIn === 'all' ? null : parseFloat(filterStore.buyIn)
    )
  }
})
</script>
