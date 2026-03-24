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
  ipcRenderer.on('load-replayer-data', (event, data) => {
    console.log('[Replayer Window] Received data:', data)
    if (data && data.handIds) {
      store.loadHandQueue(data)
    } else if (data && (data.id || data.handId || data.HandId)) {
      store.setHand(data)
    }
  })
}

app.mount('#replayer-app')
