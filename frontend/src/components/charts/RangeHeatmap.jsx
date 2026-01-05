import clsx from 'clsx';

// Ordre des cartes pour la matrice de range
const CARDS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Couleurs par fréquence
const getColor = (frequency) => {
  if (frequency >= 80) return 'bg-green-500';
  if (frequency >= 60) return 'bg-green-600';
  if (frequency >= 40) return 'bg-yellow-500';
  if (frequency >= 20) return 'bg-orange-500';
  if (frequency > 0) return 'bg-red-500';
  return 'bg-dark-300';
};

export default function RangeHeatmap({ 
  data = {}, 
  onCellClick,
  showLabels = true,
  size = 'md',
  className 
}) {
  const cellSizes = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  };

  const getCellData = (row, col) => {
    const card1 = CARDS[row];
    const card2 = CARDS[col];
    
    let hand;
    if (row === col) {
      // Paire
      hand = `${card1}${card2}`;
    } else if (row < col) {
      // Suited (au-dessus de la diagonale)
      hand = `${card1}${card2}s`;
    } else {
      // Offsuit (en-dessous de la diagonale)
      hand = `${card2}${card1}o`;
    }
    
    return {
      hand,
      frequency: data[hand]?.frequency || 0,
      count: data[hand]?.count || 0,
      profit: data[hand]?.profit || 0,
    };
  };

  return (
    <div className={clsx('inline-block', className)}>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(13, 1fr)` }}>
        {CARDS.map((_, row) => (
          CARDS.map((_, col) => {
            const cellData = getCellData(row, col);
            const isPair = row === col;
            const isSuited = row < col;
            
            return (
              <div
                key={`${row}-${col}`}
                onClick={() => onCellClick?.(cellData)}
                className={clsx(
                  cellSizes[size],
                  'flex items-center justify-center rounded cursor-pointer',
                  'transition-all duration-150 hover:ring-2 hover:ring-primary-400',
                  getColor(cellData.frequency),
                  cellData.frequency === 0 && 'opacity-50'
                )}
                title={`${cellData.hand}: ${cellData.frequency.toFixed(1)}% (${cellData.count} mains)`}
              >
                {showLabels && (
                  <span className={clsx(
                    'font-medium',
                    cellData.frequency > 40 ? 'text-dark-500' : 'text-gray-300'
                  )}>
                    {cellData.hand.replace('s', '').replace('o', '')}
                  </span>
                )}
              </div>
            );
          })
        ))}
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded" />
          <span>&gt;60%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-yellow-500 rounded" />
          <span>40-60%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-500 rounded" />
          <span>20-40%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500 rounded" />
          <span>&lt;20%</span>
        </div>
      </div>
    </div>
  );
}
