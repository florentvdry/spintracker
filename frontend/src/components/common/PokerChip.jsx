import React from 'react';
import clsx from 'clsx';

const CHIP_COLORS = {
  1: { bg: 'bg-white', border: 'border-gray-300', text: 'text-gray-800', stripe: 'bg-gray-400' },
  5: { bg: 'bg-red-600', border: 'border-red-800', text: 'text-white', stripe: 'bg-white' },
  25: { bg: 'bg-green-600', border: 'border-green-800', text: 'text-white', stripe: 'bg-yellow-400' },
  100: { bg: 'bg-black', border: 'border-gray-700', text: 'text-white', stripe: 'bg-blue-400' },
  500: { bg: 'bg-purple-600', border: 'border-purple-800', text: 'text-white', stripe: 'bg-yellow-200' },
  1000: { bg: 'bg-yellow-500', border: 'border-yellow-700', text: 'text-black', stripe: 'bg-blue-600' },
  5000: { bg: 'bg-orange-500', border: 'border-orange-700', text: 'text-white', stripe: 'bg-black' },
  10000: { bg: 'bg-cyan-500', border: 'border-cyan-700', text: 'text-black', stripe: 'bg-white' },
};

const PokerChip = ({ value = 1, size = 'md', className, style }) => {
  // Find closest lower denomination or default to 1
  const denoms = Object.keys(CHIP_COLORS).map(Number).sort((a, b) => b - a);
  const denom = denoms.find(d => d <= value) || 1;
  const colors = CHIP_COLORS[denom];

  const sizeClasses = {
    xs: 'w-3 h-3 text-[5px]',
    sm: 'w-4 h-4 text-[6px]',
    md: 'w-6 h-6 text-[8px]',
    lg: 'w-8 h-8 text-[10px]',
    xl: 'w-10 h-10 text-xs'
  };
  
  // Inner ring size
  const ringSize = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
    xl: 'w-7 h-7'
  };

  return (
    <div 
      className={clsx(
        "rounded-full flex items-center justify-center relative shadow-sm border-2 select-none box-border",
        colors.bg,
        colors.border,
        colors.text,
        sizeClasses[size],
        className
      )}
      style={style}
      title={`Chip value: ${value}`}
    >
      {/* Dashed ring for detail */}
      <div className={clsx(
        "rounded-full border border-dashed border-white/40 flex items-center justify-center pointer-events-none",
        ringSize[size]
      )}>
      </div>
      
      {/* Stripes (decorative edge spots) */}
      <div className={clsx("absolute w-full h-[15%] top-1/2 left-0 transform -translate-y-1/2 rotate-45 pointer-events-none", colors.stripe, "opacity-60")} />
      <div className={clsx("absolute w-full h-[15%] top-1/2 left-0 transform -translate-y-1/2 -rotate-45 pointer-events-none", colors.stripe, "opacity-60")} />
      <div className={clsx("absolute w-full h-[15%] top-1/2 left-0 transform -translate-y-1/2 rotate-90 pointer-events-none", colors.stripe, "opacity-60")} />
      <div className={clsx("absolute w-full h-[15%] top-1/2 left-0 transform -translate-y-1/2 pointer-events-none", colors.stripe, "opacity-60")} />
    </div>
  );
};

export default PokerChip;
