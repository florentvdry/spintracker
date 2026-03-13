import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Calendar, RotateCcw, Layers, Search, ChevronDown, Info } from 'lucide-react';
import clsx from 'clsx';
import { usePlayersStore } from '@stores/playersStore';

const GET_SITUATIONS = (t) => ({
  3: {
    BTN: [
      { id: 'rfi', situationId: 'rfi', label: t('range_analysis.situations.rfi'), sequence: [], positions: ['BTN'] },
      { id: 'limp', situationId: 'limp', label: t('range_analysis.situations.limp'), sequence: [], positions: ['BTN'] },
    ],
    SB: [
      { id: 'sb_rfi', situationId: 'sb_rfi', label: t('range_analysis.situations.sb_rfi'), sequence: ['BTN:fold'], positions: ['SB'] },
      { id: 'vs_btn_open', situationId: 'vs_btn_open', label: t('range_analysis.situations.vs_btn_open'), sequence: ['BTN:raise'], positions: ['SB'] },
      { id: 'vs_btn_limp', situationId: 'vs_btn_limp', label: t('range_analysis.situations.vs_btn_limp'), sequence: ['BTN:call'], positions: ['SB'] },
    ],
    BB: [
      { id: 'vs_btn_open_sb_fold', situationId: 'vs_btn_open_sb_fold', label: t('range_analysis.situations.vs_btn_open_sb_fold'), sequence: ['BTN:raise', 'SB:fold'], positions: ['BB'] },
      { id: 'vs_sb_open', situationId: 'vs_sb_open', label: t('range_analysis.situations.vs_sb_open'), sequence: ['BTN:fold', 'SB:raise'], positions: ['BB'] },
      { id: 'vs_btn_open_sb_call', situationId: 'vs_btn_open_sb_call', label: t('range_analysis.situations.vs_btn_open_sb_call'), sequence: ['BTN:raise', 'SB:call'], positions: ['BB'] },
      { id: 'vs_sb_limp', situationId: 'vs_sb_limp', label: t('range_analysis.situations.vs_sb_limp'), sequence: ['BTN:fold', 'SB:call'], positions: ['BB'] },
      { id: 'vs_btn_limp_sb_limp', situationId: 'vs_btn_limp_sb_limp', label: t('range_analysis.situations.vs_btn_limp_sb_limp'), sequence: ['BTN:call', 'SB:call'], positions: ['BB'] },
      { id: 'vs_btn_limp_sb_fold', situationId: 'vs_btn_limp_sb_fold', label: t('range_analysis.situations.vs_btn_limp_sb_fold'), sequence: ['BTN:call', 'SB:fold'], positions: ['BB'] },
    ]
  },
  2: {
    SB: [
        { id: 'hu_sb_rfi', situationId: 'hu_sb_rfi', label: t('range_analysis.situations.hu_sb_rfi'), sequence: [], positions: ['SB'] },
        { id: 'hu_sb_limp', situationId: 'hu_sb_limp', label: t('range_analysis.situations.hu_sb_limp'), sequence: [], positions: ['SB'] },
    ],
    BB: [
        { id: 'hu_vs_sb_open', situationId: 'hu_vs_sb_open', label: t('range_analysis.situations.hu_vs_sb_open'), sequence: ['SB:raise'], positions: ['BB'] },
        { id: 'hu_vs_sb_limp', situationId: 'hu_vs_sb_limp', label: t('range_analysis.situations.hu_vs_sb_limp'), sequence: ['SB:call'], positions: ['BB'] },
    ]
  }
});

export default function SituationSelector({ filters, onChange }) {
  const { t } = useTranslation();
  const { players } = usePlayersStore();
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPosition, setSelectedPosition] = useState(filters.Positions?.[0] || (filters.PlayerCount === 2 ? 'SB' : 'BTN'));

  useEffect(() => {
    if (filters.Positions?.[0]) {
      setSelectedPosition(filters.Positions[0]);
    }
  }, [filters.Positions]);

  const SITUATIONS = useMemo(() => GET_SITUATIONS(t), [t]);

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availablePositions = filters.PlayerCount === 2 ? ['SB', 'BB'] : ['BTN', 'SB', 'BB'];
  const currentSituations = SITUATIONS[filters.PlayerCount]?.[selectedPosition] || [];

  const handleSituationSelect = (sit) => {
    onChange({
      ...filters,
      Positions: sit.positions,
      ActionSequence: sit.sequence,
      SituationId: sit.situationId
    });
  };

  const handlePositionChange = (pos) => {
    setSelectedPosition(pos);
    const firstSit = SITUATIONS[filters.PlayerCount]?.[pos]?.[0];
    if (firstSit) {
        handleSituationSelect(firstSit);
    }
  };

  const handlePlayerCountChange = (count) => {
    const newPos = count === 2 ? 'SB' : 'BTN';
    setSelectedPosition(newPos);
    const firstSit = SITUATIONS[count]?.[newPos]?.[0];
    
    onChange({
      ...filters,
      PlayerCount: count,
      Positions: firstSit?.positions || [newPos],
      ActionSequence: firstSit?.sequence || [],
      SituationId: firstSit?.situationId || 'rfi'
    });
  };

  const currentSitId = useMemo(() => {
    return filters.SituationId || currentSituations[0]?.situationId;
  }, [filters.SituationId, currentSituations]);

  return (
    <div className="bg-dark-200 rounded-xl p-5 shadow-2xl flex flex-col gap-6 border border-white/5 relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-500/5 blur-3xl rounded-full"></div>
      
      {/* Context Row */}
      <div className="flex flex-wrap items-center gap-6 pb-5 border-b border-white/5">
        
        {/* Player Count */}
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t('range_analysis.filters.table_size')}</span>
            <div className="flex bg-dark-400 rounded-lg p-1 border border-white/5">
                {[2, 3].map(count => (
                    <button
                        key={count}
                        onClick={() => handlePlayerCountChange(count)}
                        className={clsx(
                            "px-4 py-1.5 text-xs font-bold rounded-md transition-all duration-200", 
                            filters.PlayerCount === count ? "bg-primary-500 text-white shadow-lg shadow-primary-500/20" : "text-gray-400 hover:text-white"
                        )}
                    >
                        {count === 2 ? 'Heads-Up' : '3-Max'}
                    </button>
                ))}
            </div>
        </div>

        {/* Player Selector */}
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t('range_analysis.filters.target_player')}</span>
            <div className="relative">
                <div 
                    className="flex items-center gap-3 cursor-pointer bg-dark-400 border border-white/5 rounded-lg px-4 py-2 text-sm text-white hover:border-primary-500/50 transition-all min-w-[200px] shadow-inner"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <User className="w-4 h-4 text-primary-400" />
                    <span className="flex-1 truncate font-medium">{filters.HeroName || t('range_analysis.filters.population')}</span>
                    <ChevronDown className={clsx("w-4 h-4 text-gray-500 transition-transform", isDropdownOpen && "rotate-180")} />
                </div>

                {isDropdownOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                        <div className="absolute top-full left-0 mt-2 w-72 bg-dark-300 border border-white/10 rounded-xl shadow-2xl z-50 flex flex-col max-h-80 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-3 border-b border-white/5 bg-dark-400/50">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input 
                                        type="text" 
                                        placeholder={t('common.search')} 
                                        className="w-full bg-dark-500 border border-white/5 rounded-lg pl-10 pr-4 py-2 text-xs text-gray-200 focus:outline-none focus:border-primary-500/50"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        autoFocus
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-1 custom-scrollbar p-1">
                                <div 
                                    className={clsx(
                                        "px-4 py-3 text-sm cursor-pointer rounded-lg mx-1 my-0.5 transition-colors flex items-center gap-3",
                                        !filters.HeroName ? "bg-primary-500/20 text-primary-400 font-bold" : "text-gray-300 hover:bg-white/5"
                                    )}
                                    onClick={() => {
                                        onChange({...filters, HeroName: ''});
                                        setIsDropdownOpen(false);
                                    }}
                                >
                                    <div className="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center">
                                        <Layers className="w-4 h-4" />
                                    </div>
                                    <span>{t('range_analysis.filters.population')}</span>
                                </div>
                                {filteredPlayers.map(p => (
                                    <div 
                                        key={p.name} 
                                        className={clsx(
                                            "px-4 py-2.5 text-sm cursor-pointer rounded-lg mx-1 my-0.5 transition-colors flex items-center gap-3",
                                            filters.HeroName === p.name ? "bg-primary-500/20 text-primary-400 font-bold" : "text-gray-300 hover:bg-white/5"
                                        )}
                                        onClick={() => {
                                            onChange({...filters, HeroName: p.name});
                                            setIsDropdownOpen(false);
                                        }}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-dark-500 flex items-center justify-center text-[10px] font-bold text-gray-400 border border-white/5">
                                            {p.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <span>{p.name}</span>
                                            <span className="text-[10px] text-gray-500 font-normal">{p.total_hands.toLocaleString()} {t('common.hands')}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>

        {/* Stack Depth */}
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t('range_analysis.filters.stack_depth')}</span>
            <div className="flex items-center gap-2 bg-dark-400 border border-white/5 rounded-lg px-3 py-1.5 shadow-inner">
                <Layers className="w-4 h-4 text-gray-500" />
                <input 
                    type="number" 
                    placeholder="Min"
                    value={filters.MinStackBB || ''}
                    onChange={(e) => onChange({...filters, MinStackBB: e.target.value ? parseFloat(e.target.value) : null})}
                    className="bg-transparent border-none p-0 text-sm text-white w-12 focus:ring-0 placeholder:text-gray-600 font-medium"
                />
                <span className="text-gray-600">to</span>
                <input 
                    type="number" 
                    placeholder="Max"
                    value={filters.MaxStackBB || ''}
                    onChange={(e) => onChange({...filters, MaxStackBB: e.target.value ? parseFloat(e.target.value) : null})}
                    className="bg-transparent border-none p-0 text-sm text-white w-12 focus:ring-0 placeholder:text-gray-600 font-medium"
                />
            </div>
        </div>

        {/* Date Range */}
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t('range_analysis.filters.period')}</span>
            <div className="flex items-center gap-3 bg-dark-400 border border-white/5 rounded-lg px-4 py-1.5 shadow-inner">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input 
                    type="date" 
                    value={filters.DateFrom || ''}
                    onChange={(e) => onChange({...filters, DateFrom: e.target.value})}
                    className="bg-transparent border-none p-0 text-sm text-white w-28 focus:ring-0 invert-calendar"
                />
                <span className="text-gray-600">→</span>
                <input 
                    type="date" 
                    value={filters.DateTo || ''}
                    onChange={(e) => onChange({...filters, DateTo: e.target.value})}
                    className="bg-transparent border-none p-0 text-sm text-white w-28 focus:ring-0 invert-calendar"
                />
            </div>
        </div>

        <button 
            onClick={() => {
                onChange({
                    ...filters,
                    HeroName: '',
                    MinStackBB: null,
                    MaxStackBB: null,
                    DateFrom: '',
                    DateTo: '',
                    Positions: ['BTN'],
                    ActionSequence: [],
                    SituationId: 'rfi'
                });
                setSelectedPosition('BTN');
            }} 
            className="mt-5 ml-auto text-xs text-gray-500 hover:text-white flex items-center gap-2 transition-colors group"
        >
            <RotateCcw className="w-3.5 h-3.5 group-hover:rotate-[-45deg] transition-transform" /> 
            {t('range_analysis.filters.reset')}
        </button>
      </div>

      {/* Selection Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Step 1: Position */}
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">{t('range_analysis.filters.position')}</h3>
            </div>
            <div className="grid grid-cols-1 gap-2">
                {availablePositions.map(pos => (
                    <button
                        key={pos}
                        onClick={() => handlePositionChange(pos)}
                        className={clsx(
                            "flex items-center justify-between px-5 py-4 rounded-xl border transition-all duration-200 text-left group",
                            selectedPosition === pos 
                                ? "bg-primary-500/10 border-primary-500 text-primary-400 shadow-lg shadow-primary-500/5" 
                                : "bg-dark-400/50 border-white/5 text-gray-400 hover:border-white/10 hover:bg-dark-400"
                        )}
                    >
                        <div className="flex flex-col">
                            <span className="text-lg font-bold">{pos}</span>
                            <span className="text-[10px] opacity-60 uppercase tracking-tighter">
                                {pos === 'BTN' ? 'Button / Dealer' : pos === 'SB' ? 'Small Blind' : 'Big Blind'}
                            </span>
                        </div>
                        {selectedPosition === pos && <div className="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></div>}
                    </button>
                ))}
            </div>
        </div>

        {/* Step 2: Situation */}
        <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">{t('range_analysis.filters.situation')}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentSituations.map(sit => (
                    <button
                        key={sit.id}
                        onClick={() => handleSituationSelect(sit)}
                        className={clsx(
                            "flex flex-col gap-2 p-4 rounded-xl border transition-all duration-200 text-left relative overflow-hidden group",
                            currentSitId === sit.situationId 
                                ? "bg-white/5 border-primary-500/50 text-white" 
                                : "bg-dark-400/50 border-white/5 text-gray-400 hover:border-white/20 hover:bg-dark-400"
                        )}
                    >
                        {currentSitId === sit.situationId && (
                            <div className="absolute top-0 right-0 p-1">
                                <div className="bg-primary-500 text-[8px] font-black px-1.5 py-0.5 rounded text-white uppercase">{t('range_analysis.filters.active')}</div>
                            </div>
                        )}
                        <span className={clsx("text-sm font-bold transition-colors", currentSitId === sit.situationId ? "text-primary-400" : "group-hover:text-gray-200")}>
                            {sit.label}
                        </span>
                        
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {sit.sequence.length === 0 ? (
                                <span className="text-[9px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20 font-bold uppercase">{t('range_analysis.filters.first_to_act')}</span>
                            ) : (
                                sit.sequence.map((step, i) => {
                                    const [p, a] = step.split(':');
                                    return (
                                        <React.Fragment key={i}>
                                            <div className="flex items-center gap-1 bg-dark-500 px-2 py-0.5 rounded border border-white/5">
                                                <span className="text-[9px] font-bold text-gray-300">{p}</span>
                                                <span className={clsx(
                                                    "text-[9px] font-black uppercase",
                                                    a === 'raise' ? "text-red-400" : a === 'call' ? "text-green-400" : "text-blue-400"
                                                )}>{a}</span>
                                            </div>
                                            {i < sit.sequence.length - 1 && <span className="text-[10px] text-gray-600">→</span>}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </div>
                    </button>
                ))}
            </div>
            
            <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500 bg-blue-500/5 border border-blue-500/10 p-3 rounded-lg">
                <Info className="w-4 h-4 text-blue-400 shrink-0" />
                <div 
                    dangerouslySetInnerHTML={{ 
                        __html: t('range_analysis.filters.info_tip', { 
                            position: selectedPosition, 
                            player: filters.HeroName || t('range_analysis.filters.population') 
                        }) 
                    }} 
                />
            </div>
        </div>
      </div>

    </div>
  );
}
