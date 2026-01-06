import React from 'react';
import { useAppStore } from '@stores/appStore';
import './startup.css';
import { TrendingUp } from 'lucide-react';

export default function StartupScreen() {
  const isLoading = useAppStore(state => state.isLoading);
  const isInitialized = useAppStore(state => state.isInitialized);

  if (!isLoading || isInitialized) return null;

  return (
    <div className="startup-overlay">
      <div className="startup-card">
        <div className="startup-logo-bg">
          <TrendingUp className="startup-logo" />
        </div>
        <div className="startup-message">Chargement des mains...</div>
      </div>
    </div>
  );
}
