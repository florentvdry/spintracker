import { useState, useEffect } from 'react';
import { Trash2, Database, Download, Upload, Globe, FolderOpen, Loader, Plus, Check, X, Edit2 } from 'lucide-react';
import { Card } from '@components/ui';
import { ipcService } from '@services/ipcService';
import { pythonService } from '@services/pythonService';
import { useNotificationStore } from '@stores/notificationStore';
import { useAppStore } from '@stores/appStore';
import { useFilterStore } from '@stores/filterStore';
import { usePlayersStore } from '@stores/playersStore';
import { useTranslation } from 'react-i18next';
import logo from '../../assets/logo.png';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const addNotification = useNotificationStore(state => state.addNotification);
  const refreshAll = useAppStore(state => state.refreshAll);
  const { heroName, setHeroName } = useFilterStore();
  const loadPlayers = usePlayersStore(state => state.loadPlayers);
  const [serverStatus, setServerStatus] = useState('checking');
  const [exportLoading, setExportLoading] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0');
  
  // Database management state
  const [databases, setDatabases] = useState([]);
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [creatingDb, setCreatingDb] = useState(false);
  const [newDbName, setNewDbName] = useState('');
  const [editingDbId, setEditingDbId] = useState(null);
  const [editingDbName, setEditingDbName] = useState('');

  const loadDatabases = async () => {
    try {
      setLoadingDatabases(true);
      const result = await ipcService.getDatabases();
      if (result.success) {
        setDatabases(result.data || []);
      }
    } catch (error) {
      console.error('Failed to load databases:', error);
    } finally {
      setLoadingDatabases(false);
    }
  };

  useEffect(() => {
    checkStatus();
    loadVersion();
    loadDatabases();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const loadVersion = async () => {
    try {
      const version = await ipcService.getAppVersion();
      if (version) setAppVersion(version);
    } catch (error) {
      console.error('Failed to load version:', error);
    }
  };

  const checkStatus = async () => {
    try {
      const result = await ipcService.checkServerStatus();
      setServerStatus(result.success ? 'active' : 'inactive');
    } catch (error) {
      setServerStatus('inactive');
    }
  };

  const handleDeleteAll = async () => {
    try {
      const result = await ipcService.deleteAllHands();

      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Données supprimées',
          message: result.message || 'Toutes les mains ont été supprimées. Les stats et profils par défaut ont été restaurés.',
        });
        // Refresh stats first so Header sees 0 hands
        await refreshAll();
        setHeroName(null);
        await loadPlayers();
        // Reload page to refresh stats and profiles
        window.location.reload();
      } else {
        // Handle cancelled action specifically to avoid error notification
        if (result.message && result.message.includes('annulée')) {
           return; 
        }

        addNotification({
          type: 'error',
          title: 'Erreur',
          message: result.message || 'Une erreur inconnue est survenue',
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Erreur critique',
        message: error.message || 'Impossible de contacter le serveur',
      });
    }
  };

  const handleOpenLogs = async () => {
    try {
      const result = await ipcService.openLogsFolder();
      if (!result.success) {
        addNotification({
          type: 'error',
          title: 'Erreur',
          message: result.error || 'Impossible d\'ouvrir le dossier des logs'
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        message: error.message
      });
    }
  };

  const handleCreateDatabase = async () => {
    if (!newDbName.trim()) return;
    
    try {
      setCreatingDb(true);
      const result = await ipcService.createDatabase(newDbName.trim());
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Base de données créée',
          message: `La base de données "${newDbName}" a été créée`
        });
        setNewDbName('');
        await loadDatabases();
      } else {
        addNotification({
          type: 'error',
          title: 'Erreur',
          message: result.message || 'Impossible de créer la base de données'
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: error.message
      });
    } finally {
      setCreatingDb(false);
    }
  };

  const handleSetActiveDatabase = async (dbId) => {
    try {
      const result = await ipcService.setActiveDatabase(dbId);
      if (result.success) {
        addNotification({
          type: 'info',
          title: 'Base de données activée',
          message: 'L\'application va redémarrer avec la nouvelle base de données...'
        });
        await loadDatabases();
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        addNotification({
          type: 'error',
          title: 'Erreur',
          message: result.message || 'Impossible de changer de base de données'
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: error.message
      });
    }
  };

  const handleDeleteDatabase = async (db) => {
    if (databases.length <= 1) {
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: t('settings.database.multiple.cannot_delete_last')
      });
      return;
    }

    if (db.isActive) {
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: t('settings.database.multiple.cannot_delete_active')
      });
      return;
    }

    const confirmed = window.confirm(
      `${t('settings.database.multiple.confirm_delete')}\n\n${t('settings.database.multiple.delete_warning')}`
    );

    if (!confirmed) return;

    try {
      const result = await ipcService.deleteDatabase(db.id);
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Base de données supprimée',
          message: `La base de données "${db.name}" a été supprimée`
        });
        await loadDatabases();
      } else {
        addNotification({
          type: 'error',
          title: 'Erreur',
          message: result.message || 'Impossible de supprimer la base de données'
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: error.message
      });
    }
  };

  const handleRenameDatabase = async (db) => {
    if (!editingDbName.trim()) return;

    try {
      const result = await ipcService.renameDatabase(db.id, editingDbName.trim());
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Base de données renommée',
          message: `La base de données a été renommée en "${editingDbName}"`
        });
        setEditingDbId(null);
        setEditingDbName('');
        await loadDatabases();
      } else {
        addNotification({
          type: 'error',
          title: 'Erreur',
          message: result.message || 'Impossible de renommer la base de données'
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Erreur',
        message: error.message
      });
    }
  };

  const startEditing = (db) => {
    setEditingDbId(db.id);
    setEditingDbName(db.name);
  };

  const cancelEditing = () => {
    setEditingDbId(null);
    setEditingDbName('');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{t('settings.title')}</h1>
        <p className="text-gray-400 mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* General Section */}
      <Card title={t('settings.general.title')}>
        <SettingRow
          icon={Globe}
          title={t('settings.general.language')}
          description={t('settings.general.language_desc')}
          action={
            <div className="flex bg-dark-200 rounded-lg p-1 border border-dark-100/50">
              <button
                onClick={() => changeLanguage('en')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  i18n.language.startsWith('en') 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                English
              </button>
              <button
                onClick={() => changeLanguage('fr')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  i18n.language.startsWith('fr') 
                    ? 'bg-blue-600 text-white shadow-lg' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Français
              </button>
            </div>
          }
        />
      </Card>

      {/* Multiple Databases Section */}
      <Card title={t('settings.database.multiple.title')} subtitle={t('settings.database.multiple.desc')}>
        <div className="space-y-4">
          {/* Create new database */}
          <div className="flex items-center gap-3 py-3 border-b border-dark-100/30">
            <div className="w-10 h-10 rounded-lg bg-dark-200 flex items-center justify-center">
              <Plus className="w-5 h-5 text-gray-400" />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value)}
                placeholder={t('settings.database.multiple.name')}
                className="w-full bg-dark-200 border border-dark-100/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDatabase()}
              />
            </div>
            <button
              onClick={handleCreateDatabase}
              disabled={!newDbName.trim() || creatingDb}
              className="btn-primary flex items-center gap-2"
            >
              {creatingDb ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('settings.database.multiple.create')}
            </button>
          </div>

          {/* Database list */}
          {loadingDatabases ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            databases.map((db) => (
              <div key={db.id} className="flex items-center gap-3 py-3 border-b border-dark-100/30 last:border-b-0">
                <div className="w-10 h-10 rounded-lg bg-dark-200 flex items-center justify-center">
                  <Database className={`w-5 h-5 ${db.isActive ? 'text-green-400' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  {editingDbId === db.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingDbName}
                        onChange={(e) => setEditingDbName(e.target.value)}
                        className="flex-1 bg-dark-200 border border-dark-100/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameDatabase(db);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        autoFocus
                      />
                      <button onClick={() => handleRenameDatabase(db)} className="p-1.5 text-green-400 hover:text-green-300">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={cancelEditing} className="p-1.5 text-gray-400 hover:text-gray-300">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium truncate">{db.name}</p>
                        {db.isActive && (
                          <span className="badge badge-success text-xs">{t('settings.database.multiple.active')}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">
                        {t('settings.database.multiple.created', { date: new Date(db.createdAt).toLocaleDateString() })}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!db.isActive && (
                    <>
                      <button
                        onClick={() => startEditing(db)}
                        className="p-2 text-gray-400 hover:text-white transition-colors"
                        title={t('common.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleSetActiveDatabase(db.id)}
                        className="btn-secondary flex items-center gap-2 text-sm"
                      >
                        <Check className="w-4 h-4" />
                        {t('settings.database.multiple.set_active')}
                      </button>
                      <button
                        onClick={() => handleDeleteDatabase(db)}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Stats Management */}
      <Card title={t('settings.database.title')} subtitle={t('settings.database.subtitle')}>
        <div className="space-y-4">
          <SettingRow
            icon={Download}
            title={t('settings.database.export.title')}
            description={t('settings.database.export.desc')}
            action={
              <button 
                onClick={async () => {
                  setExportLoading(true);
                  try {
                    const result = await ipcService.exportData();
                    if (result.success) {
                      addNotification({
                        type: 'success',
                        title: 'Export réussi',
                        message: result.message
                      });
                    } else if (result.message !== 'Export cancelled') {
                      addNotification({
                        type: 'error',
                        title: 'Erreur',
                        message: result.message
                      });
                    }
                  } finally {
                    setExportLoading(false);
                  }
                }}
                disabled={exportLoading}
                className="btn-secondary flex items-center gap-2"
              >
                {exportLoading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    {t('settings.database.export.button')}
                  </>
                )}
              </button>
            }
          />

          <SettingRow
            icon={Trash2}
            title={t('settings.database.delete.title')}
            description={t('settings.database.delete.desc')}
            action={
              <button
                onClick={handleDeleteAll}
                className="btn-danger flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {t('settings.database.delete.button')}
              </button>
            }
          />
        </div>
      </Card>

      {/* Python backend */}
      <Card title={t('settings.server.title')} subtitle={t('settings.server.subtitle')}>
        <div className="space-y-4">
          <SettingRow
            icon={Database}
            title={t('settings.server.status.title')}
            description={t('settings.server.status.desc')}
            action={
              <span className={`badge ${serverStatus === 'active' ? 'badge-success' : 'badge-danger'}`}>
                {serverStatus === 'active' ? t('settings.server.status.active') : t('settings.server.status.inactive')}
              </span>
            }
          />
        </div>
      </Card>

      {/* Maintenance & Support */}
      <Card title={t('settings.maintenance.title')}>
        <div className="space-y-4">
          <SettingRow
            icon={FolderOpen}
            title={t('settings.maintenance.logs.title')}
            description={t('settings.maintenance.logs.desc')}
            action={
              <button
                onClick={handleOpenLogs}
                className="btn-secondary flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                {t('settings.maintenance.logs.button')}
              </button>
            }
          />
        </div>
      </Card>

      {/* About */}
      <Card title={t('settings.about.title')}>
        <div className="space-y-2 text-sm text-gray-400">
          <p><span className="text-white">SpinTracker</span> v{appVersion}</p>
          <p>{t('settings.about.description')}</p>
        </div>
      </Card>
    </div>
  );
}

function SettingRow({ icon: Icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-dark-100/30 last:border-b-0">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-dark-200 flex items-center justify-center">
          <Icon className="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <p className="text-white font-medium">{title}</p>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
