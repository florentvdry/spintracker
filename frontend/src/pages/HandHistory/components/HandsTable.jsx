import clsx from 'clsx';

export default function HandsTable({ hands, onSelect, selectedId }) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Cartes</th>
            <th>Position</th>
            <th className="text-right">EV Chips</th>
            <th className="text-right">Pot</th>
            <th className="text-right">Résultat</th>
          </tr>
        </thead>
        <tbody>
          {hands.map((hand) => {
            const isSelected = hand.id === selectedId;
            const profit = hand.hero_profit || 0;
            const isPositive = profit >= 0;

            return (
              <tr
                key={hand.id}
                onClick={() => onSelect(hand.id)}
                className={clsx(
                  'cursor-pointer transition-colors',
                  isSelected && 'bg-primary-500/10'
                )}
              >
                <td className="text-gray-300 text-sm">
                  {formatDate(hand.date_time)}
                </td>
                <td>
                  <span className="font-mono text-white">
                    {formatCards(hand.hero_cards)}
                  </span>
                </td>
                <td>
                  <span className="badge badge-info">
                    {hand.hero_position}
                  </span>
                </td>
                <td className="text-right text-gray-300">
                  {hand.ev_chips ? hand.ev_chips.toFixed(2) : '—'}
                </td>
                <td className="text-right text-gray-300">
                  {hand.total_pot?.toFixed(0) || 0}
                </td>
                <td className={clsx(
                  'text-right font-semibold',
                  isPositive ? 'profit-positive' : 'profit-negative'
                )}>
                  {isPositive ? '+' : ''}{profit.toFixed(2)}€
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

function formatCards(cards) {
  if (!cards) return '—';
  return cards.replace(/([AKQJT2-9])([shdc])/gi, (match, rank, suit) => {
    const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' };
    return rank + (suitSymbols[suit.toLowerCase()] || suit);
  });
}
