<template>
  <header class="h-16 bg-dark-400 border-b border-dark-100/30 flex items-center justify-end px-6">
    <div class="flex items-center gap-3">
      <!-- Buy-in Selector -->
      <div class="relative">
        <div 
          class="flex items-center gap-2 cursor-pointer bg-dark-300 border border-dark-200 rounded px-3 py-1.5 min-w-[120px] hover:border-primary-500 transition-colors"
          @click="showBuyInPicker = !showBuyInPicker"
        >
          <Filter class="w-4 h-4 text-gray-400" />
          <span class="text-sm text-gray-200 flex-1 truncate">
            {{ filterStore.buyIn === 'all' ? $t('dashboard.filters.all') + ' Buy-ins' : filterStore.buyIn + '€' }}
          </span>
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </div>

        <div v-if="showBuyInPicker" class="absolute top-full mt-1 left-0 w-48 bg-dark-300 border border-dark-200 rounded shadow-xl z-50 flex flex-col">
          <div class="p-1 max-h-60 overflow-y-auto">
            <div 
              class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
              :class="filterStore.buyIn === 'all' ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
              @click="handleBuyInChange('all')"
            >
              <span>All Buy-ins</span>
              <div v-if="filterStore.buyIn === 'all'" class="w-2 h-2 rounded-full bg-primary-500"></div>
            </div>
            <div 
              v-for="bi in appStore.availableBuyIns"
              :key="bi"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
              :class="filterStore.buyIn === bi.toString() ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
              @click="handleBuyInChange(bi.toString())"
            >
              <span>{{ bi }}€</span>
              <div v-if="filterStore.buyIn === bi.toString()" class="w-2 h-2 rounded-full bg-primary-500"></div>
            </div>
          </div>
        </div>
        <div v-if="showBuyInPicker" class="fixed inset-0 z-40" @click="showBuyInPicker = false"></div>
      </div>

      <!-- Date Filter -->
      <div class="relative">
        <div 
          class="flex items-center gap-2 cursor-pointer bg-dark-300 border border-dark-200 rounded px-3 py-1.5 min-w-[160px] hover:border-primary-500 transition-colors"
          @click="showDatePicker = !showDatePicker"
        >
          <Calendar class="w-4 h-4 text-gray-400" />
          <span class="text-sm text-gray-200 flex-1 truncate">
            {{ filterStore.dateRange === 'custom' 
                ? (customFrom || '...') + '-' + (customTo || '...')
                : $t('dashboard.filters.' + filterStore.dateRange) || $t('dashboard.filters.all')
            }}
          </span>
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </div>

        <div v-if="showDatePicker" class="absolute top-full mt-1 left-0 w-64 bg-dark-300 border border-dark-200 rounded shadow-xl z-50 flex flex-col">
          <div class="p-1">
            <div 
              v-for="filter in dateFilters"
              :key="filter.id"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
              :class="filterStore.dateRange === filter.id ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
              @click="handleDateFilterClick(filter.id)"
            >
              <span>{{ filter.label }}</span>
              <div v-if="filterStore.dateRange === filter.id" class="w-2 h-2 rounded-full bg-primary-500"></div>
            </div>
          </div>
          
          <div v-if="filterStore.dateRange === 'custom'" class="p-3 border-t border-dark-200 space-y-2">
            <div>
              <label class="text-xs text-gray-400 block mb-1">{{ $t('common.from') }}</label>
              <input 
                type="date" 
                v-model="customFrom"
                class="w-full bg-dark-400 border border-dark-200 rounded px-2 py-1 text-xs text-gray-200"
              />
            </div>
            <div>
              <label class="text-xs text-gray-400 block mb-1">{{ $t('common.to') }}</label>
              <input 
                type="date" 
                v-model="customTo"
                class="w-full bg-dark-400 border border-dark-200 rounded px-2 py-1 text-xs text-gray-200"
              />
            </div>
            <button 
              @click="applyCustomDateRange"
              class="w-full bg-primary-600 hover:bg-primary-500 text-white rounded px-3 py-1.5 text-xs font-medium"
            >
              {{ $t('common.apply') }}
            </button>
          </div>
        </div>
        <div v-if="showDatePicker" class="fixed inset-0 z-40" @click="showDatePicker = false"></div>
      </div>

      <!-- Hero Selector -->
      <div class="relative mr-2">
        <div 
          class="flex items-center gap-2 cursor-pointer bg-dark-300 border border-dark-200 rounded px-3 py-1.5 min-w-[180px] hover:border-primary-500 transition-colors"
          @click="isDropdownOpen = !isDropdownOpen"
        >
          <span class="text-xs text-gray-400">{{ $t('common.hero') }}:</span>
          <span class="text-sm text-gray-200 flex-1 truncate">{{ filterStore.heroName || $t('header.select_hero') }}</span>
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </div>

        <div v-if="isDropdownOpen" class="absolute top-full mt-1 right-0 w-64 bg-dark-300 border border-dark-200 rounded shadow-xl z-50 flex flex-col max-h-[400px]">
          <div class="p-2 border-b border-dark-200">
            <div class="relative">
              <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
              <input 
                type="text" 
                :placeholder="$t('common.search')" 
                class="w-full bg-dark-400 border border-dark-200 rounded pl-8 pr-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-primary-500"
                v-model="searchTerm"
                @click.stop
                autofocus
              />
            </div>
          </div>
          <div class="overflow-y-auto flex-1">
            <div 
              v-for="p in filteredPlayers" 
              :key="p.id" 
              class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
              :class="filterStore.heroName === p.name ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
              @click="handleHeroSelect(p.name)"
            >
              <div class="flex flex-col">
                <span class="font-medium">{{ p.name }}</span>
                <span class="text-xs text-gray-500">{{ p.total_hands }} {{ $t('common.hands') }}</span>
              </div>
              <div v-if="filterStore.heroName === p.name" class="w-2 h-2 rounded-full bg-primary-500"></div>
            </div>
          </div>
        </div>
        <div v-if="isDropdownOpen" class="fixed inset-0 z-40" @click="isDropdownOpen = false"></div>
      </div>
      
      <!-- Import button -->
      <button
        @click="handleImport"
        class="btn-primary flex items-center gap-2"
      >
        <Upload class="w-4 h-4" />
        <span>{{ $t('common.import') }}</span>
      </button>

      <!-- Refresh button -->
      <button
        @click="handleRefresh"
        :disabled="isRefreshing"
        class="btn-icon"
        :title="$t('common.refresh')"
      >
        <RefreshCw class="w-5 h-5" :class="{ 'animate-spin': isRefreshing }" />
      </button>

      <!-- Notifications -->
      <div class="relative">
        <button 
          class="btn-icon relative"
          @click="isNotificationsOpen = !isNotificationsOpen"
        >
          <Bell class="w-5 h-5" />
          <span v-if="unreadCount > 0" class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
            {{ unreadCount > 9 ? '9+' : unreadCount }}
          </span>
        </button>

        <div v-if="isNotificationsOpen" class="fixed inset-0 z-40" @click="isNotificationsOpen = false"></div>
        <div v-if="isNotificationsOpen" class="absolute top-full mt-1 right-0 w-80 bg-dark-300 border border-dark-200 rounded shadow-xl z-50 flex flex-col max-h-[400px]">
          <div class="p-3 border-b border-dark-200 flex items-center justify-between">
            <h3 class="font-medium text-gray-200">{{ $t('common.notifications') }}</h3>
            <button 
              v-if="unreadCount > 0"
              @click="notificationStore.markAllAsRead()"
              class="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
              <Check class="w-3 h-3" /> {{ $t('common.all_read') }}
            </button>
          </div>

          <div class="overflow-y-auto flex-1">
            <div v-if="history.length === 0" class="p-8 text-center text-gray-500 text-sm">
              {{ $t('common.no_notifications') }}
            </div>
            <div 
              v-else
              v-for="item in history"
              :key="item.id"
              class="p-3 border-b border-dark-100/10 hover:bg-dark-400 group relative"
              :class="!item.read ? 'bg-primary-500/5' : ''"
              @click="notificationStore.markAsRead(item.id)"
            >
              <div class="flex gap-3 pr-6">
                <div 
                  class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  :class="{
                    'bg-green-500': item.type === 'success',
                    'bg-red-500': item.type === 'error',
                    'bg-yellow-500': item.type === 'warning',
                    'bg-blue-500': item.type === 'info'
                  }"
                ></div>
                
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium" :class="!item.read ? 'text-gray-100' : 'text-gray-400'">
                    {{ item.title || 'Notification' }}
                  </p>
                  <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">
                    {{ item.message }}
                  </p>
                  <p class="text-[10px] text-gray-500 mt-1">
                    {{ formatDate(item.timestamp) }}
                  </p>
                </div>
              </div>

              <div class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  @click.stop="notificationStore.removeHistoryItem(item.id)"
                  class="p-1 hover:bg-dark-200 rounded text-gray-400 hover:text-red-400"
                  :title="$t('common.delete')"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="history.length > 0" class="p-2 border-t border-dark-200 bg-dark-400/50">
            <button 
              @click="notificationStore.clearHistory()"
              class="w-full py-1.5 text-xs text-center text-gray-500 hover:text-gray-300 flex items-center justify-center gap-2"
            >
              <Trash2 class="w-3 h-3" /> {{ $t('common.clear_all') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Upload, RefreshCw, Search, ChevronDown, Bell, Check, X, Trash2, Calendar, Filter } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useProgressStore } from '@/stores/progressStore'
import { ipcService } from '@/services/ipcService'
import { formatDate } from '@/utils/formatters'

const { t } = useI18n()
const appStore = useAppStore()
const filterStore = useFilterStore()
const notificationStore = useNotificationStore()
const progressStore = useProgressStore()

const isRefreshing = ref(false)
const players = ref([])
const searchTerm = ref('')
const isDropdownOpen = ref(false)
const showDatePicker = ref(false)
const showBuyInPicker = ref(false)
const isNotificationsOpen = ref(false)
const customFrom = ref(filterStore.customDateFrom || '')
const customTo = ref(filterStore.customDateTo || '')

const history = computed(() => notificationStore.history || [])
const unreadCount = computed(() => history.value.filter(n => !n.read).length)

const filteredPlayers = computed(() => 
  players.value.filter(p => 
    p.name.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
)

const dateFilters = computed(() => [
  { id: 'today', label: t('dashboard.filters.today') },
  { id: 'week', label: t('dashboard.filters.week') },
  { id: 'month', label: t('dashboard.filters.month') },
  { id: 'all', label: t('dashboard.filters.all') },
  { id: 'custom', label: t('common.custom') }
])

const LAST_AUTO_DETECTED_HERO_KEY = 'SpinTracker_lastAutoDetectedHero'

const loadPlayers = async () => {
  try {
    const res = await ipcService.getPlayers({ limit: 500, minHands: 1 })
    if (res.success) {
      players.value = res.data
    }
  } catch (e) {
    // Silent error
  }
}

onMounted(async () => {
  await loadPlayers()
})

watch(() => [filterStore.heroName, filterStore.customDateFrom, filterStore.customDateTo], () => {
  customFrom.value = filterStore.customDateFrom || ''
  customTo.value = filterStore.customDateTo || ''
})

watch(() => [filterStore.heroName, appStore.dashboardStats, () => players.value.length], () => {
  if (!filterStore.heroName?.value && players.value.length > 0) {
    const best = players.value.reduce((prev, current) => 
      (prev.total_hands > current.total_hands) ? prev : current
    )
    
    if (best && best.total_hands > 0) {
      const lastAutoDetected = localStorage.getItem(LAST_AUTO_DETECTED_HERO_KEY)
      const shouldShowNotification = lastAutoDetected !== best.name
      
      filterStore.setHeroName(best.name)
      localStorage.setItem(LAST_AUTO_DETECTED_HERO_KEY, best.name)
      
      if (shouldShowNotification) {
        notificationStore.addNotification({
          type: 'info',
          title: t('header.hero_detected'),
          message: t('header.hero_selected_auto', { name: best.name }),
          duration: 5000
        })
      }
      
      appStore.refreshAll()
    }
  }
}, { immediate: true })

const handleBuyInChange = (buyIn) => {
  filterStore.setBuyIn(buyIn)
  showBuyInPicker.value = false
  appStore.refreshAll()
}

const handleDateFilterClick = (filterId) => {
  if (filterId === 'custom') {
    filterStore.setDateRange('custom')
  } else {
    filterStore.setDateRange(filterId)
    showDatePicker.value = false
    appStore.refreshAll()
  }
}

const applyCustomDateRange = () => {
  filterStore.setCustomDateRange(customFrom.value, customTo.value)
  showDatePicker.value = false
  appStore.refreshAll()
}

const handleHeroSelect = (heroName) => {
  filterStore.setHeroName(heroName)
  isDropdownOpen.value = false
  appStore.refreshAll()
}

const handleImport = async () => {
  const unsubscribe = ipcService.onImportProgress(({ percent, handsImported, handsSkipped, totalHands, message }) => {
    if (message) {
      progressStore.updateProgress({
        progress: percent,
        message: message,
      })
    } else if (typeof handsImported === 'number') {
      let statusMsg = `${handsImported} ${t('common.hands')}`
      if (handsSkipped > 0) statusMsg += ` (+${handsSkipped} ${t('common.skipped')})`
      if (totalHands) statusMsg += ` / ${totalHands}`

      progressStore.updateProgress({
        progress: percent,
        message: statusMsg,
      })
    }
  })

  progressStore.startProgress({
    title: t('header.import_hands'),
    message: t('header.calculating'),
  })

  try {
    const result = await ipcService.importHandHistory()
    progressStore.finishProgress()
    unsubscribe()

    if (result.success) {
      notificationStore.addNotification({
        type: 'success',
        title: t('header.import_success'),
        message: t('header.import_stats', { 
          hands: result.handsImported, 
          skipped: result.handsSkipped || 0,
          files: result.filesProcessed 
        }),
      })
      await new Promise(resolve => setTimeout(resolve, 500))
      await appStore.refreshAll()
      await loadPlayers()
    } else if (result.message !== 'Import cancelled') {
      notificationStore.addNotification({
        type: 'error',
        title: t('header.import_error'),
        message: result.message,
      })
    }
  } catch (error) {
    progressStore.finishProgress()
    unsubscribe()
    notificationStore.addNotification({
      type: 'error',
      title: t('common.error'),
      message: error.message,
    })
  }
}

const handleRefresh = async () => {
  isRefreshing.value = true
  await appStore.refreshAll()
  isRefreshing.value = false
  notificationStore.addNotification({
    type: 'info',
    message: t('header.data_refreshed'),
  })
}
</script>
