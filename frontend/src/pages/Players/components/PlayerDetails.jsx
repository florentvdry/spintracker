import { X } from 'lucide-react';
import clsx from 'clsx';

export default function PlayerDetails({ player, onClose }) {
  if (!player) return null;

  const stats = [
    { label: 'Mains jouées', value: player.handsSeen || 0 },
    { label: 'VPIP', value: `${(player.vpip || 0).toFixed(1)}%` },
    { label: 'PFR', value: `${(player.pfr || 0).toFixed(1)}%` },
    { label: '3-Bet', value: `${(player.threeBet || 0).toFixed(1)}%` },
    { label: 'C-Bet', value: `${(player.cbet || 0).toFixed(1)}%` },
  ];

  const profit = player.profitHu || 0;
  const isPositive = profit >= 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-white">{player.name}</h4>
        <button onClick={onClose} className="btn-icon">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Profit */}
      <div className="p-4 bg-dark-200 rounded-lg text-center">
        <p className="text-sm text-gray-400 mb-1">Profit contre ce joueur</p>
        <p className={clsx(
          'text-2xl font-bold',
          isPositive ? 'profit-positive' : 'profit-negative'
        )}>
          {isPositive ? '+' : ''}{profit.toFixed(2)}€
        </p>
      </div>

      {/* Stats */}
      <div className="space-y-2">
        {stats.map(stat => (
          <div key={stat.label} className="flex items-center justify-between py-2 border-b border-dark-100/30">
            <span className="text-gray-400">{stat.label}</span>
            <span className="text-white font-medium">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button className="btn-secondary flex-1 text-sm">
          Voir les mains
        </button>
        <button className="btn-primary flex-1 text-sm">
          Analyser
        </button>
      </div>
    </div>
  );
}
