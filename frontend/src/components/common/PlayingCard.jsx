import React from 'react';
import clsx from 'clsx';

const SUITS = {
  's': { symbol: '♠', color: 'text-gray-900', name: 'spades' },
  'h': { symbol: '♥', color: 'text-red-600', name: 'hearts' },
  'd': { symbol: '♦', color: 'text-blue-600', name: 'diamonds' },
  'c': { symbol: '♣', color: 'text-green-600', name: 'clubs' }
};

const PlayingCard = ({ card, size = 'md', className }) => {
  if (!card || card.length < 2) return null;

  const rank = card.slice(0, -1);
  const suitChar = card.slice(-1).toLowerCase();
  const suit = SUITS[suitChar] || SUITS['s'];

  const sizeClasses = {
    xs: 'w-7 h-10 text-[10px]',
    sm: 'w-9 h-12 text-xs',
    md: 'w-12 h-16 text-sm',
    lg: 'w-16 h-24 text-lg',
    xl: 'w-24 h-36 text-2xl'
  };

  return (
    <div 
      className={clsx(
        "bg-white rounded shadow-sm border border-gray-300 select-none flex flex-col items-center justify-center relative overflow-hidden",
        sizeClasses[size],
        suit.color,
        className
      )}
      title={`${rank} of ${suit.name}`}
    >
      <span className="font-bold leading-none">{rank}</span>
      <span className="leading-none">{suit.symbol}</span>
    </div>
  );
};

export default PlayingCard;
