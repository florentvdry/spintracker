import { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Database, Calculator, Download, Upload } from 'lucide-react';
import { Card } from '@components/ui';
import { ipcService } from '@services/ipcService';
import { pythonService } from '@services/pythonService';
import { useNotificationStore } from '@stores/notificationStore';
import { useAppStore } from '@stores/appStore';

export default function Settings() {
  const [isRecalculating, setIsRecalculating] = useState(false);
  const addNotification = useNotificationStore(state => state.addNotification);
  const refreshAll = useAppStore(state => state.refreshAll);
  const [serverStatus, setServerStatus] = useState('checking');

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

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
      console.log('Delete result:', result); // Debug log

      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Données supprimées',
          message: result.message || 'Toutes les mains ont été supprimées',
        });
        await refreshAll();
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
      console.error('Delete error:', error);
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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Paramètres</h1>
        <p className="text-gray-400 mt-1">Configuration de l'application</p>
      </div>

      {/* Database section */}
      <Card title="Base de données" subtitle="Gestion des données">
        <div className="space-y-4">
          <SettingRow
            icon={Calculator}
            title="Recalculer toutes les statistiques"
            description="Recalcule l'équité de toutes les mains (peut prendre plusieurs minutes)"
            action={
              <button
                onClick={handleRecalculateEV}
                disabled={isRecalculating}
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
                {isRecalculating ? 'En cours...' : 'Recalculer'}
              </button>
            }
          />

          <SettingRow
            icon={Download}
            title="Exporter les données"
            description="Télécharger toutes vos mains au format ZIP (groupées par date)"
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
                Exporter
              </button>
            }
          />

          <SettingRow
            icon={Trash2}
            title="Supprimer toutes les données"
            description="Supprime définitivement toutes les mains et statistiques"
            action={
              <button
                onClick={handleDeleteAll}
                className="btn-danger flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer tout
              </button>
            }
          />
        </div>
      </Card>

      {/* Python backend */}
      <Card title="Serveur" subtitle="Calculs d'équité avancés">
        <div className="space-y-4">
          <SettingRow
            icon={Database}
            title="État du serveur"
            description="Le backend effectue les calculs d'équité en parallèle"
            action={
              <span className={`badge ${serverStatus === 'active' ? 'badge-success' : 'badge-danger'}`}>
                {serverStatus === 'active' ? 'Actif' : 'Inactif'}
              </span>
            }
          />
        </div>
      </Card>

      {/* About */}
      <Card title="À propos">
        <div className="space-y-2 text-sm text-gray-400">
          <p><span className="text-white">Poker Tracker Pro</span> v1.0.0</p>
          <p>Application de suivi et d'analyse pour le poker Spin & Go</p>
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
