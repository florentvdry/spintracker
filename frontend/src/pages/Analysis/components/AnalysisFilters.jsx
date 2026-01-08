import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, RotateCcw, Calendar, User } from 'lucide-react';
import clsx from 'clsx';
import { usePlayersStore } from '@stores/playersStore';

export default function AnalysisFilters({ filters, onChange }) {
  const { t } = useTranslation();
  const { players } = usePlayersStore();
  
  const situations = ['Preflop', 'Flop', 'Turn', 'River'];
  const actions = ['Check', 'Bet', 'Raise', 'Fold', 'Call'];
  const positions = ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'];

  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const togglePosition = (pos) => {
    const current = filters.Positions || [];
    const newPositions = current.includes(pos)
      ? current.filter(p => p !== pos)
      : [...current, pos];
    handleChange('Positions', newPositions);
  };

  const clearFilters = () => {
    onChange({
      ...filters, // Keep HeroName
      Situation: '',
      Action: '',
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
      RiverBbAction: '',
      MinStackBB: null,
      MaxStackBB: null,
      Positions: [], // Hero Position
      PlayerCount: null,
      DateFrom: '',
      DateTo: ''
    });
  };

  const actionOptions = [
    { value: '', label: 'Any' },
    { value: 'check', label: 'Check' },
    { value: 'call', label: 'Call' },
    { value: 'bet', label: 'Bet' },
    { value: 'raise', label: 'Raise' },
    { value: 'fold', label: 'Fold' },
    { value: 'all-in', label: 'All-in' },
  ];

  const renderActionSelect = (label, field) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-gray-500 uppercase font-semibold">{label}</label>
      <select
        value={filters[field] || ''}
        onChange={(e) => handleChange(field, e.target.value)}
        className="w-full bg-dark-400 border border-dark-200 rounded px-2 py-1 text-xs text-white focus:border-primary-500 focus:outline-none appearance-none"
      >
        {actionOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="bg-dark-300 rounded-xl p-4 border border-dark-100/50 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary-400" />
          {t('analysis.filters.title', 'Filters')}
        </h3>
        <button 
          onClick={clearFilters}
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          {t('analysis.filters.reset', 'Reset')}
        </button>
      </div>

      {/* Hero Selection */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{t('common.hero', 'Hero')}</label>
        <div className="relative">
          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <select
            value={filters.HeroName || ''}
            onChange={(e) => handleChange('HeroName', e.target.value)}
            className="w-full bg-dark-400 border border-dark-200 rounded pl-8 pr-3 py-1.5 text-sm text-white focus:border-primary-500 focus:outline-none appearance-none"
          >
            <option value="">{t('analysis.field_analysis', 'Field (All Players)')}</option>
            {players.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Player Count Filter */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Players in Hand</label>
        <div className="flex bg-dark-400 p-1 rounded-lg border border-dark-200">
          {[
            { value: 2, label: 'Heads Up (2)' },
            { value: 3, label: '3-Max (3)' }
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => {
                const newValue = filters.PlayerCount === option.value ? null : option.value;
                let newFilters = { ...filters, PlayerCount: newValue };
                
                if (newValue === 2) {
                    // Clear BTN filters when switching to HU
                    if (newFilters.Positions?.includes('BTN')) {
                        newFilters.Positions = newFilters.Positions.filter(p => p !== 'BTN');
                    }
                    ['Preflop', 'Flop', 'Turn', 'River'].forEach(street => {
                         newFilters[`${street}BtnAction`] = '';
                    });
                }
                onChange(newFilters);
              }}
              className={clsx(
                "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                filters.PlayerCount === option.value
                  ? "bg-primary-500 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-300 hover:bg-dark-300"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Position */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{t('common.position', 'Hero Position')}</label>
        <div className={clsx("grid gap-2", filters.PlayerCount === 2 ? "grid-cols-3" : "grid-cols-4")}>
            <button
                onClick={() => handleChange('Positions', [])}
                className={clsx(
                    "px-2 py-1.5 rounded text-xs border transition-colors",
                    (!filters.Positions || filters.Positions.length === 0)
                    ? "bg-primary-500/20 border-primary-500 text-primary-400"
                    : "bg-dark-400 border-dark-200 text-gray-400 hover:border-gray-500"
                )}
            >
                Any
            </button>
            {['BTN', 'SB', 'BB'].map(pos => {
                // If HU (2 players), disable BTN selection if desired, or handle logic
                // User said: "not need BTN" for HU.
                if (filters.PlayerCount === 2 && pos === 'BTN') return null;
                
                return (
                <button
                    key={pos}
                    onClick={() => {
                        const current = filters.Positions || [];
                        const exists = current.includes(pos);
                        handleChange('Positions', exists ? current.filter(p => p !== pos) : [...current, pos]);
                    }}
                    className={clsx(
                        "px-2 py-1.5 rounded text-xs border transition-colors",
                        (filters.Positions || []).includes(pos)
                        ? "bg-primary-500/20 border-primary-500 text-primary-400"
                        : "bg-dark-400 border-dark-200 text-gray-400 hover:border-gray-500"
                    )}
                >
                    {pos}
                </button>
            )})}
        </div>
      </div>

      {/* Street Actions */}
      <div className="space-y-3">
        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{t('analysis.filters.street_actions', 'Street Actions (By Position)')}</label>
        
        {/* Preflop */}
        <div className="bg-dark-400/30 p-2 rounded border border-dark-200/50">
            <div className="text-xs text-primary-400 font-semibold mb-2">Preflop</div>
            <div className={clsx("grid gap-2", filters.PlayerCount === 2 ? "grid-cols-2" : "grid-cols-3")}>
                {filters.PlayerCount !== 2 && renderActionSelect('BTN', 'PreflopBtnAction')}
                {renderActionSelect('SB', 'PreflopSbAction')}
                {renderActionSelect('BB', 'PreflopBbAction')}
            </div>
        </div>

        {/* Flop */}
        <div className="bg-dark-400/30 p-2 rounded border border-dark-200/50">
            <div className="text-xs text-primary-400 font-semibold mb-2">Flop</div>
            <div className={clsx("grid gap-2", filters.PlayerCount === 2 ? "grid-cols-2" : "grid-cols-3")}>
                {filters.PlayerCount !== 2 && renderActionSelect('BTN', 'FlopBtnAction')}
                {renderActionSelect('SB', 'FlopSbAction')}
                {renderActionSelect('BB', 'FlopBbAction')}
            </div>
        </div>

        {/* Turn */}
        <div className="bg-dark-400/30 p-2 rounded border border-dark-200/50">
            <div className="text-xs text-primary-400 font-semibold mb-2">Turn</div>
            <div className={clsx("grid gap-2", filters.PlayerCount === 2 ? "grid-cols-2" : "grid-cols-3")}>
                {filters.PlayerCount !== 2 && renderActionSelect('BTN', 'TurnBtnAction')}
                {renderActionSelect('SB', 'TurnSbAction')}
                {renderActionSelect('BB', 'TurnBbAction')}
            </div>
        </div>

        {/* River */}
        <div className="bg-dark-400/30 p-2 rounded border border-dark-200/50">
            <div className="text-xs text-primary-400 font-semibold mb-2">River</div>
            <div className={clsx("grid gap-2", filters.PlayerCount === 2 ? "grid-cols-2" : "grid-cols-3")}>
                {filters.PlayerCount !== 2 && renderActionSelect('BTN', 'RiverBtnAction')}
                {renderActionSelect('SB', 'RiverSbAction')}
                {renderActionSelect('BB', 'RiverBbAction')}
            </div>
        </div>
      </div>

      {/* Positions */}
      {/* Duplicate Position Filter Removed as requested */}

      {/* Stack Size */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{t('analysis.filters.stack', 'Stack (BB)')}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.MinStackBB || ''}
            onChange={(e) => handleChange('MinStackBB', e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-dark-400 border border-dark-200 rounded px-3 py-1.5 text-sm text-white focus:border-primary-500 focus:outline-none"
          />
          <span className="text-gray-500">-</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.MaxStackBB || ''}
            onChange={(e) => handleChange('MaxStackBB', e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-dark-400 border border-dark-200 rounded px-3 py-1.5 text-sm text-white focus:border-primary-500 focus:outline-none"
          />
        </div>
      </div>
      
      {/* Date Range */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{t('analysis.filters.date', 'Date')}</label>
        <div className="space-y-2">
            <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input 
                    type="date" 
                    value={filters.DateFrom || ''}
                    onChange={(e) => handleChange('DateFrom', e.target.value)}
                    className="w-full bg-dark-400 border border-dark-200 rounded pl-8 pr-3 py-1.5 text-xs text-white focus:border-primary-500 focus:outline-none"
                />
            </div>
            <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input 
                    type="date" 
                    value={filters.DateTo || ''}
                    onChange={(e) => handleChange('DateTo', e.target.value)}
                    className="w-full bg-dark-400 border border-dark-200 rounded pl-8 pr-3 py-1.5 text-xs text-white focus:border-primary-500 focus:outline-none"
                />
            </div>
        </div>
      </div>
    </div>
  );
}
