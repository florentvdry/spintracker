import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useProgressStore = defineStore('progress', () => {
  const isVisible = ref(false)
  const title = ref('')
  const message = ref('')
  const progress = ref(0)
  const subProgress = ref(null)
  const canCancel = ref(false)
  const cancelToken = ref(null)

  const startProgress = ({ title: newTitle, message: newMessage = '', canCancel: newCanCancel = false }) => {
    isVisible.value = true
    title.value = newTitle
    message.value = newMessage
    progress.value = 0
    subProgress.value = null
    canCancel.value = newCanCancel
  }

  const updateProgress = ({ progress: newProgress, message: newMessage, subProgress: newSubProgress }) => {
    progress.value = newProgress ?? progress.value
    message.value = newMessage ?? message.value
    subProgress.value = newSubProgress ?? subProgress.value
  }

  const finishProgress = () => {
    isVisible.value = false
    title.value = ''
    message.value = ''
    progress.value = 0
    subProgress.value = null
    canCancel.value = false
  }

  const setCancelToken = (token) => {
    cancelToken.value = token
  }

  const cancel = () => {
    if (cancelToken.value) {
      cancelToken.value.cancel()
    }
    finishProgress()
  }

  return {
    isVisible,
    title,
    message,
    progress,
    subProgress,
    canCancel,
    cancelToken,
    startProgress,
    updateProgress,
    finishProgress,
    setCancelToken,
    cancel
  }
})
