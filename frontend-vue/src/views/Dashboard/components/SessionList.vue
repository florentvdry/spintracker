<template>
  <div v-if="!sessions || sessions.length === 0" class="flex-1 flex items-center justify-center text-gray-500 text-sm">
    {{ $t('dashboard.sessions_placeholder') }}
  </div>
  <div v-else class="flex-1 overflow-y-auto pr-2 space-y-3">
    <div 
      v-for="(session, index) in sessions"
      :key="index"
      @click="handleClick(session)"
      :class="[
        'p-3 rounded-lg border transition-all cursor-pointer',
        isSelected(session) 
          ? 'bg-blue-600/20 border-blue-500 shadow-lg' 
          : 'bg-dark-300/50 border-dark-200 hover:border-dark-100'
      ]"
    >
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2 text-sm text-gray-300">
          <Calendar class="w-3.5 h-3.5 text-gray-500" />
          <span>{{ formatDate(session.session_date) }}</span>
        </div>
        <span :class="['text-sm font-bold flex items-center gap-1', session.profit > 0 ? 'text-green-400' : 'text-red-400']">
          <TrendingUp v-if="session.profit > 0" class="w-3 h-3" />
          <TrendingDown v-else class="w-3 h-3" />
          {{ formatCurrency(session.profit) }}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="flex items-center gap-1.5 text-gray-400">
          <Clock class="w-3 h-3" />
          <span>{{ session.tournaments || 0 }} {{ $t('common.tournaments') }}</span>
        </div>
        <div class="flex items-center gap-1.5 text-gray-400 justify-end">
          <span>{{ session.hands_played }} {{ $t('common.hands') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Calendar, Clock, TrendingUp, TrendingDown } from 'lucide-vue-next'
import { useFilterStore } from '@/stores/filterStore'
import { useAppStore } from '@/stores/appStore'
import { formatDate, formatCurrency } from '@/utils/formatters'

const props = defineProps({
  sessions: {
    type: Array,
    default: () => []
  }
})

const filterStore = useFilterStore()
const appStore = useAppStore()

const isSelected = (session) => {
  return filterStore.dateRange.value === 'session' && 
         filterStore.selectedSession.value?.session_date === session.session_date
}

const handleClick = async (session) => {
  if (isSelected(session)) {
    filterStore.setSelectedSession(null)
  } else {
    filterStore.setSelectedSession(session)
  }
  await appStore.refreshAll()
}
</script>
