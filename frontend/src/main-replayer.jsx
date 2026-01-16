import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { logger } from './services/logger';
import './i18n';
import Replayer from './pages/Replayer';
import './index.css';

// Initialize logging bridge to main process
logger.init();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Replayer />
    </HashRouter>
  </React.StrictMode>
);