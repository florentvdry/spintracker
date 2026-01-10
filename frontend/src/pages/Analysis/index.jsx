import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AnalysisFilters from './components/AnalysisFilters';
import AnalysisHandsList from './components/AnalysisHandsList';
import AnalysisHUD from './components/AnalysisHUD';
import RangeGrid from '../../components/charts/RangeGrid';
import { Save, Upload, FileText, List, Grid, Layers } from 'lucide-react';
import { usePlayersStore } from '@stores/playersStore';
import { useReplayerStore } from '@stores/replayerStore';
import { ipcService } from '@services/ipcService';
import clsx from 'clsx';

const ACTION_COLORS = {
  AllIn: '#b71c1c',
  Raise: '#f44336',
  Bet: '#ff9800',
  Call: '#4caf50',
  Check: '#9e9e9e',
  Fold: '#2196f3',
  None: '#1e293b'
};

export default function Analysis() {
  const { t } = useTranslation();
  const { loadPlayers } = usePlayersStore();
  const { openReplayer } = useReplayerStore();
  
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'hands'

  const [filters, setFilters] = useState({
    HeroName: '',
    Situation: '',
    Action: '',
    PlayerCount: null,
    MinStackBB: null,
    MaxStackBB: null,
    Positions: [],
    DateFrom: '',
    DateTo: '',
    // Street Actions
    PreflopBtnAction: '',
    PreflopSbAction: '',
    PreflopBbAction: '',
    FlopBtnAction: '',
    FlopSbAction: '',
    FlopBbAction: '',
    TurnBtnAction: '',
    TurnSbAction: '',
    TurnBbAction: '',
    RiverBtnAction: '',
    RiverSbAction: '',
    RiverBbAction: ''
  });

  // Hands List Data
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

  // Load players list on mount (for dropdown)
  useEffect(() => {
    loadPlayers({ limit: 1000 });
  }, []);

  // Fetch Hands List Data (only when tab is active or filters/page change)
  useEffect(() => {
    if (activeTab !== 'hands') return;

    let mounted = true;
    const fetchHands = async () => {
      setHandsLoading(true);
      try {
        // Sanitize filters: convert empty arrays/strings to null where appropriate to ensure backend ignores them
        const sanitizedFilters = { ...filters };
        
        // Ensure Positions is null if empty array, to strictly trigger "all positions" logic if backend treats [] differently
        if (sanitizedFilters.Positions && sanitizedFilters.Positions.length === 0) {
            sanitizedFilters.Positions = null;
        }

        const request = {
            ...sanitizedFilters,
            Page: handsPage,
            Limit: 50,
            SortBy: handsSort
        };

        const response = await ipcService.getAnalysisHands(request);
        if (mounted && response.success) {
            // Normalize case if needed (backend usually returns camelCase)
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
  }, [filters, activeTab, handsPage, handsSort]);

  // Reset page when filters change
  useEffect(() => {
    setHandsPage(1);
  }, [filters]);

  const saveConfig = () => {
    localStorage.setItem('analysis_config', JSON.stringify(filters));
    alert(t('analysis.config_saved', 'Configuration saved'));
  };

  const loadConfig = () => {
    const saved = localStorage.getItem('analysis_config');
    if (saved) {
      setFilters(JSON.parse(saved));
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
          {/* Tabs */}
          <div className="flex bg-dark-300 rounded-lg p-1 mr-4 border border-dark-100">
             <button
                onClick={() => setActiveTab('stats')}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all",
                    activeTab === 'stats' ? "bg-primary-500 text-white shadow" : "text-gray-400 hover:text-white"
                )}
             >
                <Grid className="w-4 h-4" />
                Stats
             </button>
             <button
                onClick={() => setActiveTab('hands')}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all",
                    activeTab === 'hands' ? "bg-primary-500 text-white shadow" : "text-gray-400 hover:text-white"
                )}
             >
                <List className="w-4 h-4" />
                {t('analysis.tabs.hands', 'Hands List')}
             </button>
          </div>

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
        {/* Left Sidebar - Filters */}
        <div className="w-80 flex-shrink-0 overflow-y-auto custom-scrollbar">
          <AnalysisFilters filters={filters} onChange={setFilters} />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden pr-2 flex flex-col">
          {activeTab === 'stats' && (
              <AnalysisHUD filters={filters} />
          )}
          {activeTab === 'hands' && (
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
          )}
        </div>
      </div>
    </div>
  );
}
