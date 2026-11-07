import React from 'react'
import ReactDOM from 'react-dom/client'
import Replayer from './components/replayer/Replayer'
import './i18n'
import './fonts'
import './index.css'
import { ipcService } from './services/ipcService'
import { useReplayerStore } from './stores/replayerStore'
import { logError, logWarn } from '@/utils/log'

// The main window hands the hand (and optional queue) over through the shell.
async function initReplayer(): Promise<void> {
  try {
    const data = await ipcService.getReplayerData()
    if (data) useReplayerStore.getState().initFromWindowData(data)
    else logWarn('No replayer data received')
  } catch (err) {
    logError('Failed to initialize the replayer:', err)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Replayer />
  </React.StrictMode>,
)
void initReplayer()
