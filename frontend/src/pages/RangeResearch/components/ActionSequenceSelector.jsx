import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Calendar, RotateCcw, ArrowRight, Layers, Search, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { usePlayersStore } from '@stores/playersStore';

const POSITIONS_3MAX = ['BTN', 'SB', 'BB'];
const POSITIONS_HU = ['SB', 'BB'];

const ACTIONS = [
  { label: 'Fold', value: 'fold', color: 'bg-blue-500 hover:bg-blue-600' },
  { label: 'Check', value: 'check', color: 'bg-gray-500 hover:bg-gray-600' },
  { label: 'Call', value: 'call', color: 'bg-green-500 hover:bg-green-600' },
  { label: 'Raise', value: 'raise', color: 'bg-red-500 hover:bg-red-600' },
  { label: 'All-in', value: 'all-in', color: 'bg-red-700 hover:bg-red-800' },
];

export default function ActionSequenceSelector({ filters, onChange }) {
  const { t } = useTranslation();
  const { players } = usePlayersStore();
  
  // Local state for the sequence of actions
  // Each item: { position: 'BTN', action: 'raise', label: 'Raise' }
  const [sequence, setSequence] = useState([]);
  const [nextPosition, setNextPosition] = useState(null);

  // States for searchable player dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPlayers = players.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Initialize/Reset based on filters or defaults
  useEffect(() => {
    // If filters have no actions, reset sequence
    const hasActions = ['BTN', 'SB', 'BB'].some(pos => {
        const key = `Preflop${pos.charAt(0) + pos.slice(1).toLowerCase()}Action`;
        return filters[key];
    });
    if (!hasActions && sequence.length > 0) {
      setSequence([]);
      // Reset next position if sequence is cleared externally
      setNextPosition(filters.PlayerCount === 2 ? 'SB' : 'BTN');
    }
  }, [filters]);

  // Determine the starting position based on player count
  useEffect(() => {
    if (sequence.length === 0) {
        setNextPosition(filters.PlayerCount === 2 ? 'SB' : 'BTN');
    }
  }, [filters.PlayerCount, sequence]);

  const handlePlayerCountChange = (count) => {
    onChange({
      ...filters,
      PlayerCount: count,
      // Reset actions when changing player count
      PreflopBtnAction: '',
      PreflopSbAction: '',
      PreflopBbAction: ''
    });
    setSequence([]);
    setNextPosition(count === 2 ? 'SB' : 'BTN');
  };

  const handleAction = (actionObj) => {
    if (!nextPosition) return;

    const newItem = {
      position: nextPosition,
      action: actionObj.value,
      label: actionObj.label
    };

    const newSequence = [...sequence, newItem];
    setSequence(newSequence);

    // Update parent filters
    // We map the *latest* action for a position to the filter
    // This is a simplification but fits the existing filter structure
    const newFilters = { ...filters };
    newFilters[`Preflop${nextPosition.charAt(0) + nextPosition.slice(1).toLowerCase()}Action`] = actionObj.value;
    // NEW: Add ordered sequence
    newFilters.ActionSequence = newSequence.map(item => `${item.position}:${item.action}`);
    
    onChange(newFilters);

    // Calculate next position
    let posList = filters.PlayerCount === 2 ? POSITIONS_HU : POSITIONS_3MAX;
    let currentIdx = posList.indexOf(nextPosition);
    let nextIdx = (currentIdx + 1) % posList.length;
    setNextPosition(posList[nextIdx]);
  };

  const handleReset = () => {
    setSequence([]);
    onChange({
        ...filters,
        PreflopBtnAction: '',
        PreflopSbAction: '',
        PreflopBbAction: '',
        ActionSequence: [] // Clear sequence
    });
    setNextPosition(filters.PlayerCount === 2 ? 'SB' : 'BTN');
  };

  const undoLastAction = () => {
      if (sequence.length === 0) return;
      const newSequence = sequence.slice(0, -1);
      setSequence(newSequence);
      
      // Re-sync filters from scratch based on new sequence
      const newFilters = { ...filters };
      // Clear all first
      ['Btn', 'Sb', 'Bb'].forEach(p => newFilters[`Preflop${p}Action`] = '');
      // Apply sequence
      newSequence.forEach(item => {
          newFilters[`Preflop${item.position.charAt(0) + item.position.slice(1).toLowerCase()}Action`] = item.action;
      });
      // NEW: Update ActionSequence
      newFilters.ActionSequence = newSequence.map(item => `${item.position}:${item.action}`);
      
      onChange(newFilters);

      // Reset next position to the one we just removed
      const lastItem = sequence[sequence.length - 1];
      setNextPosition(lastItem.position);
  };

  return (
    <div className="bg-dark-200 rounded-lg p-4 shadow-lg flex flex-col gap-4 border-b border-dark-100">
      
      {/* Top Bar: Context (Players, Hero, Date) */}
      <div className="flex items-center justify-between gap-6 border-b border-dark-100 pb-3">
         <div className="flex items-center gap-6">
            {/* Player Count */}
            <div className="flex bg-dark-400 rounded-lg p-0.5 border border-dark-300">
                <button
                    onClick={() => handlePlayerCountChange(2)}
                    className={clsx("px-3 py-1 text-xs font-bold rounded-md transition-all", filters.PlayerCount === 2 ? "bg-primary-500 text-white shadow" : "text-gray-400 hover:text-white")}
                >
                    2 Players
                </button>
                <button
                    onClick={() => handlePlayerCountChange(3)}
                    className={clsx("px-3 py-1 text-xs font-bold rounded-md transition-all", filters.PlayerCount !== 2 ? "bg-primary-500 text-white shadow" : "text-gray-400 hover:text-white")}
                >
                    3 Players
                </button>
            </div>

            {/* Searchable Hero Selector */}
            <div className="relative">
                <div 
                    className="flex items-center gap-2 cursor-pointer bg-dark-400 border border-dark-300 rounded px-3 py-1 text-xs text-white hover:border-primary-500 transition-colors min-w-[150px]"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="flex-1 truncate">{filters.HeroName || 'Field (All)'}</span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                </div>

                {isDropdownOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                        <div className="absolute top-full left-0 mt-1 w-64 bg-dark-300 border border-dark-200 rounded shadow-2xl z-50 flex flex-col max-h-60 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="p-2 border-b border-dark-200 bg-dark-300">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Search player..." 
                                        className="w-full bg-dark-400 border border-dark-200 rounded pl-8 pr-2 py-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-primary-500"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        autoFocus
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-1 custom-scrollbar">
                                <div 
                                    className={clsx(
                                        "px-3 py-2 text-xs cursor-pointer hover:bg-dark-400 transition-colors",
                                        !filters.HeroName ? "bg-primary-500/10 text-primary-400 font-bold" : "text-gray-300"
                                    )}
                                    onClick={() => {
                                        onChange({...filters, HeroName: ''});
                                        setIsDropdownOpen(false);
                                    }}
                                >
                                    Field (All)
                                </div>
                                {filteredPlayers.map(p => (
                                    <div 
                                        key={p.name} 
                                        className={clsx(
                                            "px-3 py-2 text-xs cursor-pointer hover:bg-dark-400 transition-colors flex flex-col",
                                            filters.HeroName === p.name ? "bg-primary-500/10 text-primary-400 font-bold" : "text-gray-300"
                                        )}
                                        onClick={() => {
                                            onChange({...filters, HeroName: p.name});
                                            setIsDropdownOpen(false);
                                        }}
                                    >
                                        <span>{p.name}</span>
                                        <span className="text-[10px] text-gray-500 font-normal">{p.total_hands} hands</span>
                                    </div>
                                ))}
                                {filteredPlayers.length === 0 && searchTerm && (
                                    <div className="px-3 py-4 text-center text-xs text-gray-500">
                                        No player found
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Stack Depth (BB) */}
            <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-gray-400" />
                <div className="flex items-center gap-1">
                    <input 
                        type="number" 
                        placeholder="Min BB"
                        value={filters.MinStackBB || ''}
                        onChange={(e) => onChange({...filters, MinStackBB: e.target.value ? parseFloat(e.target.value) : null})}
                        className="bg-dark-400 border border-dark-300 rounded px-2 py-1 text-xs text-white w-16 focus:border-primary-500 focus:outline-none"
                    />
                    <span className="text-gray-500">-</span>
                    <input 
                        type="number" 
                        placeholder="Max BB"
                        value={filters.MaxStackBB || ''}
                        onChange={(e) => onChange({...filters, MaxStackBB: e.target.value ? parseFloat(e.target.value) : null})}
                        className="bg-dark-400 border border-dark-300 rounded px-2 py-1 text-xs text-white w-16 focus:border-primary-500 focus:outline-none"
                    />
                </div>
            </div>

            {/* Date Range - Simplified */}
            <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input 
                    type="date" 
                    value={filters.DateFrom || ''}
                    onChange={(e) => onChange({...filters, DateFrom: e.target.value})}
                    className="bg-dark-400 border border-dark-300 rounded px-2 py-1 text-xs text-white w-28"
                />
                <span className="text-gray-500">-</span>
                <input 
                    type="date" 
                    value={filters.DateTo || ''}
                    onChange={(e) => onChange({...filters, DateTo: e.target.value})}
                    className="bg-dark-400 border border-dark-300 rounded px-2 py-1 text-xs text-white w-28"
                />
            </div>
         </div>
         
         <button onClick={handleReset} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
             <RotateCcw className="w-3 h-3" /> Reset
         </button>
      </div>

      {/* Sequence Display (Breadcrumbs) */}
      <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 min-h-[40px]">
         <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-2">ACTION:</div>
         {sequence.length === 0 ? (
             <span className="text-xs text-gray-600 italic">Select actions below to build the hand...</span>
         ) : (
             sequence.map((item, idx) => (
                 <div key={idx} className="flex items-center animate-in fade-in slide-in-from-left-2 duration-200">
                     <div className="flex flex-col items-center bg-dark-300 rounded px-3 py-1 border border-dark-100 relative group">
                         <span className="text-[9px] text-gray-400 font-bold">{item.position}</span>
                         <span className={clsx("text-xs font-bold", 
                            item.action === 'fold' && "text-blue-400",
                            item.action === 'check' && "text-gray-300",
                            item.action === 'call' && "text-green-400",
                            item.action === 'raise' && "text-red-400",
                            item.action === 'all-in' && "text-red-500",
                         )}>
                             {item.label}
                         </span>
                         {/* X to remove this and subsequent steps? For now simple undo. */}
                     </div>
                     {idx < sequence.length - 1 && <ArrowRight className="w-3 h-3 text-gray-600 mx-1" />}
                 </div>
             ))
         )}
         
         {/* Active Player Indicator */}
         {nextPosition && (
             <>
                {sequence.length > 0 && <ArrowRight className="w-3 h-3 text-gray-600 mx-1" />}
                <div className="flex flex-col items-center justify-center w-10 h-10 rounded-full border-2 border-primary-500/50 bg-primary-500/10 animate-pulse">
                    <span className="text-[10px] font-bold text-primary-400">{nextPosition}</span>
                </div>
             </>
         )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-center pt-2">
         {ACTIONS.map(action => (
             <button
                key={action.value}
                onClick={() => handleAction(action)}
                className={clsx(
                    "px-6 py-2 rounded font-bold text-white shadow-lg transition-transform active:scale-95",
                    action.color
                )}
             >
                {action.label}
             </button>
         ))}
         <button 
            onClick={undoLastAction}
            disabled={sequence.length === 0}
            className="px-4 py-2 rounded font-medium text-gray-400 hover:text-white bg-dark-300 hover:bg-dark-400 ml-4 disabled:opacity-50"
         >
            Undo
         </button>
      </div>

    </div>
  );
}