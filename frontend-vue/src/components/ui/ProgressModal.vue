<template>
  <Teleport to="body">
    <div v-if="isVisible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-dark-300 rounded-lg p-6 w-96 shadow-2xl border border-dark-100/30">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">{{ title }}</h3>
        </div>
        
        <div class="mb-4">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
        </div>

        <p class="text-sm text-gray-400">{{ message }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useProgressStore } from '@/stores/progressStore'

const progressStore = useProgressStore()

const isVisible = computed(() => progressStore.isVisible)
const title = computed(() => progressStore.title)
const message = computed(() => progressStore.message)
const progress = computed(() => progressStore.progress)
</script>
