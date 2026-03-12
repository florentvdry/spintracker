import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AnalysisFilters from './components/AnalysisFilters';
import AnalysisHandsList from './components/AnalysisHandsList';
import { Save, Upload, List, Grid } from 'lucide-react';
import { usePlayersStore } from '@stores/playersStore';
import { useReplayerStore } from '@stores/replayerStore';
import { useFilterStore } from '@stores/filterStore';
import { ipcService } from '@services/ipcService';
import clsx from 'clsx';

export default function Analysis() {
  const { t } = useTranslation();
  const { loadPlayers } = usePlayersStore();
  const { openReplayer } = useReplayerStore();
  const { heroName, dateRange, customDateFrom, customDateTo, selectedSession, getDateRangeParams } = useFilterStore();
  
  const [activeTab, setActiveTab] = useState('hands');

  const [localFilters, setLocalFilters] = useState({
    situation: '',
    action: '',
    playerCount: null,
    minStackBB: null,
    maxStackBB: null,
    positions: [],
    preflopBtnAction: '',
    preflopSbAction: '',
    preflopBbAction: '',
    flopBtnAction: '',
    flopSbAction: '',
    flopBbAction: '',
    turnBtnAction: '',
    turnSbAction: '',
    turnBbAction: '',
    riverBtnAction: '',
    riverSbAction: '',
    riverBbAction: ''
  });

  const [handsData, setHandsData] = useState({
    hands: [],
    total: 0,
    page: 1,
    limit: 50,
    pages: 1
  });
  const [handsLoading, setHandsLoading] = useState(false);
  const [handsSort, setHandsSort] = useState('date_desc');
  const [handsPage, setHandsPage] = useState(1);

  const combinedFilters = useMemo(() => {
    const { dateFrom, dateTo } = getDateRangeParams();
    return {
      heroName: heroName,
      dateFrom: dateFrom,
      dateTo: dateTo,
      ...localFilters
    };
  }, [heroName, dateRange, customDateFrom, customDateTo, selectedSession, localFilters, getDateRangeParams]);

  useEffect(() => {
    loadPlayers({ limit: 1000 });
  }, []);

  useEffect(() => {
    if (activeTab !== 'hands') return;

    let mounted = true;
    const fetchHands = async () => {
      setHandsLoading(true);
      try {
        const sanitizedFilters = { ...combinedFilters };
        if (sanitizedFilters.positions && sanitizedFilters.positions.length === 0) {
            sanitizedFilters.positions = null;
        }

        const request = {
            ...sanitizedFilters,
            page: handsPage,
            limit: 50,
            sortBy: handsSort
        };

        const response = await ipcService.getAnalysisHands(request);
        if (mounted && response.success) {
            setHandsData({
                hands: response.data.hands || response.data.Hands || [],
                total: response.data.total || response.data.Total || 0,
                page: response.data.page || response.data.Page || 1,
                pages: response.data.pages || response.data.Pages || 1,
                limit: response.data.limit || response.data.Limit || 50
            });
        }
      } catch (err) {
        console.error("Failed to fetch analysis hands", err);
      } finally {
        if (mounted) setHandsLoading(false);
      }
    };

    fetchHands();
    return () => { mounted = false; };
  }, [combinedFilters, activeTab, handsPage, handsSort]);

  useEffect(() => {
    setHandsPage(1);
  }, [combinedFilters]);

  const saveConfig = () => {
    localStorage.setItem('analysis_config_v2', JSON.stringify(localFilters));
    alert(t('analysis.config_saved', 'Configuration saved'));
  };

  const loadConfig = () => {
    const saved = localStorage.getItem('analysis_config_v2');
    if (saved) {
      setLocalFilters(JSON.parse(saved));
      alert(t('analysis.config_loaded', 'Configuration loaded'));
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold gradient-text">
          {t('analysis.title', 'Statistical Analysis')}
        </h1>
        <div className="flex gap-2">
          <button 
            onClick={saveConfig}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
          </button>
          <button 
            onClick={loadConfig}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        <div className="w-80 flex-shrink-0 overflow-y-auto custom-scrollbar">
          <AnalysisFilters filters={combinedFilters} onChange={(updates) => setLocalFilters(prev => ({ ...prev, ...updates }))} />
        </div>

        <div className="flex-1 overflow-hidden pr-2 flex flex-col">
          <AnalysisHandsList 
            hands={handsData.hands} 
            loading={handsLoading}
            page={handsData.page}
            totalPages={handsData.pages}
            totalHands={handsData.total}
            sortBy={handsSort}
            onPageChange={setHandsPage}
            onSortChange={setHandsSort}
            onSelectHand={async (id) => {
              try {
                const res = await ipcService.getHandDetails(id);
                if (res.success) {
                  openReplayer(res.data);
                }
              } catch (e) {
                console.error("Failed to open replayer", e);
              }
            }} 
          />
        </div>
      </div>
    </div>
  );
}
