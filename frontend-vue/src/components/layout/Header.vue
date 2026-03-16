<template>
  <header class="h-16 bg-dark-400 border-b border-dark-100/30 flex items-center justify-end px-6">
    <div class="flex items-center gap-3">
      <button
        @click="handleImport"
        class="btn-primary flex items-center gap-2"
      >
        <Upload class="w-4 h-4" />
        <span>{{ $t('common.import') }}</span>
      </button>

      <button
        @click="handleRefresh"
        :disabled="isRefreshing"
        class="btn-icon"
        :title="$t('common.refresh')"
      >
        <RefreshCw class="w-5 h-5" :class="{ 'animate-spin': isRefreshing }" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Upload, RefreshCw } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useProgressStore } from '@/stores/progressStore'
import { ipcService } from '@/services/ipcService'

const { t } = useI18n()
const appStore = useAppStore()
const filterStore = useFilterStore()
const notificationStore = useNotificationStore()
const progressStore = useProgressStore()

const isRefreshing = ref(false)
const players = ref([])

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

watch(() => [filterStore.heroName, appStore.dashboardStats], () => {
  if (!filterStore.heroName && players.value.length > 0) {
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
