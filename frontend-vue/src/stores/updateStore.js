import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ipcService } from '@/services/ipcService'

export const useUpdateStore = defineStore('update', () => {
  const isAvailable = ref(false)
  const isChecking = ref(false)
  const isDownloading = ref(false)
  const isDownloaded = ref(false)
  const version = ref('')
  const releaseNotes = ref('')
  const progress = ref(0)
  const error = ref(null)

  const initialize = () => {
    ipcService.onUpdateStatus((statusData) => {
      console.log('[UpdateStore] Status update:', statusData)
      const { status, version: newVersion, releaseNotes: notes, progress: progressObj, error: err } = statusData

      switch (status) {
        case 'checking':
          isChecking.value = true
          break
        case 'available':
          isChecking.value = false
          isAvailable.value = true
          version.value = newVersion
          releaseNotes.value = Array.isArray(notes) ? notes.map(n => n.note).join('\n') : (notes || '')
          break
        case 'not-available':
          isChecking.value = false
          isAvailable.value = false
          break
        case 'downloading':
          isDownloading.value = true
          progress.value = progressObj?.percent || 0
          break
        case 'downloaded':
          isDownloading.value = false
          isDownloaded.value = true
          version.value = newVersion
          break
        case 'error':
          isChecking.value = false
          isDownloading.value = false
          error.value = err
          break
      }
    })
  }

  const downloadUpdate = async () => {
    error.value = null
    await ipcService.downloadUpdate()
  }

  const quitAndInstall = async () => {
    await ipcService.quitAndInstall()
  }

  return {
    isAvailable,
    isChecking,
    isDownloading,
    isDownloaded,
    version,
    releaseNotes,
    progress,
    error,
    initialize,
    downloadUpdate,
    quitAndInstall
  }
})
