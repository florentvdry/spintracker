import { useState, useEffect } from 'react';
import { 
  Upload, 
  RefreshCw, 
  Bell,
  Search,
  ChevronDown,
  Check,
  X,
  Trash2
} from 'lucide-react';
import { useAppStore } from '@stores/appStore';
import { useNotificationStore } from '@stores/notificationStore';
import { useProgressStore } from '@stores/progressStore';
import { ipcService } from '@services/ipcService';
import { formatDate } from '@utils/formatters';
import { useTranslation } from 'react-i18next';

export default function Header() {
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshAll = useAppStore(state => state.refreshAll);
  const addNotification = useNotificationStore(state => state.addNotification);
  
  // Notification history hooks
  const history = useNotificationStore(state => state.history) || [];
  const markAsRead = useNotificationStore(state => state.markAsRead);
  const markAllAsRead = useNotificationStore(state => state.markAllAsRead);
  const removeHistoryItem = useNotificationStore(state => state.removeHistoryItem);
  const clearHistory = useNotificationStore(state => state.clearHistory);
  
  const unreadCount = history.filter(n => !n.read).length;
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

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
    if (!heroName && players.length > 0 && dashboardStats?.total_hands > 0) {
        const best = players.reduce((prev, current) => (prev.total_hands > current.total_hands) ? prev : current);
        setHeroName(best.name);
        addNotification({
            type: 'info',
            title: t('header.hero_detected'),
            message: t('header.hero_selected_auto', { name: best.name }),
            duration: 5000
        });
    }
  }, [players, heroName, setHeroName, addNotification, dashboardStats, t]);

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
                      title: t('header.update_required'),
                      message: t('header.reimport_needed'),
                      duration: 10000
                  });
              }
          }
      } catch (e) {
          // Silent error
      }
  };

  useEffect(() => {
    loadPlayers();
  }, [isInitialized, dashboardStats]);

  const handleImport = async () => {
    // Écouter les mises à jour de progression
    const unsubscribe = ipcService.onImportProgress(({ percent, processed, total, speed, handsImported, totalHands, filesProcessed, totalFiles }) => {
      const speedText = speed ? ` (${speed} ${t('common.hands')}/s)` : '';
      if (typeof handsImported === 'number' && typeof totalHands === 'number' && totalHands > 0) {
        updateProgress({
          progress: percent,
          message: `${handsImported}/${totalHands} ${t('common.hands')}${speedText}`,
        });
      } else if (typeof filesProcessed === 'number' && typeof totalFiles === 'number') {
        updateProgress({
          progress: percent,
          message: `${filesProcessed}/${totalFiles} fichiers${speedText}`,
        });
      } else {
        updateProgress({
          progress: percent,
          message: t('header.processing'),
        });
      }
    });

    startProgress({
      title: t('header.import_hands'),
      message: t('header.calculating'),
    });

    try {
      const result = await ipcService.importHandHistory();
      
      finishProgress();
      unsubscribe();

      if (result.success) {
        addNotification({
          type: 'success',
          title: t('header.import_success'),
          message: t('header.import_stats', { hands: result.handsImported, files: result.filesProcessed }),
        });
        
        // Attendre un peu pour s'assurer que la BDD est bien synchronisée
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Rafraîchir les données
        await refreshAll();
        await loadPlayers();
      } else if (result.message !== 'Import cancelled') {
        addNotification({
          type: 'error',
          title: t('header.import_error'),
          message: result.message,
        });
      }
    } catch (error) {
      finishProgress();
      unsubscribe();
      addNotification({
        type: 'error',
        title: t('common.error'),
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
      message: t('header.data_refreshed'),
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
            placeholder={t('header.search_placeholder')}
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
                <span className="text-sm text-gray-200 flex-1 truncate">{heroName || t('header.select_hero')}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>

            {isDropdownOpen && (
                <div className="absolute top-full mt-1 left-0 w-64 bg-dark-300 border border-dark-200 rounded shadow-xl z-50 flex flex-col max-h-[400px]">
                    <div className="p-2 border-b border-dark-200">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                            <input 
                                type="text" 
                                placeholder={t('common.search')} 
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
                                    <span className="text-xs text-gray-500">{p.total_hands} {t('common.hands')}</span>
                                </div>
                                {heroName === p.name && <div className="w-2 h-2 rounded-full bg-primary-500"></div>}
                            </div>
                        ))}
                        {filteredPlayers.length === 0 && (
                            <div className="px-3 py-4 text-center text-xs text-gray-500">
                                {t('header.no_player_found')}
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
          <span>{t('common.import')}</span>
        </button>

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn-icon"
          title={t('common.refresh')}
        >
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Notifications */}
        <div className="relative">
          <button 
            className="btn-icon relative"
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown Notifications */}
          {isNotificationsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)}></div>
              <div className="absolute top-full mt-1 right-0 w-80 bg-dark-300 border border-dark-200 rounded shadow-xl z-50 flex flex-col max-h-[400px]">
                {/* Header */}
                <div className="p-3 border-b border-dark-200 flex items-center justify-between">
                  <h3 className="font-medium text-gray-200">{t('common.notifications')}</h3>
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> {t('common.all_read')}
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1">
                  {history.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      {t('common.no_notifications')}
                    </div>
                  ) : (
                    history.map(item => (
                      <div 
                        key={item.id}
                        className={`p-3 border-b border-dark-100/10 hover:bg-dark-400 group relative ${!item.read ? 'bg-primary-500/5' : ''}`}
                        onClick={() => markAsRead(item.id)}
                      >
                        <div className="flex gap-3 pr-6">
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            item.type === 'success' ? 'bg-green-500' :
                            item.type === 'error' ? 'bg-red-500' :
                            item.type === 'warning' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`} />
                          
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${!item.read ? 'text-gray-100' : 'text-gray-400'}`}>
                              {item.title || 'Notification'}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                              {item.message}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-1">
                              {formatDate(item.timestamp, { format: 'relative' })}
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); removeHistoryItem(item.id); }}
                            className="p-1 hover:bg-dark-200 rounded text-gray-400 hover:text-red-400"
                            title={t('common.delete')}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                {history.length > 0 && (
                  <div className="p-2 border-t border-dark-200 bg-dark-400/50">
                    <button 
                      onClick={clearHistory}
                      className="w-full py-1.5 text-xs text-center text-gray-500 hover:text-gray-300 flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-3 h-3" /> {t('common.clear_all')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
