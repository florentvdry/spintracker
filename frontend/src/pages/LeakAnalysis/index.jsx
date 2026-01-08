import { useState, useEffect } from 'react';
import { AlertTriangle, Play, Loader } from 'lucide-react';
import { Card, EmptyState, LoadingSpinner } from '@components/ui';
import { ipcService } from '@services/ipcService';
import { pythonService } from '@services/pythonService';
import { useAppStore } from '@stores/appStore';
import { useNotificationStore } from '@stores/notificationStore';
import LeaksList from './components/LeaksList';
import LeakDetails from './components/LeakDetails';
import { useTranslation } from 'react-i18next';

export default function LeakAnalysis() {
  const { t } = useTranslation();
  const heroName = useAppStore(state => state.heroName);
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
  }, [heroName]);

  const loadLeaks = async () => {
    setIsLoading(true);
    try {
      const result = await ipcService.analyzeLeaks({ ...filters, heroName });
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
        heroName
      });
      
      if (result.success) {
        addNotification({
          type: 'success',
          title: t('leak_analysis.analysis_complete'),
          message: t('leak_analysis.leaks_detected', { count: result.leaksFound || 0 }),
        });
        await loadLeaks();
      } else {
        addNotification({
          type: 'error',
          title: t('leak_analysis.analysis_error'),
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
          <h1 className="text-2xl font-bold text-white">{t('leak_analysis.title')}</h1>
          <p className="text-gray-400 mt-1">
            {t('leak_analysis.subtitle')}
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
          {isAnalyzing ? t('leak_analysis.analyzing') : t('leak_analysis.run_analysis')}
        </button>
      </div>

      {/* Severity stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">{t('leak_analysis.critical')}</p>
              <p className="text-2xl font-bold text-red-400">{severityStats.critical}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500/30" />
          </div>
        </Card>
        
        <Card className="border-l-4 border-l-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">{t('leak_analysis.major')}</p>
              <p className="text-2xl font-bold text-yellow-400">{severityStats.major}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-yellow-500/30" />
          </div>
        </Card>
        
        <Card className="border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">{t('leak_analysis.minor')}</p>
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
            title={t('leak_analysis.detected_leaks')} 
            subtitle={t('leak_analysis.errors_found', { count: leaks.length })}
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
                title={t('leak_analysis.no_leaks')}
                description={t('leak_analysis.run_prompt')}
              />
            )}
          </Card>
        </div>

        {/* Leak details */}
        <div>
          <Card title={t('common.details')}>
            {selectedLeak ? (
              <LeakDetails leak={selectedLeak} onClose={() => setSelectedLeak(null)} />
            ) : (
              <p className="text-gray-400 text-center py-8">
                {t('leak_analysis.select_prompt')}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
