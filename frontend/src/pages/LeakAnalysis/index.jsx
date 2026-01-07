import { useState, useEffect } from 'react';
import { AlertTriangle, Play, Loader } from 'lucide-react';
import { Card, EmptyState, LoadingSpinner } from '@components/ui';
import { ipcService } from '@services/ipcService';
import { pythonService } from '@services/pythonService';
import { useNotificationStore } from '@stores/notificationStore';
import LeaksList from './components/LeaksList';
import LeakDetails from './components/LeakDetails';

export default function LeakAnalysis() {
  const [leaks, setLeaks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedLeak, setSelectedLeak] = useState(null);
  const [filters, setFilters] = useState({
    severity: 'all',
    type: 'all',
  });
  
  const addNotification = useNotificationStore(state => state.addNotification);

  useEffect(() => {
    loadLeaks();
  }, []);

  const loadLeaks = async () => {
    setIsLoading(true);
    try {
      const result = await ipcService.analyzeLeaks(filters);
      if (result.success) {
        // The backend returns { leaks: [], total: 0 }
        setLeaks(result.data?.leaks || []);
      }
    } catch (error) {
      console.error('Failed to load leaks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runFullAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const result = await pythonService.analyzeLeaks({
        fullRecalculation: true,
      });
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: 'Analyse terminée',
          message: `${result.leaksFound || 0} leaks détectés`,
        });
        await loadLeaks();
      } else {
        addNotification({
          type: 'error',
          title: 'Erreur d\'analyse',
          message: result.message,
        });
      }
    } catch (error) {
      addNotification({
        type: 'error',
        message: error.message,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSeverityStats = () => {
    const stats = { critical: 0, major: 0, minor: 0 };
    leaks.forEach(leak => {
      if (leak.severity === 'critical') stats.critical++;
      else if (leak.severity === 'major') stats.major++;
      else stats.minor++;
    });
    return stats;
  };

  const severityStats = getSeverityStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analyse des Leaks</h1>
          <p className="text-gray-400 mt-1">
            Identifiez et corrigez vos erreurs de jeu
          </p>
        </div>
        
        <button
          onClick={runFullAnalysis}
          disabled={isAnalyzing}
          className="btn-primary flex items-center gap-2"
        >
          {isAnalyzing ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isAnalyzing ? 'Analyse en cours...' : 'Lancer l\'analyse'}
        </button>
      </div>

      {/* Severity stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Critiques</p>
              <p className="text-2xl font-bold text-red-400">{severityStats.critical}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500/30" />
          </div>
        </Card>
        
        <Card className="border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Majeurs</p>
              <p className="text-2xl font-bold text-yellow-400">{severityStats.major}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-yellow-500/30" />
          </div>
        </Card>
        
        <Card className="border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Mineurs</p>
              <p className="text-2xl font-bold text-blue-400">{severityStats.minor}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-blue-500/30" />
          </div>
        </Card>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaks list */}
        <div className="lg:col-span-2">
          <Card 
            title="Leaks détectés" 
            subtitle={`${leaks.length} erreurs trouvées`}
            padding={false}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner />
              </div>
            ) : leaks.length > 0 ? (
              <LeaksList 
                leaks={leaks} 
                onSelect={setSelectedLeak}
                selectedId={selectedLeak?.id}
              />
            ) : (
              <EmptyState
                icon={AlertTriangle}
                title="Aucun leak détecté"
                description="Lancez une analyse pour détecter vos erreurs de jeu"
              />
            )}
          </Card>
        </div>

        {/* Leak details */}
        <div>
          <Card title="Détails">
            {selectedLeak ? (
              <LeakDetails leak={selectedLeak} onClose={() => setSelectedLeak(null)} />
            ) : (
              <p className="text-gray-400 text-center py-8">
                Sélectionnez un leak pour voir les détails
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
