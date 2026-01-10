import React, { useMemo } from 'react';
import clsx from 'clsx';

// Ordre des cartes pour la matrice de range
const CARDS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Couleurs par action
const ACTION_COLORS = {
  AllIn: '#b71c1c',
  Raise: '#f44336',
  Bet: '#ff9800',
  Call: '#4caf50',
  Check: '#9e9e9e',
  Fold: '#2196f3',
  None: '#6366f1' // Indigo for unknown/none (was dark before)
};

export default function RangeGrid({ 
  data = {}, 
  onCellClick,
  selectedHand,
  size = 'md',
  className 
}) {
  const cellSizes = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-12 h-12 text-sm',
  };

  const getCellData = (row, col) => {
    const card1 = CARDS[row];
    const card2 = CARDS[col];
    
    let hand;
    if (row === col) {
      hand = `${card1}${card2}`;
    } else if (row < col) {
      hand = `${card1}${card2}s`;
    } else {
      hand = `${card2}${card1}o`;
    }
    
    const raw = data[hand] || {};
    return {
      hand,
      stats: {
        TotalCount: raw.totalCount !== undefined ? raw.totalCount : (raw.TotalCount || 0),
        Actions: raw.actions || raw.Actions || {},
        HandIds: raw.handIds || raw.HandIds || [],
        HandIds: raw.handIds || raw.HandIds || []
      }
    };
  };

  const getBackgroundStyle = (stats) => {
    // Backend returns camelCase keys, so we need to handle that.
    // In logs: stats = { totalCount: 1, totalProfit: 100, actions: { AllIn: 1 } }
    // The existing code expects PascalCase (TotalCount, Actions).
    
    // Normalize stats to access properties safely
    const total = stats.totalCount !== undefined ? stats.totalCount : (stats.TotalCount || 0);
    
    if (!stats || total === 0) return { backgroundColor: '#1e293b' };

    const actions = stats.actions || stats.Actions || {};
    let gradientStops = [];
    let currentPercent = 0;

    // Order: AllIn, Raise, Bet, Call, Check, Fold, None
    const actionOrder = ['AllIn', 'Raise', 'Bet', 'Call', 'Check', 'Fold', 'None'];
    
    // If there is only one dominant action (>90%), just use solid color for cleaner look
    let dominantAction = null;
    
    for (const action of actionOrder) {
      const count = actions[action] || 0;
      if (count / total > 0.95) {
        dominantAction = action;
        break;
      }
    }
    
    if (dominantAction) {
       return { backgroundColor: ACTION_COLORS[dominantAction] };
    }

    // Otherwise use gradient
    actionOrder.forEach(action => {
      const count = actions[action] || 0;
      if (count > 0) {
        const percent = (count / total) * 100;
        const color = ACTION_COLORS[action] || ACTION_COLORS.None;
        gradientStops.push(`${color} ${currentPercent}% ${currentPercent + percent}%`);
        currentPercent += percent;
      }
    });

    if (gradientStops.length === 0) {
        // Fallback if somehow counts > 0 but no actions matched?
        // Should not happen if 'None' is in actionOrder
        return { backgroundColor: '#1e293b' };
    }

    return {
      background: `linear-gradient(to top, ${gradientStops.join(', ')})`
    };
  };

  return (
    <div className={clsx('inline-block p-1 bg-dark-200 rounded-lg shadow-lg', className)}>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(13, 1fr)` }}>
        {CARDS.map((_, row) => (
          CARDS.map((_, col) => {
            const { hand, stats } = getCellData(row, col);
            const isSelected = selectedHand === hand;
            
            return (
              <div
                key={`${row}-${col}`}
                onClick={() => onCellClick?.(hand, stats)}
                style={getBackgroundStyle(stats)}
                className={clsx(
                  cellSizes[size],
                  'flex items-center justify-center rounded cursor-pointer relative group',
                  'transition-all duration-150',
                  isSelected ? 'ring-2 ring-white z-10' : 'hover:ring-1 hover:ring-gray-300 hover:z-10',
                  stats.TotalCount === 0 && 'opacity-40'
                )}
                title={`${hand}: ${stats.TotalCount} hands`}
              >
                <span className={clsx(
                  'font-medium drop-shadow-md',
                  stats.TotalCount > 0 ? 'text-white' : 'text-gray-500'
                )}>
                  {hand.replace('s', '').replace('o', '')}
                </span>
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
}
