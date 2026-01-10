import React from 'react';
import PokerChip from './PokerChip';

const DENOMINATIONS = [5000, 1000, 500, 100, 25, 5, 1];

const ChipStack = ({ amount, size = 'md', className, maxChips = 20 }) => {
  if (!amount || amount <= 0) return null;

  // Calculate chips
  let remaining = amount;
  const chips = [];

  for (const denom of DENOMINATIONS) {
    const count = Math.floor(remaining / denom);
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        chips.push(denom);
        remaining -= denom;
        if (chips.length >= maxChips) break; 
      }
    }
    if (chips.length >= maxChips) break;
  }

  const widthClasses = {
    xs: 'w-3',
    sm: 'w-4',
    md: 'w-6',
    lg: 'w-8',
    xl: 'w-10'
  };

  return (
    <div className={`relative flex justify-center animate-slide-up ${widthClasses[size]} ${className}`}>
      {chips.map((val, idx) => (
        <div 
          key={idx} 
          className="absolute"
          style={{ 
            bottom: `${idx * 3}px`, // Stack upwards
            zIndex: idx,
            filter: 'drop-shadow(0px 2px 1px rgba(0,0,0,0.4))'
          }}
        >
          <PokerChip value={val} size={size} />
        </div>
      ))}
    </div>
  );
};

export default ChipStack;
