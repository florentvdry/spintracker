import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AnalysisFilters from './components/AnalysisFilters';
import AnalysisDashboard from './components/AnalysisDashboard';
import AnalysisHandsList from './components/AnalysisHandsList';
import AnalysisHUD from './components/AnalysisHUD';
import RangeGrid from '../../components/charts/RangeGrid';
import { Save, Upload, FileText, LayoutDashboard, List, Grid, Layers } from 'lucide-react';
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
  
  // const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'hands' | 'range' | 'hud'
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'hands' | 'hud'

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

  // Range Data
  // const [rangeData, setRangeData] = useState({});
  // const [rangeLoading, setRangeLoading] = useState(false);
  // const [selectedRangeHand, setSelectedRangeHand] = useState(null);
  // const [selectedRangeStats, setSelectedRangeStats] = useState(null);

  // Calculate Global Frequencies
  // const globalStats = useMemo(() => {
  //   let total = 0;
  //   const actions = {};
  //   
  //   Object.values(rangeData).forEach(stats => {
  //       Object.entries(stats.Actions).forEach(([action, count]) => {
  //           actions[action] = (actions[action] || 0) + count;
  //           total += count;
  //       });
  //   });
  //   
  //   return { total, actions };
  // }, [rangeData]);

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

  // Fetch Range Data
  // useEffect(() => {
  //   if (activeTab !== 'range') return;
  //   
  //   let mounted = true;
  //   const fetchRange = async () => {
  //     setRangeLoading(true);
  //     try {
  //       console.log("Fetching range with filters:", filters);
  //       
  //       // Ensure filters are clean for range analysis
  //       // Range analysis is typically "Preflop" unless specified
  //       const rangeFilters = { ...filters };
  //       if (!rangeFilters.Situation) rangeFilters.Situation = 'Preflop';
  //
  //       const response = await ipcService.getRangeBreakdown(rangeFilters);
  //       console.log("Range response:", response);
  //       if (mounted && response.success) {
  //         setRangeData(response.data);
  //       }
  //     } catch (err) {
  //       console.error("Failed to fetch range breakdown", err);
  //     } finally {
  //       if (mounted) setRangeLoading(false);
  //     }
  //   };
  //   
  //   fetchRange();
  //   return () => { mounted = false; };
  // }, [filters, activeTab]);

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
        
        console.log("Fetching hands with request:", request);

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
                onClick={() => setActiveTab('hud')}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all",
                    activeTab === 'hud' ? "bg-primary-500 text-white shadow" : "text-gray-400 hover:text-white"
                )}
             >
                <Grid className="w-4 h-4" />
                HUD
             </button>
             {/* <button
                onClick={() => setActiveTab('range')}
                className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all",
                    activeTab === 'range' ? "bg-primary-500 text-white shadow" : "text-gray-400 hover:text-white"
                )}
             >
                <Layers className="w-4 h-4" />
                Range research
             </button> */}
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
          {/* HUD Grid is now the primary dashboard view */}
          {activeTab === 'hud' && (
              <AnalysisHUD filters={filters} />
          )}
          {/* {activeTab === 'range' && (
              <div className="flex gap-4 h-full">
                
                <div className="flex-1 bg-dark-200 rounded-lg shadow-lg flex flex-col min-h-0">
                   <div className="p-4 border-b border-dark-100 flex justify-between items-center">
                     <h2 className="text-lg font-bold text-white">Range Matrix</h2>
                     <div className="flex gap-2 text-xs">
                        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#f44336]"></span>Raise</div>
                        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#4caf50]"></span>Call</div>
                        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#2196f3]"></span>Fold</div>
                     </div>
                   </div>
                   <div className="flex-1 p-4 overflow-auto flex items-center justify-center">
                      {rangeLoading ? (
                        <div className="text-gray-400">Loading range...</div>
                      ) : (
                        <RangeGrid 
                          data={rangeData} 
                          size="lg" 
                          onCellClick={(hand, stats) => {
                            setSelectedRangeHand(hand);
                            setSelectedRangeStats(stats);
                          }}
                          selectedHand={selectedRangeHand}
                          className="shadow-2xl"
                        />
                      )}
                   </div>
                </div>
                
                
                <div className="w-96 bg-dark-200 rounded-lg shadow-lg flex flex-col min-h-0 border-l border-dark-100">
                  <div className="p-4 border-b border-dark-100">
                     <h3 className="text-lg font-bold text-white">Range Breakdown</h3>
                  </div>
                  
                  <div className="p-6 overflow-y-auto space-y-8">
                    
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Overall Frequency</h4>
                        <div className="h-8 w-full flex rounded-md overflow-hidden bg-dark-300 relative">
                             {globalStats.total === 0 ? (
                                 <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">No Data</div>
                             ) : (
                                Object.entries(globalStats.actions)
                                  .sort((a, b) => b[1] - a[1]) // Sort by frequency
                                  .map(([action, count]) => {
                                      const percent = (count / globalStats.total) * 100;
                                      if (percent < 1) return null; // Hide tiny segments
                                      return (
                                         <div 
                                            key={action}
                                            className="h-full flex items-center justify-center text-[10px] font-bold text-white overflow-hidden transition-all duration-500"
                                            style={{
                                                width: `${percent}%`,
                                                backgroundColor: ACTION_COLORS[action] || ACTION_COLORS.None
                                            }}
                                            title={`${action}: ${percent.toFixed(1)}%`}
                                         >
                                             {percent > 10 && `${percent.toFixed(0)}%`}
                                         </div>
                                      );
                                  })
                             )}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-2">
                            {Object.entries(globalStats.actions)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 4) // Show top 4 actions in legend
                                .map(([action, count]) => (
                                <div key={action} className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full" style={{backgroundColor: ACTION_COLORS[action] || ACTION_COLORS.None}}></span>
                                    <span>{action}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-dark-100 my-4"></div>

                    {selectedRangeHand ? (
                      <div className="space-y-6">
                         <div className="flex items-center justify-between">
                             <div className="text-5xl font-bold font-mono text-primary-400">
                               {selectedRangeHand}
                             </div>
                             <div className="text-right">
                                <div className="text-sm text-gray-400">Hands</div>
                                <div className="text-xl font-bold text-white">{selectedRangeStats?.TotalCount || 0}</div>
                             </div>
                         </div>
                         
                         <div className="grid grid-cols-2 gap-4">
                            <div className="bg-dark-300 p-3 rounded-lg">
                                <div className="text-xs text-gray-400">Net Profit</div>
                                <div className={clsx("text-lg font-bold", (selectedRangeStats?.TotalProfit || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                                  {selectedRangeStats?.TotalProfit?.toFixed(2)} BB
                                </div>
                            </div>
                            <div className="bg-dark-300 p-3 rounded-lg">
                                <div className="text-xs text-gray-400">EV (Chips)</div>
                                <div className="text-lg font-bold text-yellow-400">--</div>
                            </div>
                         </div>
                         
                         <div className="space-y-3">
                           <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider border-b border-dark-100 pb-2">Action Distribution</h4>
                           {Object.entries(selectedRangeStats?.Actions || {})
                             .sort((a, b) => b[1] - a[1])
                             .map(([action, count]) => {
                               const total = selectedRangeStats.TotalCount;
                               const percent = total > 0 ? (count / total) * 100 : 0;
                               return (
                                 <div key={action} className="space-y-1">
                                   <div className="flex justify-between text-sm">
                                     <span className="font-medium text-gray-300">{action}</span>
                                     <span className="font-bold text-white">{percent.toFixed(1)}%</span>
                                   </div>
                                   <div className="h-3 bg-dark-300 rounded-full overflow-hidden relative">
                                     <div 
                                       className="h-full rounded-full absolute left-0 top-0 transition-all duration-500"
                                       style={{ 
                                         width: `${percent}%`,
                                         backgroundColor: ACTION_COLORS[action] || ACTION_COLORS.None
                                       }} 
                                     />
                                   </div>
                                   <div className="text-right text-xs text-gray-500">{count} combos</div>
                                 </div>
                               );
                           })}
                         </div>
                      </div>
                    ) : (
                      <div className="text-gray-500 text-center py-10 border-2 border-dashed border-dark-300 rounded-lg">
                        <div className="mb-2">Select a hand</div>
                        <div className="text-xs">Click any cell in the matrix to view detailed breakdown</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
          )} */}
          {activeTab === 'dashboard' && (
              <AnalysisDashboard data={dashboardData} loading={dashboardLoading} />
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
