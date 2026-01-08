import React from 'react';
import { useAppStore } from '@stores/appStore';
import './startup.css';
import { TrendingUp } from 'lucide-react';

export default function StartupScreen() {
  const isLoading = useAppStore(state => state.isLoading);
  const isInitialized = useAppStore(state => state.isInitialized);
  const error = useAppStore(state => state.error);
  const loadingMessage = useAppStore(state => state.loadingMessage);

  if ((!isLoading || isInitialized) && !error) return null;

  return (
    <div className="startup-overlay">
      <div className="startup-card">
        <div className="w-[84px] h-[84px] flex items-center justify-center">
          <img src={logo} alt="Logo" className="w-full h-full object-contain" />
        </div>
        <div className="startup-message">
          {error ? (
            <span className="text-red-500 text-sm text-center px-4">{error}</span>
          ) : (
            loadingMessage || "Chargement..."
          )}
        </div>
        {error && (
            <button 
                className="mt-4 px-4 py-2 bg-dark-200 hover:bg-dark-100 rounded text-sm transition-colors"
                onClick={() => window.location.reload()}
            >
                Réessayer
            </button>
        )}
      </div>
    </div>
  );
}
