import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SituationSelector from './components/SituationSelector';
import RangeGrid from '../../components/charts/RangeGrid';
import { Save, Upload, Layers, Info, Filter, BarChart3, List, ChevronRight, Play } from 'lucide-react';
import { usePlayersStore } from '@stores/playersStore';
import { useReplayerStore } from '@stores/replayerStore';
import { useFilterStore } from '@stores/filterStore';
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

export default function RangeResearch() {
  const { t } = useTranslation();
  const { loadPlayers } = usePlayersStore();
  const { loadHandQueue } = useReplayerStore();
  const { heroName, dateRange, customDateFrom, customDateTo, selectedSession, getDateRangeParams } = useFilterStore();
  
  const [localFilters, setLocalFilters] = useState({
    Situation: 'Preflop',
    Action: '',
    PlayerCount: 3,
    MinStackBB: null,
    MaxStackBB: null,
    Positions: ['BTN'], // Default to BTN
    ActionSequence: [],
  });

  // Combined filters for API requests
  const combinedFilters = useMemo(() => {
    const { dateFrom, dateTo } = getDateRangeParams();
    return {
      HeroName: heroName,
      DateFrom: dateFrom,
      DateTo: dateTo,
      ...localFilters
    };
  }, [heroName, dateRange, customDateFrom, customDateTo, selectedSession, localFilters, getDateRangeParams]);

  // Range Data
  const [rangeData, setRangeData] = useState({});
  const [rangeLoading, setRangeLoading] = useState(false);
  const [selectedRangeHand, setSelectedRangeHand] = useState(null);
  const [selectedRangeStats, setSelectedRangeStats] = useState(null);
  const [selectedActionFilter, setSelectedActionFilter] = useState(null);

  // Load players list on mount
  useEffect(() => {
    loadPlayers({ limit: 1000 });
  }, []);

  // Fetch Range Data
  useEffect(() => {
    let mounted = true;
    const fetchRange = async () => {
      setRangeLoading(true);
      try {
        const response = await ipcService.getRangeBreakdown(combinedFilters);
        if (mounted && response.success) {
          setRangeData(response.data);
          // Update selected range stats if something was selected
          if (selectedRangeHand) {
             setSelectedRangeStats(response.data[selectedRangeHand]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch range breakdown", err);
      } finally {
        if (mounted) setRangeLoading(false);
      }
    };
    
    fetchRange();
    return () => { mounted = false; };
  }, [combinedFilters]);

  const handleOpenReplayer = async (handIds) => {
    if (!handIds || handIds.length === 0) return;
    loadHandQueue(handIds, heroName);
  };

  const normalizeKey = (v) => {
    if (!v && v !== 0) return '';
    return String(v).replace(/[^a-z0-9]/gi, '').replace(/[0-9]/g, '').toLowerCase();
  };

  const handMatchesAction = (hand, action) => {
    if (!action) return true;
    const normAction = normalizeKey(action);
    const candidates = [hand?.action, hand?.Action, hand?.PreflopAction, hand?.ActionType, hand?.SummaryAction];
    for (const c of candidates) {
      if (!c) continue;
      const n = normalizeKey(c);
      if (n === normAction || n.includes(normAction) || normAction.includes(n)) return true;
    }
    return false;
  };

  const saveConfig = () => {
    localStorage.setItem('range_research_config_v2', JSON.stringify(localFilters));
    alert(t('range_analysis.config_saved', 'Configuration saved'));
  };

  const loadConfig = () => {
    const saved = localStorage.getItem('range_research_config_v2');
    if (saved) {
      setLocalFilters(JSON.parse(saved));
      alert(t('range_analysis.config_loaded', 'Configuration loaded'));
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-hidden bg-dark-400">
      <div className="flex items-center justify-between bg-dark-300 p-4 rounded-xl border border-white/5 shadow-lg">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center border border-primary-500/20 shadow-inner">
             <Layers className="w-6 h-6 text-primary-400" />
           </div>
           <div>
              <h1 className="text-xl font-bold text-white tracking-tight">{t('range_analysis.title')}</h1>
              <p className="text-xs text-gray-500">{t('range_analysis.subtitle')}</p>
           </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={loadConfig}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-400 border border-white/5 text-gray-400 hover:text-white hover:bg-dark-500 transition-all text-xs font-bold"
          >
            <Upload className="w-4 h-4" /> {t('range_analysis.load_preset')}
          </button>
          <button 
            onClick={saveConfig}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/20 transition-all text-xs font-bold"
          >
            <Save className="w-4 h-4" /> {t('range_analysis.save_config')}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6 min-h-0">
        {/* Situation Selector */}
        <SituationSelector filters={combinedFilters} onChange={(updates) => setLocalFilters(prev => ({ ...prev, ...updates }))} />

        {/* Main Content Area */}
        <div className="flex-1 flex gap-6 min-h-0">
            {/* Left: Range Matrix Card */}
            <div className="flex-1 bg-dark-200 rounded-2xl shadow-2xl border border-white/5 flex flex-col min-h-0 overflow-hidden relative">
               <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <BarChart3 className="w-32 h-32" />
               </div>
               
               <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-dark-300/30">
                 <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-primary-400" />
                    <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">{t('range_analysis.matrix_title')}</h2>
                 </div>
                 <div className="flex gap-4">
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#f44336] shadow-sm shadow-red-500/50"></span><span className="text-[10px] font-bold text-gray-400 uppercase">{t('actions.raise')}</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#4caf50] shadow-sm shadow-green-500/50"></span><span className="text-[10px] font-bold text-gray-400 uppercase">{t('actions.call')}</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#2196f3] shadow-sm shadow-blue-500/50"></span><span className="text-[10px] font-bold text-gray-400 uppercase">{t('actions.fold')}</span></div>
                 </div>
               </div>

               <div className="flex-1 p-6 overflow-auto flex items-center justify-center custom-scrollbar">
                  {rangeLoading ? (
                    <div className="flex flex-col items-center gap-4 text-gray-500 animate-pulse">
                        <div className="w-12 h-12 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div>
                        <span className="text-sm font-medium tracking-wide">{t('range_analysis.loading')}</span>
                    </div>
                  ) : (
                    <RangeGrid 
                      data={rangeData} 
                      size="lg" 
                      onCellClick={(hand, stats) => {
                        setSelectedRangeHand(hand);
                        setSelectedRangeStats(stats);
                        setSelectedActionFilter(null);
                      }}
                      selectedHand={selectedRangeHand}
                      className="shadow-2xl border border-white/10"
                    />
                  )}
               </div>
            </div>
            
            {/* Right: Breakdown & Hands Panel */}
            <div className="w-[450px] flex flex-col gap-6 min-h-0">
               {/* Selection Info Card */}
               <div className="bg-dark-200 rounded-2xl shadow-xl border border-white/5 p-6 relative overflow-hidden flex-shrink-0">
                   {selectedRangeHand ? (
                       <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                           <div className="flex items-end justify-between border-b border-white/5 pb-4">
                               <div className="flex flex-col">
                                   <span className="text-[10px] font-bold text-primary-400 uppercase tracking-widest mb-1">{t('range_analysis.selected_hand')}</span>
                                   <div className="text-6xl font-black font-mono text-white leading-none">
                                     {selectedRangeHand}
                                   </div>
                               </div>
                               <div className="text-right">
                                   <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('range_analysis.occurrences')}</div>
                                   <div className="text-3xl font-black text-white leading-none">
                                     {selectedRangeStats?.TotalCount || 0}
                                   </div>
                               </div>
                           </div>
                           
                           <div className="grid grid-cols-2 gap-3">
                               <div className="bg-dark-300/50 p-4 rounded-xl border border-white/5">
                                   <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('range_analysis.total_profit')}</div>
                                   <div className={clsx("text-xl font-black", (selectedRangeStats?.TotalProfit || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                                     {(selectedRangeStats?.TotalProfit || 0).toFixed(0)} <span className="text-[10px] opacity-50">{t('common.chips')}</span>
                                   </div>
                               </div>
                               <div className="bg-dark-300/50 p-4 rounded-xl border border-white/5">
                                   <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('range_analysis.ev_realized')}</div>
                                   <div className={clsx("text-xl font-black", (selectedRangeStats?.TotalEv || 0) >= 0 ? "text-yellow-400" : "text-orange-500")}>
                                     {(selectedRangeStats?.TotalEv || 0).toFixed(1)}
                                   </div>
                               </div>
                           </div>
                       </div>
                   ) : (
                       <div className="flex flex-col items-center justify-center py-8 text-gray-500 gap-3">
                           <Info className="w-8 h-8 opacity-20" />
                           <p className="text-sm font-medium text-center" dangerouslySetInnerHTML={{ __html: t('range_analysis.select_prompt').replace('\n', '<br/>') }} />
                       </div>
                   )}
               </div>

               {/* Action Distribution & Hands List */}
               <div className="flex-1 bg-dark-200 rounded-2xl shadow-xl border border-white/5 flex flex-col min-h-0 overflow-hidden">
                   <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-dark-300/30">
                       <div className="flex items-center gap-2">
                           <BarChart3 className="w-4 h-4 text-primary-400" />
                           <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">{t('range_analysis.distributions')}</h2>
                       </div>
                   </div>

                   <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                       {selectedRangeHand ? (
                           <>
                               {/* Action Chips */}
                               <div className="space-y-3">
                                   <div className="flex justify-between items-center">
                                       <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('range_analysis.frequencies')}</span>
                                   </div>
                                   <div className="grid grid-cols-3 gap-2">
                                       {Object.entries(selectedRangeStats?.Actions || {})
                                           .sort((a, b) => b[1] - a[1])
                                           .map(([action, count]) => {
                                               const total = selectedRangeStats.TotalCount || 0;
                                               const percent = total > 0 ? (count / total) * 100 : 0;
                                               const isSelected = selectedActionFilter === action;
                                               return (
                                                   <button
                                                       key={action}
                                                       onClick={() => setSelectedActionFilter(prev => prev === action ? null : action)}
                                                       className={clsx(
                                                           "flex flex-col p-3 rounded-xl border transition-all relative overflow-hidden group",
                                                           isSelected ? "ring-2 ring-white border-transparent" : "border-transparent"
                                                       )}
                                                       style={{ backgroundColor: (ACTION_COLORS[action] || ACTION_COLORS.None) + '22' }}
                                                   >
                                                       <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: ACTION_COLORS[action] || ACTION_COLORS.None }} />
                                                       <span className="text-[10px] font-bold uppercase opacity-60 mb-1">{action}</span>
                                                       <span className="text-lg font-black text-white leading-none">{percent.toFixed(0)}%</span>
                                                       <span className="text-[9px] mt-1 opacity-40">{count} {t('common.hands')}</span>
                                                   </button>
                                               );
                                           })}
                                   </div>
                               </div>

                               {/* Hands List */}
                               <div className="space-y-3 pt-4 border-t border-white/5">
                                   <div className="flex justify-between items-center">
                                       <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('range_analysis.history')}</span>
                                       <button 
                                           onClick={() => {
                                               const list = selectedRangeStats.Hands || [];
                                               const filtered = selectedActionFilter ? list.filter(h => handMatchesAction(h, selectedActionFilter)) : list;
                                               handleOpenReplayer(filtered.map(h => h.id || h.Id));
                                           }}
                                           className="text-[10px] font-bold text-primary-400 hover:text-primary-300 flex items-center gap-1.5 uppercase transition-colors"
                                       >
                                           <Play className="w-3 h-3" /> {t('range_analysis.replay_filtered')}
                                       </button>
                                   </div>
                                   <div className="space-y-2">
                                       {(selectedRangeStats.Hands || []).filter(h => handMatchesAction(h, selectedActionFilter)).map((hand, idx) => {
                                           const handId = hand.id || hand.Id;
                                           const profit = hand.profit !== undefined ? hand.profit : hand.Profit;
                                           const ev = hand.ev !== undefined ? hand.ev : hand.Ev;
                                           const action = hand.action || hand.Action;
                                           const date = new Date(hand.date || hand.Date);
                                           
                                           return (
                                               <div 
                                                   key={handId + idx} 
                                                   onClick={() => handleOpenReplayer([handId])}
                                                   className="flex items-center gap-3 p-3 bg-dark-400/50 rounded-xl border border-white/5 hover:border-white/10 hover:bg-dark-300 transition-all cursor-pointer group"
                                               >
                                                   <div className="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center text-[10px] font-bold text-gray-500 group-hover:text-primary-400 transition-colors">
                                                       {idx + 1}
                                                   </div>
                                                   <div className="flex-1 min-w-0">
                                                       <div className="flex items-center justify-between mb-0.5">
                                                           <span className={clsx(
                                                               "text-[10px] font-black uppercase tracking-tighter",
                                                               action === 'Raise' || action === 'AllIn' ? "text-red-400" : action === 'Call' ? "text-green-400" : "text-blue-400"
                                                           )}>
                                                               {action}
                                                           </span>
                                                           <span className="text-[9px] text-gray-600 font-mono">
                                                               {date.toLocaleDateString()}
                                                           </span>
                                                       </div>
                                                       <div className="flex items-center gap-2">
                                                            <span className={clsx("text-xs font-bold", profit >= 0 ? "text-green-400" : "text-red-400")}>
                                                                {profit >= 0 ? '+' : ''}{profit.toFixed(0)} <span className="text-[9px] opacity-60">{t('common.chips')}</span>
                                                            </span>
                                                            <div className="w-1 h-1 rounded-full bg-white/5"></div>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[9px] text-gray-500 font-bold uppercase">EV</span>
                                                                <span className={clsx("text-[10px] font-bold", (ev || 0) >= 0 ? "text-yellow-500/80" : "text-orange-500/80")}>
                                                                    {ev !== null && ev !== undefined ? ev.toFixed(1) : '—'}
                                                                </span>
                                                            </div>
                                                       </div>
                                                   </div>
                                                   <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-all transform group-hover:translate-x-1" />
                                               </div>
                                           );
                                       })}
                                   </div>
                               </div>
                           </>
                       ) : (
                           <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                               <Layers className="w-12 h-12" />
                               <p className="text-xs text-center font-medium" dangerouslySetInnerHTML={{ __html: t('range_analysis.select_prompt').replace('\n', '<br/>') }} />
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
