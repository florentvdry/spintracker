import { useState } from 'react';
import { 
  Upload, 
  RefreshCw, 
  Bell,
  Search,
  ChevronDown
} from 'lucide-react';
import { useAppStore } from '@stores/appStore';
import { useNotificationStore } from '@stores/notificationStore';
import { useProgressStore } from '@stores/progressStore';
import { ipcService } from '@services/ipcService';

export default function Header() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshAll = useAppStore(state => state.refreshAll);
  const addNotification = useNotificationStore(state => state.addNotification);
  const startProgress = useProgressStore(state => state.startProgress);
  const updateProgress = useProgressStore(state => state.updateProgress);
  const finishProgress = useProgressStore(state => state.finishProgress);

  const handleImport = async () => {
    // Écouter les mises à jour de progression
    const unsubscribe = ipcService.onImportProgress(({ percent, processed, total, speed }) => {
      updateProgress({
        progress: percent,
        message: `${processed}/${total} mains (${speed} mains/s)`,
      });
    });

    startProgress({
      title: 'Import des mains',
      message: 'Sélection des fichiers...',
    });

    try {
      const result = await ipcService.importHandHistory();
      
      finishProgress();
      unsubscribe();

      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Import réussi',
          message: `${result.handsImported} mains importées depuis ${result.filesProcessed} fichier(s)`,
        });
        
        // Rafraîchir les données
        await refreshAll();
      } else if (result.message !== 'Import cancelled') {
        addNotification({
          type: 'error',
          title: 'Erreur d\'import',
          message: result.message,
        });
      }
    } catch (error) {
      finishProgress();
      unsubscribe();
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: error.message,
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAll();
    setIsRefreshing(false);
    addNotification({
      type: 'info',
      message: 'Données actualisées',
    });
  };

  return (
    <header className="h-16 bg-dark-400 border-b border-dark-100/30 flex items-center justify-between px-6">
      {/* Search bar */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher une main, joueur..."
            className="input pl-10 py-2 text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Import button */}
        <button
          onClick={handleImport}
          className="btn-primary flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          <span>Importer</span>
        </button>

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn-icon"
          title="Actualiser"
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Notifications */}
        <button className="btn-icon relative">
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded-full" />
        </button>
      </div>
    </header>
  );
}
