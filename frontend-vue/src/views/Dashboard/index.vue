<template>
  <div class="space-y-3">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-px bg-dark-200 border border-dark-200 rounded-lg overflow-hidden">
      <StatCard
        :label="$t('dashboard.total_profit') + rangeLabel"
        :value="stats.total_profit || 0"
        format="profit"
        :icon="DollarSign"
      />
      <StatCard
        :label="$t('dashboard.win_rate') + rangeLabel"
        :value="winRate"
        format="percent"
        :icon="Trophy"
      />
      <StatCard
        :label="$t('common.tournaments')"
        :value="stats.total_tournaments || 0"
        format="number"
        :icon="Hash"
      />
      <StatCard
        :label="$t('dashboard.chips_ev_avg')"
        :value="stats.avg_chips_ev || 0"
        format="number"
        :icon="Target"
      />
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-3">
      <Card
        :title="$t('dashboard.chip_evolution')"
        :subtitle="$t('dashboard.profit_ev')"
        class="xl:col-span-2"
      >
        <WinrateChart v-if="heroName && stats.total_hands > 0" />
        <div v-else class="flex flex-col items-center justify-center h-[420px] text-gray-500">
          <TrendingUp class="w-8 h-8 mb-3 opacity-50" />
          <p v-if="!heroName" class="font-medium mb-1">{{ $t('dashboard.no_hero') }}</p>
          <p v-else class="font-medium mb-1">{{ $t('dashboard.no_data') }}</p>
          <p class="text-xs">{{ !heroName ? $t('dashboard.select_hero_prompt') : $t('dashboard.no_data_chart') }}</p>
        </div>
      </Card>

      <div class="flex flex-col gap-3 min-w-0">
        <Card padding="none" class="!p-0 overflow-hidden">
          <div class="px-4 pt-4">
            <p class="section-label">{{ $t('dashboard.cev_per_positions') }}</p>
          </div>
          <table class="w-full mt-2 text-sm">
            <tbody>
              <template v-for="group in positionGroups" :key="group.title">
                <tr class="bg-dark-300/50">
                  <td colspan="2" class="px-4 py-1 text-[11px] uppercase tracking-wider text-gray-500">{{ group.title }}</td>
                </tr>
                <tr v-for="row in group.rows" :key="row.key" class="border-t border-dark-300">
                  <td class="px-4 py-1.5" :class="row.sub ? 'pl-8 text-gray-500 text-xs' : 'text-gray-300'">{{ row.label }}</td>
                  <td class="px-4 py-1.5 text-right font-mono" :class="row.cev.isPositive ? 'text-profit-positive' : 'text-profit-negative'">{{ row.cev.formatted }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </Card>

        <Card
          :title="$t('dashboard.recent_sessions')"
          :subtitle="$t('dashboard.latest_games')"
          class="flex-1 flex flex-col min-h-[240px]"
        >
          <SessionList v-if="heroName" :sessions="sessions" />
          <div v-else class="flex flex-col items-center justify-center flex-1 text-gray-500 py-8">
            <Zap class="w-8 h-8 mb-3 opacity-50" />
            <p class="font-medium mb-1">{{ $t('dashboard.no_sessions') }}</p>
            <p class="text-xs">{{ $t('dashboard.select_hero_sessions') }}</p>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
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

const positionGroups = computed(() => {
  const c = (key) => formatCev(stats.value.cev_by_position?.[key])
  const huSb = (stats.value.cev_by_position?.["HU_BTN SB"] || 0) + (stats.value.cev_by_position?.["HU_SB"] || 0)
  return [
    {
      title: "3-Way",
      rows: [
        { key: "3W_BTN", label: "BTN", cev: c("3W_BTN") },
        { key: "3W_SB", label: "SB", cev: c("3W_SB") },
        { key: "3W_SB_vs_BTN", label: "vs BTN", cev: c("3W_SB_vs_BTN"), sub: true },
        { key: "3W_SB_vs_BB", label: "vs BB", cev: c("3W_SB_vs_BB"), sub: true },
        { key: "3W_BB", label: "BB", cev: c("3W_BB") },
        { key: "3W_BB_vs_BTN", label: "vs BTN", cev: c("3W_BB_vs_BTN"), sub: true },
        { key: "3W_BB_vs_SB", label: "vs SB", cev: c("3W_BB_vs_SB"), sub: true },
      ],
    },
    {
      title: "Heads-Up",
      rows: [
        { key: "HU_SB", label: "SB", cev: formatCev(huSb) },
        { key: "HU_BB", label: "BB", cev: c("HU_BB") },
      ],
    },
  ]
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

watch([heroName, dateRange, () => filterStore.buyIn], () => {
  appStore.refreshAll()
})
</script>
