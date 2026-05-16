import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { useReplayerStore } from './stores/replayerStore'
import Replayer from './components/replayer/Replayer.vue'
import './index.css'

// Electron IPC communication
const isElectron = typeof window !== 'undefined' && window.require
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null

const app = createApp(Replayer)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

const store = useReplayerStore()

if (ipcRenderer) {
  // Listen for hand data from main process
  ipcRenderer.on('load-replayer-data', (event, data) => {
    console.log('[Replayer Window] Received IPC data:', data)
    if (data && data.handIds) {
      store.handQueue = data.handIds
      store.queueIndex = data.startIndex || 0
      store.heroName = data.heroName
      // If hand data is included, load it
      if (data.id || data.handId || data.HandId) {
        store.setHand(data)
      } else {
        // No hand data, load the first hand in queue
        const firstId = data.handIds[data.startIndex || 0]
        if (firstId) {
          store.loadHand(firstId, data.heroName)
        }
      }
    } else if (data && (data.id || data.handId || data.HandId)) {
      store.setHand(data)
    }
  })
  
  // Fallback: try to get data if IPC didn't send it
  setTimeout(async () => {
    if (!store.handData) {
      console.log('[Replayer Window] No hand data received, trying fallback...')
      try {
        const data = await ipcRenderer.invoke('replayer-get-data')
        console.log('[Replayer Window] Fallback data:', data)
        if (data && (data.id || data.handId || data.HandId)) {
          store.setHand(data)
        } else if (data && data.handIds) {
          store.handQueue = data.handIds
          store.queueIndex = data.startIndex || 0
          store.heroName = data.heroName
          const firstId = data.handIds[data.startIndex || 0]
          if (firstId) {
            store.loadHand(firstId, data.heroName)
          }
        }
      } catch (e) {
        console.error('[Replayer Window] Fallback failed:', e)
      }
    }
  }, 500)
}

app.mount('#replayer-app')
