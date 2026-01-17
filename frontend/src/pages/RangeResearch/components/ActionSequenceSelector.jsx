import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Calendar, RotateCcw, ArrowRight } from 'lucide-react';
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

            {/* Hero Selector */}
            <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <select
                    value={filters.HeroName || ''}
                    onChange={(e) => onChange({...filters, HeroName: e.target.value})}
                    className="bg-dark-400 border border-dark-300 rounded px-2 py-1 text-xs text-white focus:border-primary-500 focus:outline-none"
                >
                    <option value="">Field (All)</option>
                    {players.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
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
