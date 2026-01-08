import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AnalysisFilters from './components/AnalysisFilters';
import AnalysisDashboard from './components/AnalysisDashboard';
import AnalysisHandsList from './components/AnalysisHandsList';
import { Save, Upload, FileText, LayoutDashboard, List } from 'lucide-react';
import { usePlayersStore } from '@stores/playersStore';
import { ipcService } from '@services/ipcService';
import clsx from 'clsx';

export default function Analysis() {
  const { t } = useTranslation();
  const { loadPlayers } = usePlayersStore();
  
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'hands'

  const [filters, setFilters] = useState({
    HeroName: '',
    Situation: '',
    Action: '',
    MinStackBB: null,
    MaxStackBB: null,
    Positions: [],
    DateFrom: '',
    DateTo: ''
  });

  // Dashboard Data
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

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

  // Fetch Dashboard Data
  useEffect(() => {
    let mounted = true;
    const fetchDashboard = async () => {
      setDashboardLoading(true);
      try {
        const response = await ipcService.getAnalysisStats(filters);
        if (mounted && response.success) {
          setDashboardData(response.data);
        }
      } catch (err) {
        console.error("Failed to fetch analysis stats", err);
      } finally {
        if (mounted) setDashboardLoading(false);
      }
    };

    fetchDashboard();
    return () => { mounted = false; };
  }, [filters]);

  // Fetch Hands List Data (only when tab is active or filters/page change)
  useEffect(() => {
    if (activeTab !== 'hands') return;

    let mounted = true;
    const fetchHands = async () => {
      setHandsLoading(true);
      try {
        const request = {
            ...filters,
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

  const exportReport = () => {
    if (!dashboardData) return;

    const summary = [
      ['Metric', 'Value'],
      ['Total Hands', dashboardData.TotalHands],
      ['Total Profit', dashboardData.TotalProfit],
      ['VPIP', dashboardData.Vpip.toFixed(2) + '%'],
      ['PFR', dashboardData.Pfr.toFixed(2) + '%'],
      ['3-Bet', dashboardData.ThreeBet.toFixed(2) + '%'],
      ['WTSD', dashboardData.Wtsd.toFixed(2) + '%'],
      ['W$SD', dashboardData.Wsd.toFixed(2) + '%'],
      ['Aggression Freq', dashboardData.AggressionFreq.toFixed(2) + '%']
    ];

    const graphHeader = [['Date', 'Daily Profit', 'Cumulative Profit']];
    const graphRows = dashboardData.GraphData.map(p => [p.Date, p.Profit, p.CumulativeProfit]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + summary.map(e => e.join(",")).join("\n")
      + "\n\n"
      + graphHeader.map(e => e.join(",")).join("\n")
      + "\n"
      + graphRows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Analysis_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                onClick={() => setActiveTab('dashboard')}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all",
                    activeTab === 'dashboard' ? "bg-primary-500 text-white shadow" : "text-gray-400 hover:text-white"
                )}
             >
                <LayoutDashboard className="w-4 h-4" />
                {t('analysis.tabs.dashboard', 'Dashboard')}
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
            onClick={exportReport}
            className="btn btn-secondary flex items-center gap-2"
            disabled={!dashboardData}
          >
            <FileText className="w-4 h-4" />
            {t('analysis.export_report', 'Export')}
          </button>
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
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col">
          {activeTab === 'dashboard' ? (
              <AnalysisDashboard data={dashboardData} loading={dashboardLoading} />
          ) : (
              <AnalysisHandsList 
                hands={handsData.hands} 
                loading={handsLoading}
                page={handsData.page}
                totalPages={handsData.pages}
                totalHands={handsData.total}
                sortBy={handsSort}
                onPageChange={setHandsPage}
                onSortChange={setHandsSort}
                onSelectHand={(id) => console.log("Selected hand", id)} // Todo: open hand details
              />
          )}
        </div>
      </div>
    </div>
  );
}
