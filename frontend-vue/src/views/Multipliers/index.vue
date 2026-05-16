<template>
  <div class="multipliers-page p-6 space-y-6">
    <header class="flex items-center justify-between bg-dark-400 border border-dark-100/30 p-6 rounded-2xl shadow-xl shadow-black/20">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 flex items-center justify-center rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-400">
          <Hash class="w-6 h-6" />
        </div>
        <div>
          <h1 class="text-2xl font-black text-white leading-tight tracking-tight uppercase">
            {{ $t('multipliers.title') }}
          </h1>
          <p class="text-dark-100 text-sm font-medium">
            {{ $t('multipliers.subtitle') }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-4 bg-dark-500/50 p-2 rounded-xl border border-dark-100/20">
        <div class="px-4 py-2 text-center border-r border-dark-100/20">
          <span class="block text-[10px] font-black text-dark-100 uppercase tracking-widest leading-none mb-1">Total Games</span>
          <span class="text-lg font-black text-white leading-none">{{ totalGames }}</span>
        </div>
        <div class="px-4 py-2 text-center">
          <span class="block text-[10px] font-black text-dark-100 uppercase tracking-widest leading-none mb-1">Global Win Rate</span>
          <span :class="['text-lg font-black leading-none', globalWinRate >= 38 ? 'text-green-400' : 'text-yellow-400']">
            {{ globalWinRate.toFixed(2) }}%
          </span>
        </div>
      </div>
    </header>

    <div v-if="loading" class="flex flex-col items-center justify-center py-20 bg-dark-400 rounded-2xl border border-dark-100/30">
      <Loader2 class="w-10 h-10 text-primary-500 animate-spin mb-4" />
      <span class="text-dark-100 font-bold uppercase tracking-widest text-sm">{{ $t('common.loading') }}</span>
    </div>

    <div v-else-if="stats.length === 0" class="flex flex-col items-center justify-center py-20 bg-dark-400 rounded-2xl border border-dark-100/30 text-center">
      <div class="w-16 h-16 bg-dark-100/10 rounded-full flex items-center justify-center mb-4">
        <Inbox class="w-8 h-8 text-dark-100/40" />
      </div>
      <h3 class="text-white font-bold text-lg">{{ $t('common.no_data') }}</h3>
      <p class="text-dark-100 text-sm mt-1 max-w-xs">{{ $t('dashboard.no_data_chart') }}</p>
    </div>

    <div v-else class="bg-dark-400 rounded-2xl border border-dark-100/30 shadow-xl shadow-black/20 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-dark-500/50">
              <th class="px-6 py-4 text-[11px] font-black text-dark-100 uppercase tracking-widest border-b border-dark-100/20">
                {{ $t('multipliers.multiplier') }}
              </th>
              <th class="px-6 py-4 text-[11px] font-black text-dark-100 uppercase tracking-widest border-b border-dark-100/20 text-center">
                {{ $t('multipliers.total') }}
              </th>
              <th class="px-6 py-4 text-[11px] font-black text-dark-100 uppercase tracking-widest border-b border-dark-100/20 text-center">
                {{ $t('multipliers.percentage') }}
              </th>
              <th class="px-6 py-4 text-[11px] font-black text-dark-100 uppercase tracking-widest border-b border-dark-100/20 text-center">
                {{ $t('multipliers.won') }}
              </th>
              <th class="px-6 py-4 text-[11px] font-black text-dark-100 uppercase tracking-widest border-b border-dark-100/20 text-center">
                {{ $t('multipliers.lost') }}
              </th>
              <th class="px-6 py-4 text-[11px] font-black text-dark-100 uppercase tracking-widest border-b border-dark-100/20 text-right">
                {{ $t('multipliers.win_rate') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dark-100/10">
            <tr v-for="s in stats" :key="s.multiplier" class="hover:bg-white/5 transition-colors group">
              <td class="px-6 py-5">
                <div class="flex items-center gap-3">
                  <div :class="['w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg shadow-inner', getMultiplierColor(s.multiplier)]">
                    x{{ s.multiplier }}
                  </div>
                </div>
              </td>
              <td class="px-6 py-5 text-center text-white font-bold text-lg">
                {{ s.totalCount }}
              </td>
              <td class="px-6 py-5 text-center">
                <div class="flex flex-col items-center gap-1">
                  <span class="text-dark-50 font-black text-base">{{ s.percentageOfTotal }}%</span>
                  <div class="w-20 h-1 bg-dark-500 rounded-full overflow-hidden">
                    <div class="h-full bg-primary-500/60" :style="{ width: s.percentageOfTotal + '%' }"></div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-5 text-center">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-green-400 font-bold text-sm border border-green-500/20">
                  <TrendingUp class="w-3.5 h-3.5" />
                  {{ s.winCount }}
                </span>
              </td>
              <td class="px-6 py-5 text-center">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-400 font-bold text-sm border border-red-500/20">
                  <TrendingDown class="w-3.5 h-3.5" />
                  {{ s.lossCount }}
                </span>
              </td>
              <td class="px-6 py-5 text-right">
                <div class="flex flex-col items-end gap-1">
                  <span :class="['text-xl font-black', getWinRateColor(s.winPercentage, s.multiplier)]">
                    {{ s.winPercentage.toFixed(2) }}%
                  </span>
                  <span class="text-[10px] text-dark-100 font-black uppercase tracking-tighter opacity-60">Success rate</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { Hash, Loader2, TrendingUp, TrendingDown, Inbox } from 'lucide-vue-next'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { useAppStore } from '@/stores/appStore'

const filterStore = useFilterStore()
const appStore = useAppStore()
const loading = ref(true)
const stats = ref([])

const totalGames = computed(() => {
  return stats.value.reduce((acc, s) => acc + s.totalCount, 0)
})

const globalWinRate = computed(() => {
  const totalWins = stats.value.reduce((acc, s) => acc + s.winCount, 0)
  if (totalGames.value === 0) return 0
  return (totalWins / totalGames.value) * 100
})

const getMultiplierColor = (multiplier) => {
  if (multiplier >= 100) return 'bg-yellow-500 text-black'
  if (multiplier >= 25) return 'bg-purple-600 text-white'
  if (multiplier >= 10) return 'bg-blue-600 text-white'
  if (multiplier >= 4) return 'bg-green-600 text-white'
  return 'bg-dark-500 text-dark-50 border border-dark-100/20'
}

const getWinRateColor = (winRate, multiplier) => {
  // Typical winning win rates for Spins:
  // x2: ~36-38%+ is winning
  // We'll use a simple logic: green if above theoretical win rate to break even
  // For 3-max: 1/3 = 33.33% is break even without rake.
  // With rake, around 36-38% is good.
  if (winRate >= 38) return 'text-green-400'
  if (winRate >= 35) return 'text-yellow-400'
  return 'text-red-400'
}

const fetchStats = async () => {
  loading.value = true
  try {
    const { dateFrom, dateTo } = filterStore.getDateRangeParams()
    const options = {
      heroName: filterStore.heroName,
      dateFrom,
      dateTo
    }
    const res = await ipcService.getMultiplierStats(options)
    if (res.success) {
      stats.value = res.data || []
    }
  } catch (error) {
    console.error('Failed to fetch multiplier stats:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStats()
})

watch([() => filterStore.heroName, () => filterStore.dateRange, () => filterStore.customDateFrom, () => filterStore.customDateTo, () => appStore.lastUpdate], () => {
  fetchStats()
})
</script>

<style scoped>
.multipliers-page {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.gradient-text {
  background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>
