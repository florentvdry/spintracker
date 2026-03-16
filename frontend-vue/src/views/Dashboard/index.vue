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
        :label="$t('dashboard.total_profit')"
        :value="stats.total_profit || 0"
        format="profit"
        :icon="DollarSign"
      />
      <StatCard
        :label="$t('dashboard.activity')"
        :value="null"
        :icon="Hash"
        :subStats="[
          { label: $t('common.tournaments'), value: stats.total_tournaments || 0, format: 'number' },
          { label: $t('common.hands'), value: stats.total_hands || 0, format: 'number' }
        ]"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { DollarSign, Hash } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import StatCard from '@/components/ui/StatCard.vue'

const appStore = useAppStore()

const stats = computed(() => appStore.dashboardStats || {})

onMounted(() => {
  if (!appStore.dashboardStats) {
    appStore.refreshAll()
  }
})
</script>
