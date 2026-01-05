import clsx from 'clsx';

export default function PlayersTable({ players, onSelect, selectedId }) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Joueur</th>
            <th className="text-right">Mains</th>
            <th className="text-right">Profit HU</th>
            <th className="text-right">Dernière vue</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const isSelected = player.id === selectedId;
            const profit = player.profitHu || 0;
            const isPositive = profit >= 0;

            return (
              <tr
                key={player.id || player.name}
                onClick={() => onSelect(player)}
                className={clsx(
                  'cursor-pointer transition-colors',
                  isSelected && 'bg-primary-500/10'
                )}
              >
                <td className="font-medium text-white">{player.name}</td>
                <td className="text-right text-gray-300">{player.handsSeen || 0}</td>
                <td className={clsx(
                  'text-right font-semibold',
                  isPositive ? 'profit-positive' : 'profit-negative'
                )}>
                  {isPositive ? '+' : ''}{profit.toFixed(2)}€
                </td>
                <td className="text-right text-gray-400">{player.lastSeen || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
