import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { useReplayerStore } from './stores/replayerStore'
import Replayer from './components/replayer/Replayer.vue'
import './index.css'

const isElectron = typeof window !== 'undefined' && window.require
const ipcRenderer = isElectron ? window.require('electron').ipcRenderer : null

// Global log redirection
if (ipcRenderer) {
  const originalLog = console.log;
  console.log = (...args) => {
    ipcRenderer.send('frontend-log', { level: 'info', message: args.join(' '), args: [] });
    originalLog(...args);
  };
  const originalWarn = console.warn;
  console.warn = (...args) => {
    ipcRenderer.send('frontend-log', { level: 'warn', message: args.join(' '), args: [] });
    originalWarn(...args);
  };
  const originalError = console.error;
  console.error = (...args) => {
    ipcRenderer.send('frontend-log', { level: 'error', message: args.join(' '), args: [] });
    originalError(...args);
  };
}

const app = createApp(Replayer)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

const store = useReplayerStore()

// Méthode simplifiée : on demande les données une seule fois au chargement
async function initReplayer() {
  if (!ipcRenderer) {
    console.error('IPC non disponible')
    return
  }

  try {
    console.log('Demande des données au processus principal...')
    const data = await ipcRenderer.invoke('replayer-get-data')
    
    if (!data) {
      console.warn('Aucune donnée reçue')
      return
    }

    console.log('Données reçues, initialisation du store...')
    // Initialisation directe sans passer par des méthodes complexes
    store.handData = data
    console.log('handData assigné')
    store.handId = data.id || data.handId || data.HandId
    
    // Si des données de queue sont présentes
    if (data.handIds) {
      store.handQueue = data.handIds
      store.queueIndex = data.startIndex || 0
      store.heroName = data.heroName
    }

    console.log('Appel à store.resetTable()')
    // Force une réinitialisation de la table pour déclencher le rendu
    store.resetTable()
    console.log('store.resetTable() terminé')
    console.log('État du store après init:', {
        handId: store.handId,
        hasHandData: !!store.handData,
        handQueue: store.handQueue.length
    })
  } catch (err) {
    console.error("Erreur lors de l'initialisation:", err)
  }
}

app.mount('#replayer-app')
initReplayer()
