<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-white">Dashboard</h1>
        <p class="text-gray-400 mt-1">Vue d'ensemble de vos performances</p>
      </div>
    </div>

    <div v-if="isLoading && !stats" class="flex items-center justify-center h-64">
      <div class="text-gray-400">Chargement...</div>
    </div>

    <div v-else-if="!heroName" class="flex items-center justify-center h-64">
      <div class="text-center">
        <p class="text-gray-400 text-lg">Entrez un nom de héros pour voir les statistiques</p>
      </div>
    </div>

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Profit total"
          :value="stats?.total_profit || 0"
          format="profit"
          icon="DollarSign"
        />
        <StatCard
          label="Tournois"
          :value="stats?.total_tournaments || 0"
          format="number"
          icon="Trophy"
          :subStats="[
            { label: 'Mains', value: stats?.total_hands || 0 },
            { label: 'Buy-in avg', value: stats?.avg_buy_in || 0 }
          ]"
        />
        <StatCard
          label="Win Rate"
          :value="winRate"
          format="percent"
          icon="TrendingUp"
        />
        <div class="bg-dark-800 rounded-lg p-4 border border-dark-700">
          <div class="flex items-start justify-between mb-2">
            <p class="text-sm text-gray-400">CEV par position</p>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">3-Way</p>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-400">BTN</span>
                <span :class="(cevStats?.btn_cev || 0) >= 0 ? 'text-green-500' : 'text-red-500'" class="font-mono">
                  {{ cevStats?.btn_cev || 0 }}
                </span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-400">SB</span>
                <span :class="(cevStats?.hu_sb_cev || 0) >= 0 ? 'text-green-500' : 'text-red-500'" class="font-mono">
                  {{ cevStats?.hu_sb_cev || 0 }}
                </span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-400">BB</span>
                <span :class="(cevStats?.hu_bb_cev || 0) >= 0 ? 'text-green-500' : 'text-red-500'" class="font-mono">
                  {{ cevStats?.hu_bb_cev || 0 }}
                </span>
              </div>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">CEV/Tournoi</p>
              <div class="text-2xl font-bold text-primary-400">
                {{ cevStats?.cev_per_tournament || 0 }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-dark-800 rounded-lg p-4 border border-dark-700">
          <h3 class="text-lg font-semibold mb-4">Évolution des gains</h3>
          <div v-if="chartData.length > 0" class="h-64">
            <WinrateChart :data="chartData" />
          </div>
          <div v-else class="h-64 flex items-center justify-center text-gray-500">
            Pas de données pour le graphique
          </div>
        </div>

        <div class="bg-dark-800 rounded-lg p-4 border border-dark-700">
          <h3 class="text-lg font-semibold mb-4">CEV Détails</h3>
          <div class="space-y-3">
            <div class="flex justify-between">
              <span class="text-gray-400">Total CEV</span>
              <span class="font-mono text-white">{{ cevStats?.total_cev || 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">CEV/Tournoi</span>
              <span class="font-mono text-primary-400">{{ cevStats?.cev_per_tournament || 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Tournois</span>
              <span class="font-mono text-white">{{ cevStats?.tournaments_count || 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Chips gagnés</span>
              <span class="font-mono text-white">{{ cevStats?.chips_won || 0 }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { useFilterStore } from '../stores/filter'
import StatCard from '../components/StatCard.vue'
import WinrateChart from '../components/WinrateChart.vue'

const appStore = useAppStore()
const filterStore = useFilterStore()

const heroName = computed(() => filterStore.heroName)
const isLoading = computed(() => appStore.isLoading)
const stats = computed(() => appStore.dashboardStats)
const cevStats = computed(() => appStore.cevStats)
const chartData = computed(() => appStore.chartData)

const winRate = computed(() => {
  if (!stats.value || !stats.value.total_tournaments) return 0
  return 0
})

function loadData() {
  if (heroName.value) {
    const { dateFrom, dateTo } = filterStore.getDateRangeParams
    appStore.refreshAll(
      heroName.value,
      dateFrom,
      dateTo,
      filterStore.buyIn === 'all' ? null : parseFloat(filterStore.buyIn)
    )
  }
}

onMounted(() => {
  loadData()
})

watch(heroName, () => {
  loadData()
})
</script>
