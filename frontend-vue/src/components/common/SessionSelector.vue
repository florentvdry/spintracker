<template>
  <div class="relative">
    <div 
      class="flex items-center gap-2 cursor-pointer bg-dark-300 border border-dark-200 rounded px-3 py-1.5 min-w-[180px] hover:border-primary-500 transition-colors"
      @click="isOpen = !isOpen"
    >
      <Zap class="w-4 h-4 text-gray-400" />
      <span class="text-sm text-gray-200 flex-1 truncate">
        {{ selectedSessionLabel }}
      </span>
      <ChevronDown class="w-4 h-4 text-gray-400" />
    </div>

    <div v-if="isOpen" class="absolute top-full mt-1 left-0 w-72 bg-dark-300 border border-dark-200 rounded shadow-xl z-50 flex flex-col max-h-[400px]">
      <div class="p-1 border-b border-dark-200">
        <div 
          class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
          :class="!filterStore.selectedSession ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
          @click="handleSessionSelect(null)"
        >
          <span>{{ $t('dashboard.filters.all') }} {{ $t('common.sessions') }}</span>
          <div v-if="!filterStore.selectedSession" class="w-2 h-2 rounded-full bg-primary-500"></div>
        </div>
      </div>
      
      <div class="overflow-y-auto flex-1 p-1">
        <div 
          v-for="(session, index) in appStore.sessions" 
          :key="index"
          class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 rounded transition-colors mb-1"
          :class="isSelected(session) ? 'bg-primary-500/10 border border-primary-500/30' : ''"
          @click="handleSessionSelect(session)"
        >
          <div class="flex items-center justify-between mb-1">
            <span :class="isSelected(session) ? 'text-primary-400 font-medium' : 'text-gray-200'">
              {{ formatDate(session.session_date, { format: 'date-only' }) }}
            </span>
            <span :class="['font-mono font-medium text-xs', session.profit >= 0 ? 'text-green-400' : 'text-red-400']">
              {{ formatCurrency(session.profit) }}
            </span>
          </div>
          <div class="flex items-center gap-3 text-[10px] text-gray-500">
            <div class="flex items-center gap-1">
              <Trophy class="w-3 h-3" />
              <span>{{ session.tournaments }}</span>
            </div>
            <div class="flex items-center gap-1">
              <Hash class="w-3 h-3" />
              <span>{{ session.hands_played }}</span>
            </div>
          </div>
        </div>
        
        <div v-if="appStore.sessions.length === 0" class="p-4 text-center text-gray-500 text-xs italic">
          {{ $t('dashboard.no_sessions') }}
        </div>
      </div>
    </div>
    <div v-if="isOpen" class="fixed inset-0 z-40" @click="isOpen = false"></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, Zap, Trophy, Hash } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { formatDate, formatCurrency } from '@/utils/formatters'

const { t } = useI18n()
const appStore = useAppStore()
const filterStore = useFilterStore()
const isOpen = ref(false)

const selectedSessionLabel = computed(() => {
  if (filterStore.dateRange === 'session' && filterStore.selectedSession) {
    return formatDate(filterStore.selectedSession.session_date, { format: 'date-only' })
  }
  return t('hand_history.sessions')
})

const isSelected = (session) => {
  return filterStore.dateRange === 'session' && 
         filterStore.selectedSession?.session_date === session.session_date
}

const handleSessionSelect = async (session) => {
  if (session === null) {
    filterStore.setSelectedSession(null)
  } else {
    filterStore.setSelectedSession(session)
  }
  isOpen.value = false
  await appStore.refreshAll()
}
</script>
