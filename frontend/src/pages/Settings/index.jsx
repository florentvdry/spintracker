import { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Database, Calculator, Download, Upload, Globe, FileCode } from 'lucide-react';
import { Card } from '@components/ui';
import { ipcService } from '@services/ipcService';
import { pythonService } from '@services/pythonService';
import { useNotificationStore } from '@stores/notificationStore';
import { useAppStore } from '@stores/appStore';
import { usePlayersStore } from '@stores/playersStore';
import { useTranslation } from 'react-i18next';
import logo from '../../assets/logo.png';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const addNotification = useNotificationStore(state => state.addNotification);
  const refreshAll = useAppStore(state => state.refreshAll);
  const setHeroName = useAppStore(state => state.setHeroName);
  const loadPlayers = usePlayersStore(state => state.loadPlayers);
  const [serverStatus, setServerStatus] = useState('checking');

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
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
          message: result.message || 'Toutes les mains ont été supprimées',
        });
        // Refresh stats first so Header sees 0 hands
        await refreshAll();
        setHeroName(null);
        await loadPlayers();
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

  const handleRecalculateEV = async () => {
    setIsRecalculating(true);
    try {
      const result = await pythonService.recalculateAllEV();
      if (result && result.success) {
        const count = result.handsProcessed || (result.raw && (result.raw.processed || result.raw.inserted)) || 0;
        addNotification({
          type: 'success',
          title: 'Recalcul terminé',
          message: `${count} mains recalculées`,
        });
        await refreshAll();
      } else {
        const msg = (result && (result.message || result.error || JSON.stringify(result))) || 'Erreur inconnue';
        addNotification({
          type: 'error',
          message: msg,
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        message: error && error.message ? error.message : String(error),
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleExportStats = async () => {
    try {
      const res = await fetch('http://localhost:5050/stats/export');
      const json = await res.json();
      if (json.success) {
        const dataStr = JSON.stringify(json.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `stats_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        addNotification({
          type: 'success',
          title: 'Export réussi',
          message: `${json.data.length} statistiques exportées`
        });
      } else {
        throw new Error(json.error || 'Export failed');
      }
    } catch (err) {
      addNotification({ type: 'error', message: err.message });
    }
  };

  const handleImportStats = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target.result;
        // Validate JSON
        const stats = JSON.parse(content);
        if (!Array.isArray(stats)) throw new Error('Format invalide : Liste attendue');

        const res = await fetch('http://localhost:5050/stats/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: content
        });
        const json = await res.json();
        
        if (json.success) {
          addNotification({
            type: 'success',
            title: 'Import réussi',
            message: `${json.count} statistiques importées`
          });
        } else {
          throw new Error(json.error || 'Import failed');
        }
      } catch (err) {
        addNotification({ type: 'error', message: err.message });
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input
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

      {/* Stats Management */}
      <Card title={t('settings.stats.title') || "Gestion des Statistiques"}>
        <div className="space-y-4">
           <SettingRow
            icon={FileCode}
            title="Export des Statistiques"
            description="Sauvegarder vos statistiques personnalisées dans un fichier JSON."
            action={
              <button onClick={handleExportStats} className="btn-secondary flex items-center gap-2">
                <Download className="w-4 h-4" />
                Exporter
              </button>
            }
          />
           <SettingRow
            icon={Upload}
            title="Import des Statistiques"
            description="Charger des statistiques depuis un fichier JSON."
            action={
              <div className="relative">
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleImportStats}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <button className="btn-secondary flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Importer
                </button>
              </div>
            }
          />
        </div>
      </Card>

      {/* Database section */}
      <Card title={t('settings.database.title')} subtitle={t('settings.database.subtitle')}>
        <div className="space-y-4">
          <SettingRow
            icon={Calculator}
            title={t('settings.database.recalc.title')}
            description={t('settings.database.recalc.desc')}
            action={
              <button
                onClick={handleRecalculateEV}
                disabled={isRecalculating}
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
                {isRecalculating ? t('settings.database.recalc.button_loading') : t('settings.database.recalc.button')}
              </button>
            }
          />

          <SettingRow
            icon={Download}
            title={t('settings.database.export.title')}
            description={t('settings.database.export.desc')}
            action={
              <button 
                onClick={async () => {
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
                }}
                className="btn-secondary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {t('settings.database.export.button')}
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

      {/* About */}
      <Card title={t('settings.about.title')}>
        <div className="space-y-2 text-sm text-gray-400">
          <p><span className="text-white">Poker Tracker Pro</span> v1.0.0</p>
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
