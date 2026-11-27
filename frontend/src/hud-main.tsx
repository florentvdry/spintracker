import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import './hud.css'
import { applyPalette, readPalette } from '@/utils/palette'
import HudOverlay from './views/LiveHud/HudOverlay'

applyPalette(readPalette())
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HudOverlay />
  </React.StrictMode>,
)
