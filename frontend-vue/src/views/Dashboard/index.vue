<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-white">{{ $t('dashboard.title') }}</h1>
        <p class="text-gray-400 mt-1">{{ $t('dashboard.subtitle') }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        :label="$t('dashboard.total_profit') + rangeLabel"
        :value="stats.total_profit || 0"
        format="profit"
        :icon="DollarSign"
      />
      <StatCard
        :label="$t('dashboard.activity') + rangeLabel"
        :value="null"
        :icon="Hash"
        :subStats="[
          { label: $t('common.tournaments'), value: stats.total_tournaments || 0, format: 'number' },
          { label: $t('common.hands'), value: stats.total_hands || 0, format: 'number' },
          { label: $t('dashboard.chips_ev_avg'), value: stats.avg_chips_ev || 0, format: 'number' }
        ]"
      />
      <StatCard
        :label="$t('dashboard.win_rate') + rangeLabel"
        :value="winRate"
        format="percent"
        :icon="Trophy"
      />
      <Card class="flex flex-col justify-center">
        <div class="flex items-start justify-between mb-2">
          <p class="stat-label">{{ $t('dashboard.cev_per_positions') }}</p>
          <div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0 -mt-1">
            <Target class="w-5 h-5 text-primary-400" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <p class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">3-Way</p>
            <div class="space-y-1">
              <div class="flex justify-between items-center text-xs p-0.5 rounded transition-colors">
                <span class="text-gray-400">BTN</span>
                <span :class="['font-mono font-medium', formatCev(stats.cev_by_position?.['3W_BTN']).isPositive ? 'text-green-500' : 'text-red-500']">
                  {{ formatCev(stats.cev_by_position?.['3W_BTN']).formatted }}
                </span>
              </div>
              
              <!-- SB Row with Tooltip -->
              <div 
                class="group relative flex justify-between items-center text-xs p-0.5 rounded hover:bg-white/5 cursor-help transition-colors"
                @mouseenter="hoveredPos = 'SB'"
                @mouseleave="hoveredPos = null"
              >
                <span class="text-gray-400">SB</span>
                <span :class="['font-mono font-medium', formatCev(stats.cev_by_position?.['3W_SB']).isPositive ? 'text-green-500' : 'text-red-500']">
                  {{ formatCev(stats.cev_by_position?.['3W_SB']).formatted }}
                </span>
                
                <!-- Tooltip SB -->
                <div v-if="hoveredPos === 'SB'" class="absolute left-full ml-2 z-50 w-32 p-2 bg-[#1a1f2e] border border-gray-700 rounded shadow-xl animate-in fade-in slide-in-from-left-1 duration-200">
                  <p class="text-[10px] text-gray-500 uppercase mb-1.5 border-b border-gray-700 pb-1">Detail SB</p>
                  <div class="space-y-1">
                    <div class="flex justify-between items-center">
                      <span class="text-[10px] text-gray-400">vs BTN</span>
                      <span :class="['text-[10px] font-mono', formatCev(stats.cev_by_position?.['3W_SB_vs_BTN']).isPositive ? 'text-green-400' : 'text-red-400']">
                        {{ formatCev(stats.cev_by_position?.['3W_SB_vs_BTN']).formatted }}
                      </span>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="text-[10px] text-gray-400">vs BB</span>
                      <span :class="['text-[10px] font-mono', formatCev(stats.cev_by_position?.['3W_SB_vs_BB']).isPositive ? 'text-green-400' : 'text-red-400']">
                        {{ formatCev(stats.cev_by_position?.['3W_SB_vs_BB']).formatted }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- BB Row with Tooltip -->
              <div 
                class="group relative flex justify-between items-center text-xs p-0.5 rounded hover:bg-white/5 cursor-help transition-colors"
                @mouseenter="hoveredPos = 'BB'"
                @mouseleave="hoveredPos = null"
              >
                <span class="text-gray-400">BB</span>
                <span :class="['font-mono font-medium', formatCev(stats.cev_by_position?.['3W_BB']).isPositive ? 'text-green-500' : 'text-red-500']">
                  {{ formatCev(stats.cev_by_position?.['3W_BB']).formatted }}
                </span>

                <!-- Tooltip BB -->
                <div v-if="hoveredPos === 'BB'" class="absolute left-full ml-2 z-50 w-32 p-2 bg-[#1a1f2e] border border-gray-700 rounded shadow-xl animate-in fade-in slide-in-from-left-1 duration-200">
                  <p class="text-[10px] text-gray-500 uppercase mb-1.5 border-b border-gray-700 pb-1">Detail BB</p>
                  <div class="space-y-1">
                    <div class="flex justify-between items-center">
                      <span class="text-[10px] text-gray-400">vs BTN</span>
                      <span :class="['text-[10px] font-mono', formatCev(stats.cev_by_position?.['3W_BB_vs_BTN']).isPositive ? 'text-green-400' : 'text-red-400']">
                        {{ formatCev(stats.cev_by_position?.['3W_BB_vs_BTN']).formatted }}
                      </span>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="text-[10px] text-gray-400">vs SB</span>
                      <span :class="['text-[10px] font-mono', formatCev(stats.cev_by_position?.['3W_BB_vs_SB']).isPositive ? 'text-green-400' : 'text-red-400']">
                        {{ formatCev(stats.cev_by_position?.['3W_BB_vs_SB']).formatted }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <p class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Heads-Up</p>
            <div class="space-y-1">
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-400">SB</span>
                <span :class="['font-mono font-medium', formatCev((stats.cev_by_position?.['HU_BTN SB'] || 0) + (stats.cev_by_position?.['HU_SB'] || 0)).isPositive ? 'text-green-500' : 'text-red-500']">
                  {{ formatCev((stats.cev_by_position?.['HU_BTN SB'] || 0) + (stats.cev_by_position?.['HU_SB'] || 0)).formatted }}
                </span>
              </div>
              <div class="flex justify-between items-center text-xs">
                <span class="text-gray-400">BB</span>
                <span :class="['font-mono font-medium', formatCev(stats.cev_by_position?.['HU_BB']).isPositive ? 'text-green-500' : 'text-red-500']">
                  {{ formatCev(stats.cev_by_position?.['HU_BB']).formatted }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card 
        :title="$t('dashboard.chip_evolution')" 
        :subtitle="$t('dashboard.profit_ev')"
        class="lg:col-span-2 h-full"
      >
        <WinrateChart v-if="heroName && stats.total_hands > 0" />
        <div v-else class="flex flex-col items-center justify-center h-[500px] text-gray-400">
          <TrendingUp class="w-12 h-12 mb-4 opacity-50" />
          <p v-if="!heroName" class="text-lg font-medium mb-2">{{ $t('dashboard.no_hero') }}</p>
          <p v-else class="text-lg font-medium mb-2">{{ $t('dashboard.no_data') }}</p>
          <p class="text-sm">{{ !heroName ? $t('dashboard.select_hero_prompt') : $t('dashboard.no_data_chart') }}</p>
        </div>
      </Card>

      <Card 
        :title="$t('dashboard.recent_sessions')"
        :subtitle="$t('dashboard.latest_games')"
        class="h-full flex flex-col"
      >
        <SessionList v-if="heroName" :sessions="sessions" />
        <div v-else class="flex flex-col items-center justify-center h-[500px] text-gray-400">
          <Zap class="w-12 h-12 mb-4 opacity-50" />
          <p class="text-lg font-medium mb-2">{{ $t('dashboard.no_sessions') }}</p>
          <p class="text-sm">{{ $t('dashboard.select_hero_sessions') }}</p>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { DollarSign, Hash, Trophy, Target, TrendingUp, Zap } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import StatCard from '@/components/ui/StatCard.vue'
import Card from '@/components/ui/Card.vue'
import WinrateChart from '@/components/charts/WinrateChart.vue'
import SessionList from './components/SessionList.vue'

const { t } = useI18n()
const appStore = useAppStore()
const filterStore = useFilterStore()

const hoveredPos = ref(null)
const heroName = computed(() => filterStore.heroName)
const dateRange = computed(() => filterStore.dateRange)
const stats = computed(() => appStore.dashboardStats || {})
const sessions = computed(() => appStore.sessions || [])

const rangeLabel = computed(() => {
  if (dateRange.value !== 'all') {
    const rangeText = dateRange.value === 'custom' ? t('common.date') : t(`dashboard.filters.${dateRange.value}`)
    return ` (${rangeText})`
  }
  return ''
})

const winRate = computed(() => {
  if (stats.value.total_tournaments > 0) {
    return ((stats.value.tournaments_won / stats.value.total_tournaments) * 100)
  }
  return 0
})

const formatCev = (value) => {
  const cev = stats.value.total_tournaments > 0 ? (value / stats.value.total_tournaments).toFixed(1) : '0'
  const numCev = parseFloat(cev)
  const formatted = numCev > 0 ? '+' + cev : cev
  return { cev, formatted, isPositive: numCev >= 0 }
}

onMounted(() => {
  if (!appStore.dashboardStats && appStore.isInitialized) {
    appStore.refreshAll()
  }
})
</script>
