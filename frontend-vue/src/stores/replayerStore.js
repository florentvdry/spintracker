import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ipcService } from '@/services/ipcService'

export const useReplayerStore = defineStore('replayer', () => {
  const handQueue = ref([])
  const currentIndex = ref(0)
  const currentHand = ref(null)
  const isLoading = ref(false)
  const isPlaying = ref(false)
  const playbackSpeed = ref(1)
  const isModalOpen = ref(false)

  const loadHandQueue = async (handIds, heroName) => {
    if (!handIds || handIds.length === 0) return

    handQueue.value = handIds
    currentIndex.value = 0
    isModalOpen.value = true
    await loadCurrentHand(heroName)
  }

  const loadCurrentHand = async (heroName) => {
    if (!handQueue.value[currentIndex.value]) return

    isLoading.value = true
    try {
      const handId = handQueue.value[currentIndex.value]
      const result = await ipcService.getHandDetails(handId, heroName)
      if (result.success) {
        currentHand.value = result.data
      }
    } catch (error) {
      console.error('Failed to load hand:', error)
    } finally {
      isLoading.value = false
    }
  }

  const nextHand = async (heroName) => {
    if (currentIndex.value < handQueue.value.length - 1) {
      currentIndex.value++
      await loadCurrentHand(heroName)
    }
  }

  const prevHand = async (heroName) => {
    if (currentIndex.value > 0) {
      currentIndex.value--
      await loadCurrentHand(heroName)
    }
  }

  const setPlaybackSpeed = (speed) => {
    playbackSpeed.value = speed
  }

  const togglePlay = async (heroName) => {
    isPlaying.value = !isPlaying.value
    if (isPlaying.value) {
      playNext(heroName)
    }
  }

  const playNext = async (heroName) => {
    if (isPlaying.value && currentIndex.value < handQueue.value.length - 1) {
      await nextHand(heroName)
      setTimeout(() => playNext(heroName), 2000 / playbackSpeed.value)
    } else {
      isPlaying.value = false
    }
  }

  const closeModal = () => {
    isModalOpen.value = false
    isPlaying.value = false
    handQueue.value = []
    currentIndex.value = 0
    currentHand.value = null
  }

  return {
    handQueue,
    currentIndex,
    currentHand,
    isLoading,
    isPlaying,
    playbackSpeed,
    isModalOpen,
    loadHandQueue,
    loadCurrentHand,
    nextHand,
    prevHand,
    setPlaybackSpeed,
    togglePlay,
    closeModal
  }
})
