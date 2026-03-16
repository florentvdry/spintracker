<template>
  <Layout>
    <RouterView />
  </Layout>
  <NotificationContainer />
  <ProgressModal />
</template>

<script setup>
import { onMounted, watch } from 'vue'
import Layout from '@/components/layout/Layout.vue'
import NotificationContainer from '@/components/ui/NotificationContainer.vue'
import ProgressModal from '@/components/ui/ProgressModal.vue'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'

const appStore = useAppStore()
const filterStore = useFilterStore()

onMounted(() => {
  appStore.initialize()
})

watch(
  () => [
    filterStore.heroName,
    filterStore.dateRange,
    filterStore.customDateFrom,
    filterStore.customDateTo,
    filterStore.buyIn,
    filterStore.selectedSession,
    filterStore._hasHydrated,
    appStore.isInitialized
  ],
  () => {
    if (filterStore._hasHydrated && appStore.isInitialized && filterStore.heroName?.value) {
      appStore.refreshAll()
    }
  }
)
</script>
