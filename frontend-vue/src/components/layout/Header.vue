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
            {{ dateFilterLabel }}
          </span>
          <ChevronDown class="w-4 h-4 text-gray-400" />
        </div>

        <div v-if="showDatePicker" class="absolute top-full mt-1 left-0 w-72 bg-dark-300 border border-dark-200 rounded shadow-xl z-50 flex flex-col">
          <div class="p-1">
            <div
              v-for="filter in mainDateFilters"
              :key="filter.id"
              class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
              :class="filterStore.dateRange === filter.id ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
              @click="handleDateFilterClick(filter.id)"
            >
              <span>{{ filter.label }}</span>
              <div v-if="filterStore.dateRange === filter.id" class="w-2 h-2 rounded-full bg-primary-500"></div>
            </div>

            <div class="relative">
              <div class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
                   :class="filterStore.dateRange === 'session' ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
                   @mouseenter="openSessionDropdown()"
                   @mouseleave="scheduleSessionClose()"
                   @click="showSessionDropdown = !showSessionDropdown">
                <span>{{ $t('common.sessions') }}</span>
                <div class="flex items-center gap-1">
                  <div v-if="filterStore.dateRange === 'session'" class="w-2 h-2 rounded-full bg-primary-500"></div>
                  <ChevronRight class="w-3.5 h-3.5 text-gray-500" />
                </div>
              </div>

              <div v-if="showSessionDropdown"
                   class="absolute left-full top-0 ml-1 w-72 bg-dark-300 border border-dark-200 rounded shadow-xl z-[60]"
                   @mouseenter="cancelSessionClose()"
                   @mouseleave="scheduleSessionClose()">
                <div class="p-1 max-h-72 overflow-y-auto">
                  <div v-for="session in recentSessions" :key="session.session_date"
                       class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 rounded transition-colors mb-1"
                       :class="isSelectedSession(session) ? 'bg-primary-500/10 border border-primary-500/30' : ''"
                       @click="handleSessionSelect(session)">
                    <div class="flex items-center justify-between mb-1">
                      <div class="flex items-center gap-1.5">
                        <span :class="isSelectedSession(session) ? 'text-primary-400 font-medium' : 'text-gray-200'">
                          {{ formatDate(session.session_date, { format: 'date-only' }) }}
                        </span>
                        <span class="text-xs text-gray-500">{{ formatTime(session.session_date) }}→{{ formatTime(session.session_end) }}</span>
                      </div>
                      <span class="font-mono font-medium text-xs" :class="session.profit >= 0 ? 'text-green-400' : 'text-red-400'">
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
                  <div v-if="recentSessions.length === 0" class="text-center text-gray-500 text-xs italic py-4">
                    {{ $t('dashboard.no_sessions') }}
                  </div>
                </div>
              </div>
            </div>

            <div class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
                 :class="filterStore.dateRange === 'custom' ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
                 @click="handleDateFilterClick('custom')">
              <span>{{ $t('common.custom') }}</span>
              <div v-if="filterStore.dateRange === 'custom'" class="w-2 h-2 rounded-full bg-primary-500"></div>
            </div>
          </div>

          <div v-if="filterStore.dateRange === 'custom'" class="p-3 border-t border-dark-200 space-y-2">
            <div>
              <label class="text-xs text-gray-400 block mb-1">{{ $t('common.from') }}</label>
              <input
                type="datetime-local"
                v-model="customFrom"
                class="w-full bg-dark-400 border border-dark-200 rounded px-2 py-1 text-xs text-gray-200"
              />
            </div>
            <div>
              <label class="text-xs text-gray-400 block mb-1">{{ $t('common.to') }}</label>
              <input
                type="datetime-local"
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
            <!-- Aliases Section -->
            <div v-if="filteredAliases.length > 0" class="px-2 py-1 bg-dark-400/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              {{ $t('common.aliases') || 'Aliases' }}
            </div>
            <div 
              v-for="a in filteredAliases" 
              :key="'alias-' + a.id" 
              class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
              :class="filterStore.heroName === a.name ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
              @click="handleHeroSelect(a.name)"
            >
              <div class="flex items-center gap-2">
                <Users class="w-4 h-4 text-primary-400" />
                <div class="flex flex-col">
                  <span class="font-medium">{{ a.name }}</span>
                  <span class="text-xs text-gray-500">{{ a.players.length }} {{ $t('common.players') || 'Players' }}</span>
                </div>
              </div>
              <div v-if="filterStore.heroName === a.name" class="w-2 h-2 rounded-full bg-primary-500"></div>
            </div>

            <!-- Players Section -->
            <div v-if="filteredPlayers.length > 0" class="px-2 py-1 bg-dark-400/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              {{ $t('common.players') || 'Players' }}
            </div>
            <div 
              v-for="p in filteredPlayers" 
              :key="p.id" 
              class="px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between"
              :class="filterStore.heroName === p.name ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'"
              @click="handleHeroSelect(p.name)"
            >
              <div class="flex items-center gap-2">
                <RoomLogo :room="p.room" />
                <div class="flex flex-col">
                  <span class="font-medium">{{ p.name }}</span>
                  <span class="text-xs text-gray-500">{{ p.total_hands }} {{ $t('common.hands') }}</span>
                </div>
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

      <!-- Update Indicator -->
      <button 
        v-if="updateStore.isAvailable || updateStore.isDownloaded"
        @click="updateStore.downloadUpdate()"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-lg text-xs font-medium transition-colors border border-primary-500/20"
      >
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
        </span>
        {{ $t('header.update_required') }}
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
import { Upload, RefreshCw, Search, ChevronDown, ChevronRight, Bell, Check, X, Trash2, Filter, Users, Calendar, Trophy, Hash } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useProgressStore } from '@/stores/progressStore'
import { ipcService } from '@/services/ipcService'
import { formatDate, formatCurrency } from '@/utils/formatters'
import RoomLogo from '@/components/common/RoomLogo.vue'

const { t } = useI18n()
const appStore = useAppStore()
const filterStore = useFilterStore()
const updateStore = useUpdateStore()
const notificationStore = useNotificationStore()
const progressStore = useProgressStore()

const isRefreshing = ref(false)
const players = ref([])
const searchTerm = ref('')
const isDropdownOpen = ref(false)
const showDatePicker = ref(false)
const showBuyInPicker = ref(false)
const isNotificationsOpen = ref(false)
const showSessionDropdown = ref(false)
let sessionDropdownTimer = null

const openSessionDropdown = () => {
  if (sessionDropdownTimer) clearTimeout(sessionDropdownTimer)
  showSessionDropdown.value = true
}

const scheduleSessionClose = () => {
  if (sessionDropdownTimer) clearTimeout(sessionDropdownTimer)
  sessionDropdownTimer = setTimeout(() => {
    showSessionDropdown.value = false
  }, 200)
}

const cancelSessionClose = () => {
  if (sessionDropdownTimer) clearTimeout(sessionDropdownTimer)
}

const customFrom = ref(filterStore.customDateFrom || '')
const customTo = ref(filterStore.customDateTo || '')

const history = computed(() => notificationStore.history || [])
const unreadCount = computed(() => history.value.filter(n => !n.read).length)

const filteredPlayers = computed(() => 
  players.value.filter(p => 
    p.name.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
)

const filteredAliases = computed(() => 
  filterStore.aliases.filter(a => 
    a.name.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
)

const mainDateFilters = computed(() => [
  { id: 'today', label: t('dashboard.filters.today') },
  { id: 'week', label: t('dashboard.filters.week') },
  { id: 'month', label: t('dashboard.filters.month') },
  { id: 'all', label: t('dashboard.filters.all') }
])

const recentSessions = computed(() =>
  appStore.sessions.slice(0, 5)
)

const dateFilterLabel = computed(() => {
  if (filterStore.dateRange === 'custom') {
    const fmt = (v) => v ? v.replace('T', ' ') : '...'
    return fmt(customFrom.value) + '-' + fmt(customTo.value)
  }
  if (filterStore.dateRange === 'session') {
    if (filterStore.selectedSession) {
      const s = filterStore.selectedSession
      return formatDate(s.session_date, { format: 'date-only' }) + ' ' + formatTime(s.session_date) + '→' + formatTime(s.session_end)
    }
    return t('common.sessions')
  }
  return t('dashboard.filters.' + filterStore.dateRange) || t('dashboard.filters.all')
})

function formatTime(dateStr) {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const isSelectedSession = (session) => {
  return filterStore.selectedSession?.session_date === session.session_date
}

const loadPlayers = async () => {
  try {
    const res = await ipcService.getPlayers({ limit: 500, minHands: 1 })
    if (res.success) {
      players.value = res.data
    }
    await filterStore.fetchAliases()
  } catch (e) {
    // Silent error
  }
}

onMounted(async () => {
  if (appStore.isInitialized) {
    await loadPlayers()
  }
})

watch(() => appStore.isInitialized, async (isInit) => {
  if (isInit) {
    await loadPlayers()
  }
})

watch(() => [filterStore.heroName, filterStore.customDateFrom, filterStore.customDateTo], () => {
  customFrom.value = filterStore.customDateFrom || ''
  customTo.value = filterStore.customDateTo || ''
})

const handleBuyInChange = (buyIn) => {
  filterStore.setBuyIn(buyIn)
  showBuyInPicker.value = false
}

const handleDateFilterClick = (filterId) => {
  if (filterId === 'custom') {
    filterStore.setDateRange('custom')
  } else {
    filterStore.setDateRange(filterId)
    showDatePicker.value = false
  }
}

const handleSessionSelect = (session) => {
  filterStore.setSelectedSession(session)
  showSessionDropdown.value = false
  showDatePicker.value = false
}

const applyCustomDateRange = () => {
  filterStore.setCustomDateRange(customFrom.value, customTo.value)
  showDatePicker.value = false
}

const handleHeroSelect = (heroName) => {
  filterStore.setHeroName(heroName)
  isDropdownOpen.value = false
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
