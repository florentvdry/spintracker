import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import './hud.css'
import HudOverlay from './views/LiveHud/HudOverlay'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HudOverlay />
  </React.StrictMode>,
)
