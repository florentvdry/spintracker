import React, { useMemo } from 'react';
import clsx from 'clsx';

// Ordre des cartes pour la matrice de range
const CARDS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Couleurs par action
const ACTION_COLORS = {
  AllIn: '#b71c1c',
  Raise: '#f44336',
  Raise2_3BB: '#ef4444',   // Red for 2-3bb raises
  Raise4BB: '#f97316',    // Orange for 4bb+ raises
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

  // Calculate max count for opacity scaling
  const maxTotalCount = useMemo(() => {
    const counts = Object.values(data).map(d => d.totalCount || d.TotalCount || 0);
    return Math.max(...counts, 1);
  }, [data]);

  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
        TotalProfit: raw.totalProfit !== undefined ? raw.totalProfit : (raw.TotalProfit || 0),
        TotalEv: raw.totalEv !== undefined ? raw.totalEv : (raw.TotalEv || 0),
        Actions: raw.actions || raw.Actions || {},
        Hands: raw.hands || raw.Hands || []
      }
    };
  };

  const getBackgroundStyle = (stats) => {
    const total = stats.TotalCount;
    if (total === 0) return { backgroundColor: '#1e293b' };

    // Global cell opacity based on volume relative to max (min 0.3 to keep it visible)
    const volumeOpacity = 0.3 + (0.7 * (total / maxTotalCount));
    
    const actions = stats.Actions;
    let gradientStops = [];
    let currentPercent = 0;

    const actionOrder = ['AllIn', 'Raise4BB', 'Raise2_3BB', 'Raise', 'Bet', 'Call', 'Check', 'Fold', 'None'];
    
    // Scale action colors by volume opacity
    const getActionColor = (action) => hexToRgba(ACTION_COLORS[action] || ACTION_COLORS.None, volumeOpacity);

    // If there is only one dominant action (>95%), just use solid color
    let dominantAction = null;
    for (const action of actionOrder) {
      const count = actions[action] || 0;
      if (count / total > 0.95) {
        dominantAction = action;
        break;
      }
    }
    
    if (dominantAction) {
       return { backgroundColor: getActionColor(dominantAction) };
    }

    // Otherwise use gradient
    actionOrder.forEach(action => {
      const count = actions[action] || 0;
      if (count > 0) {
        const percent = (count / total) * 100;
        const color = getActionColor(action);
        gradientStops.push(`${color} ${currentPercent}% ${currentPercent + percent}%`);
        currentPercent += percent;
      }
    });

    if (gradientStops.length === 0) return { backgroundColor: '#1e293b' };

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
                  'flex flex-col items-center justify-center rounded cursor-pointer relative group leading-none',
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
                {stats.TotalCount > 0 && size !== 'sm' && (
                  <span className="text-[10px] text-white/90 font-bold drop-shadow-md mt-0.5 scale-90">
                    {stats.TotalCount}
                  </span>
                )}
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
}
