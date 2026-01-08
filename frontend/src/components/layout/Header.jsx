import { useState, useEffect } from 'react';
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
  const [players, setPlayers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const heroName = useAppStore(state => state.heroName);
  const setHeroName = useAppStore(state => state.setHeroName);
  const isInitialized = useAppStore(state => state.isInitialized);
  const dashboardStats = useAppStore(state => state.dashboardStats);

  useEffect(() => {
    if (!heroName && players.length > 0) {
        const best = players.reduce((prev, current) => (prev.total_hands > current.total_hands) ? prev : current);
        setHeroName(best.name);
        addNotification({
            type: 'info',
            title: 'Héro détecté',
            message: `Le joueur ${best.name} a été sélectionné automatiquement.`,
            duration: 5000
        });
    }
  }, [players, heroName, setHeroName, addNotification]);

  const loadPlayers = async () => {
      try {
          // On charge tous les joueurs avec au moins 1 main pour être sûr de trouver le héros
          const res = await ipcService.getPlayers({ limit: 500, minHands: 1 });
          if (res.success) {
              setPlayers(res.data);
              
              // Warning if we have hands but no players (legacy data)
              if (res.data.length === 0 && dashboardStats?.total_hands > 0) {
                  addNotification({
                      type: 'warning',
                      title: 'Mise à jour requise',
                      message: 'Veuillez réimporter vos mains pour activer la sélection du Héro et les nouvelles statistiques.',
                      duration: 10000
                  });
              }
          }
      } catch (e) {
          console.error("Failed to load players", e);
      }
  };

  useEffect(() => {
    loadPlayers();
  }, [isInitialized, dashboardStats]);

  const handleImport = async () => {
    // Écouter les mises à jour de progression
    const unsubscribe = ipcService.onImportProgress(({ percent, processed, total, speed, handsImported, totalHands, filesProcessed, totalFiles }) => {
      const speedText = speed ? ` (${speed} mains/s)` : '';
      if (typeof handsImported === 'number' && typeof totalHands === 'number' && totalHands > 0) {
        updateProgress({
          progress: percent,
          message: `${handsImported}/${totalHands} mains${speedText}`,
        });
      } else if (typeof filesProcessed === 'number' && typeof totalFiles === 'number') {
        updateProgress({
          progress: percent,
          message: `${filesProcessed}/${totalFiles} fichiers${speedText}`,
        });
      } else {
        updateProgress({
          progress: percent,
          message: `Traitement...`,
        });
      }
    });

    startProgress({
      title: 'Import des mains',
      message: 'Calcul en cours...',
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
        
        // Attendre un peu pour s'assurer que la BDD est bien synchronisée
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Rafraîchir les données
        await refreshAll();
        await loadPlayers();
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

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        {/* Hero Selector */}
        <div className="relative mr-2">
            <div 
                className="flex items-center gap-2 cursor-pointer bg-dark-300 border border-dark-200 rounded px-3 py-1.5 min-w-[180px] hover:border-primary-500 transition-colors"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
                <span className="text-xs text-gray-400">Hero:</span>
                <span className="text-sm text-gray-200 flex-1 truncate">{heroName || 'Sélectionner...'}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>

            {isDropdownOpen && (
                <div className="absolute top-full mt-1 left-0 w-64 bg-dark-300 border border-dark-200 rounded shadow-xl z-50 flex flex-col max-h-[400px]">
                    <div className="p-2 border-b border-dark-200">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                            <input 
                                type="text" 
                                placeholder="Rechercher..." 
                                className="w-full bg-dark-400 border border-dark-200 rounded pl-8 pr-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-primary-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filteredPlayers.map(p => (
                            <div 
                                key={p.id} 
                                className={`px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between ${heroName === p.name ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300'}`}
                                onClick={() => {
                                    setHeroName(p.name);
                                    setIsDropdownOpen(false);
                                }}
                            >
                                <div className="flex flex-col">
                                    <span className="font-medium">{p.name}</span>
                                    <span className="text-xs text-gray-500">{p.total_hands} mains</span>
                                </div>
                                {heroName === p.name && <div className="w-2 h-2 rounded-full bg-primary-500"></div>}
                            </div>
                        ))}
                        {filteredPlayers.length === 0 && (
                            <div className="px-3 py-4 text-center text-xs text-gray-500">
                                Aucun joueur trouvé
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
        
        {/* Overlay to close dropdown */}
        {isDropdownOpen && (
            <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
        )}

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
