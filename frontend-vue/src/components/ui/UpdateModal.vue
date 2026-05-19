<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div class="bg-dark-400 rounded-2xl p-8 w-[450px] shadow-2xl border border-dark-100/50 animate-slide-up">
          <div class="flex items-center gap-4 mb-6">
            <div class="p-3 bg-primary-500/10 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h3 class="text-xl font-bold text-white">Mise à jour disponible</h3>
              <p class="text-gray-400 text-sm">Version {{ version }} est prête à être installée</p>
            </div>
          </div>

          <div v-if="releaseNotes" class="mb-4">
            <p class="text-gray-400 text-xs uppercase tracking-wider mb-2">Changelog</p>
            <div class="max-h-40 overflow-y-auto bg-dark-300/50 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed" v-html="releaseNotes">
            </div>
          </div>

          <div v-if="isDownloading" class="mb-6">
            <div class="flex justify-between text-sm mb-2">
              <span class="text-gray-400">Téléchargement...</span>
              <span class="text-primary-400 font-medium">{{ Math.round(progress) }}%</span>
            </div>
            <div class="h-2 bg-dark-200 rounded-full overflow-hidden">
              <div 
                class="h-full bg-primary-500 transition-all duration-300 ease-out"
                :style="{ width: `${progress}%` }"
              ></div>
            </div>
          </div>

          <div v-if="error" class="mb-6 p-4 bg-profit-negative/10 border border-profit-negative/20 rounded-lg text-profit-negative text-sm">
            {{ error }}
          </div>

          <div class="flex gap-3 justify-end">
            <template v-if="isDownloaded">
              <button 
                @click="quitAndInstall"
                class="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
              >
                Redémarrer et installer
              </button>
            </template>
            <template v-else-if="isDownloading">
              <button 
                disabled
                class="px-6 py-2.5 bg-dark-200 text-gray-400 rounded-xl font-semibold cursor-not-allowed"
              >
                Téléchargement...
              </button>
            </template>
            <template v-else>
              <button 
                @click="close"
                class="px-6 py-2.5 bg-dark-200 hover:bg-dark-100 text-white rounded-xl font-semibold transition-colors"
              >
                Plus tard
              </button>
              <button 
                @click="downloadUpdate"
                class="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-semibold transition-colors"
              >
                Télécharger maintenant
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useUpdateStore } from '@/stores/updateStore'

const updateStore = useUpdateStore()

const isAvailable = computed(() => updateStore.isAvailable)
const isDownloading = computed(() => updateStore.isDownloading)
const isDownloaded = computed(() => updateStore.isDownloaded)
const version = computed(() => updateStore.version)
const releaseNotes = computed(() => updateStore.releaseNotes)
const progress = computed(() => updateStore.progress)
const error = computed(() => updateStore.error)

const userClosed = ref(false)

const showModal = computed(() => {
  return (isAvailable.value || isDownloaded.value) && !userClosed.value
})

const close = () => {
  userClosed.value = true
}

const downloadUpdate = () => {
  updateStore.downloadUpdate()
}

const quitAndInstall = () => {
  updateStore.quitAndInstall()
}

// Reset userClosed if a new update becomes available later (though unlikely in one session)
watch(isAvailable, (newVal) => {
  if (newVal) userClosed.value = false
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
