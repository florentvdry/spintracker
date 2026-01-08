import React from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { formatDate, formatCards } from '../../../utils/formatters';

export default function AnalysisHandsList({ 
  hands, 
  loading, 
  page, 
  totalPages, 
  totalHands, 
  sortBy, 
  onPageChange, 
  onSortChange,
  onSelectHand 
}) {
  const { t } = useTranslation();

  const columns = [
    { key: 'date_time', label: t('common.date'), sortable: true },
    { key: 'cards', label: t('common.cards'), sortable: false },
    { key: 'position', label: t('common.position'), sortable: false },
    { key: 'preflop', label: 'Preflop', sortable: false },
    { key: 'flop', label: 'Flop', sortable: false },
    { key: 'turn', label: 'Turn', sortable: false },
    { key: 'river', label: 'River', sortable: false },
    { key: 'ev', label: 'EV', sortable: true },
    { key: 'profit', label: t('common.result'), sortable: true },
  ];

  const handleSort = (key) => {
    if (!onSortChange) return;
    // Toggle logic: date_desc -> date_asc -> date_desc
    // key is 'date_time' or 'profit'
    const field = key === 'date_time' ? 'date' : key;
    
    let newSort = 'date_desc';
    if (sortBy?.startsWith(field)) {
      newSort = sortBy === `${field}_desc` ? `${field}_asc` : `${field}_desc`;
    } else {
      newSort = `${field}_desc`;
    }
    onSortChange(newSort);
  };

  if (loading && (!hands || hands.length === 0)) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!hands || hands.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {t('analysis.no_hands', 'No hands found matching criteria')}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          {t('analysis.hands_list', 'Hands List')} 
          <span className="ml-2 text-sm font-normal text-gray-400">({totalHands})</span>
        </h3>
        
        {/* Pagination Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1 rounded hover:bg-dark-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-400">
            {page} / {totalPages || 1}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1 rounded hover:bg-dark-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar bg-dark-300/30 rounded-lg border border-dark-100/50">
        <table className="table w-full">
          <thead className="sticky top-0 bg-dark-300 z-10">
            <tr>
              {columns.map(col => (
                <th 
                  key={col.key}
                  className={clsx(
                    "px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider",
                    col.sortable && "cursor-pointer hover:text-white group"
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-100/50">
            {hands.map((hand) => {
              const profit = hand.hero_profit || hand.dyn_hero_profit || 0;
              const isPositive = profit > 0;
              const isZero = profit === 0;
              const cards = hand.hero_cards || hand.dyn_hero_cards;
              const position = hand.hero_position || hand.dyn_hero_position;
              const ev = hand.ev_chips;

              return (
                <tr 
                  key={hand.id} 
                  className="hover:bg-dark-200/50 transition-colors cursor-pointer"
                  onClick={() => onSelectHand && onSelectHand(hand.id)}
                >
                  <td className="px-4 py-2 text-sm text-gray-300 whitespace-nowrap">
                    {formatDate(hand.date_time)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-white text-sm">
                      {formatCards(cards)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="badge badge-info text-xs">
                      {position}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 max-w-[150px]" title={hand.preflop_action}>
                    <div className="truncate">{hand.preflop_action?.split('\n')[0]}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 max-w-[150px]" title={hand.flop_action}>
                    <div className="font-mono text-white mb-0.5">{formatCards(hand.flop)}</div>
                    <div className="truncate">{hand.flop_action?.split('\n')[0]}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 max-w-[150px]" title={hand.turn_action}>
                    <div className="font-mono text-white mb-0.5">{formatCards(hand.turn)}</div>
                    <div className="truncate">{hand.turn_action?.split('\n')[0]}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 max-w-[150px]" title={hand.river_action}>
                    <div className="font-mono text-white mb-0.5">{formatCards(hand.river)}</div>
                    <div className="truncate">{hand.river_action?.split('\n')[0]}</div>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-300">
                    {ev !== null && ev !== undefined ? ev.toFixed(2) : '—'}
                  </td>
                  <td className={clsx(
                    "px-4 py-2 text-sm font-medium",
                    isPositive ? "text-emerald-400" : isZero ? "text-gray-400" : "text-rose-400"
                  )}>
                    {isPositive ? '+' : ''}{profit.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
