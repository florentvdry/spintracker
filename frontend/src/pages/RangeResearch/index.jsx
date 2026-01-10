import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import AnalysisFilters from '../Analysis/components/AnalysisFilters';
import RangeGrid from '../../components/charts/RangeGrid';
import { Save, Upload, Layers } from 'lucide-react';
import { usePlayersStore } from '@stores/playersStore';
import { useReplayerStore } from '@stores/replayerStore';
import { ipcService } from '@services/ipcService';
import clsx from 'clsx';
import { Play } from 'lucide-react';

const ACTION_COLORS = {
  AllIn: '#b71c1c',
  Raise: '#f44336',
  Bet: '#ff9800',
  Call: '#4caf50',
  Check: '#9e9e9e',
  Fold: '#2196f3',
  None: '#1e293b'
};

export default function RangeResearch() {
  const { t } = useTranslation();
  const { loadPlayers } = usePlayersStore();
  const { openReplayer, loadHandQueue } = useReplayerStore();
  
  const [filters, setFilters] = useState({
    HeroName: '',
    Situation: 'Preflop', // Default to Preflop for Range Research
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

  // Range Data
  const [rangeData, setRangeData] = useState({});
  const [rangeLoading, setRangeLoading] = useState(false);
  const [selectedRangeHand, setSelectedRangeHand] = useState(null);
  const [selectedRangeStats, setSelectedRangeStats] = useState(null);

  // Calculate Global Frequencies
  const globalStats = useMemo(() => {
    let total = 0;
    const actions = {};
    
    if (rangeData) {
        Object.values(rangeData).forEach(stats => {
            // Normalize property names (backend sends camelCase: actions)
            const acts = stats.actions || stats.Actions;
            if (stats && acts) {
                Object.entries(acts).forEach(([action, count]) => {
                    actions[action] = (actions[action] || 0) + count;
                    total += count;
                });
            }
        });
    }
    
    return { total, actions };
  }, [rangeData]);

  // Load players list on mount (for dropdown)
  useEffect(() => {
    loadPlayers({ limit: 1000 });
  }, []);

  // Fetch Range Data
  useEffect(() => {
    let mounted = true;
    const fetchRange = async () => {
      setRangeLoading(true);
      try {
        console.log("Fetching range with filters:", filters);
        
        // Ensure filters are clean for range analysis
        // Range analysis is typically "Preflop" unless specified
        const rangeFilters = { ...filters };
        if (!rangeFilters.Situation) rangeFilters.Situation = 'Preflop';

        const response = await ipcService.getRangeBreakdown(rangeFilters);
        console.log("Range response:", response);
        if (mounted && response.success) {
          setRangeData(response.data);
        }
      } catch (err) {
        console.error("Failed to fetch range breakdown", err);
      } finally {
        if (mounted) setRangeLoading(false);
      }
    };
    
    fetchRange();
    return () => { mounted = false; };
  }, [filters]);

  const handleOpenReplayer = async (handIds) => {
    if (!handIds || handIds.length === 0) return;
    loadHandQueue(handIds);
  };

  const saveConfig = () => {
    localStorage.setItem('range_research_config', JSON.stringify(filters));
    alert(t('analysis.config_saved', 'Configuration saved'));
  };

  const loadConfig = () => {
    const saved = localStorage.getItem('range_research_config');
    if (saved) {
      setFilters(JSON.parse(saved));
      alert(t('analysis.config_loaded', 'Configuration loaded'));
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold gradient-text flex items-center gap-3">
          <Layers className="w-8 h-8 text-primary-500" />
          Range Research
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
        {/* Left Sidebar - Filters */}
        <div className="w-80 flex-shrink-0 overflow-y-auto custom-scrollbar">
          <AnalysisFilters filters={filters} onChange={setFilters} />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col">
          <div className="flex gap-4 h-full">
            {/* Left: Range Grid */}
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
            
            {/* Right: Details Panel */}
            <div className="w-96 bg-dark-200 rounded-lg shadow-lg flex flex-col min-h-0 border-l border-dark-100">
              <div className="p-4 border-b border-dark-100">
                 <h3 className="text-lg font-bold text-white">Range Breakdown</h3>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-8">
                {/* Global Frequencies */}
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
                               <div className="text-xl font-bold text-white">{selectedRangeStats?.TotalCount !== undefined ? selectedRangeStats.TotalCount : (selectedRangeStats?.totalCount || 0)}</div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                           <div className="bg-dark-300 p-3 rounded-lg">
                               <div className="text-xs text-gray-400">Net Profit</div>
                               <div className={clsx("text-lg font-bold", ((selectedRangeStats?.TotalProfit !== undefined ? selectedRangeStats.TotalProfit : selectedRangeStats?.totalProfit) || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                                 {((selectedRangeStats?.TotalProfit !== undefined ? selectedRangeStats.TotalProfit : selectedRangeStats?.totalProfit) || 0).toFixed(0)} chips
                               </div>
                           </div>
                        <div className="bg-dark-300 p-3 rounded-lg">
                            <div className="text-xs text-gray-400">EV (Chips)</div>
                            <div className={clsx("text-lg font-bold", ((selectedRangeStats?.TotalEv !== undefined ? selectedRangeStats.TotalEv : selectedRangeStats?.totalEv) || 0) >= 0 ? "text-yellow-400" : "text-red-400")}>
                              {((selectedRangeStats?.TotalEv !== undefined ? selectedRangeStats.TotalEv : selectedRangeStats?.totalEv) || 0).toFixed(2)}
                            </div>
                        </div>
                     </div>
                     
                     <div className="space-y-3">
                       <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider border-b border-dark-100 pb-2">Action Distribution</h4>
                       {Object.entries(selectedRangeStats?.Actions || selectedRangeStats?.actions || {})
                         .sort((a, b) => b[1] - a[1])
                         .map(([action, count]) => {
                           // Normalize total count access
                           const total = selectedRangeStats.TotalCount !== undefined ? selectedRangeStats.TotalCount : (selectedRangeStats.totalCount || 0);
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

                     {/* Hands List for Replayer */}
                     {(selectedRangeStats?.Hands || selectedRangeStats?.hands) && (
                        <div className="pt-4 border-t border-dark-100">
                           <div className="flex justify-between items-center mb-2">
                               <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Hands</h4>
                               <button 
                                 onClick={() => handleOpenReplayer((selectedRangeStats.Hands || selectedRangeStats.hands).map(h => h.id || h.Id))}
                                 className="text-xs flex items-center gap-1 text-primary-400 hover:text-primary-300 transition-colors"
                               >
                                  <Play className="w-3 h-3" />
                                  Replay All
                               </button>
                           </div>
                           <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                              {(selectedRangeStats.Hands || selectedRangeStats.hands).map((hand, idx) => {
                                  const handId = hand.id || hand.Id;
                                  const profit = hand.profit !== undefined ? hand.profit : hand.Profit;
                                  const ev = hand.ev !== undefined ? hand.ev : hand.Ev;
                                  const date = new Date(hand.date || hand.Date);
                                  
                                  return (
                                    <div 
                                      key={handId + idx} 
                                      className="flex justify-between items-center p-2 bg-dark-300 rounded hover:bg-dark-400 cursor-pointer transition-colors group"
                                      onClick={() => handleOpenReplayer([handId])}
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-500 font-mono">
                                                {date.toLocaleDateString()} {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                            <div className="flex gap-2 items-center">
                                                <span className={clsx("text-xs font-bold", profit >= 0 ? "text-green-400" : "text-red-400")}>
                                                    {profit >= 0 ? '+' : ''}{profit.toFixed(0)}
                                                </span>
                                                <span className="text-[10px] text-gray-400">chips</span>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <div className="text-[9px] text-gray-500 uppercase">EV</div>
                                                <div className={clsx("text-xs font-semibold", (ev || 0) >= 0 ? "text-yellow-500" : "text-orange-600")}>
                                                    {ev !== null && ev !== undefined ? ev.toFixed(0) : '—'}
                                                </div>
                                            </div>
                                            <Play className="w-3 h-3 text-gray-500 group-hover:text-primary-400" />
                                        </div>
                                    </div>
                                  );
                              })}
                           </div>
                        </div>
                     )}
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
        </div>
      </div>
    </div>
  );
}