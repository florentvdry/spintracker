<template>
  <div class="flex h-screen bg-dark-900">
    <Sidebar />
    <main class="flex-1 overflow-auto">
      <Header />
      <div class="p-6">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import Sidebar from './components/Sidebar.vue'
import Header from './components/Header.vue'
import { useAppStore } from './stores/app'
import { onMounted } from 'vue'

const appStore = useAppStore()

onMounted(() => {
  appStore.initialize()
})
</script>
