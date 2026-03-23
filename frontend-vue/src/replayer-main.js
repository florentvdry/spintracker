import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Replayer from './components/replayer/Replayer.vue'
import './index.css'

// Electron IPC communication
const isElectron = typeof window !== 'undefined' && window.require
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null

const app = createApp(Replayer)
app.use(createPinia())

if (ipcRenderer) {
  ipcRenderer.on('load-replayer-data', (event, data) => {
    console.log('[Replayer Window] Received data:', data)
    import('./stores/replayerStore').then(({ useReplayerStore }) => {
      const store = useReplayerStore()
      if (data && data.handIds) {
        // New queue-based loading
        store.loadHandQueue(data)
      } else if (data && data.id) {
        // Legacy single-hand loading - data is the full hand object
        store.setHand(data)
      }
    })
  })
}

app.mount('#replayer-app')
