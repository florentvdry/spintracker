import clsx from 'clsx';
import { EmptyState } from '@components/ui';
import { Calendar } from 'lucide-react';

export default function SessionList({ sessions = [] }) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="Aucune session"
        description="Vos sessions apparaîtront ici"
      />
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {sessions.map((session, index) => (
        <SessionItem key={session.id || index} session={session} />
      ))}
    </div>
  );
}

function SessionItem({ session }) {
  const profitVal = session.profit;
  const hasProfit = profitVal !== null && profitVal !== undefined && !Number.isNaN(Number(profitVal));
  const numericProfit = hasProfit ? Number(profitVal) : 0;
  const isPositive = hasProfit ? numericProfit >= 0 : false;
  const formattedProfit = hasProfit ? `${numericProfit.toFixed(2)}€` : '—';

  return (
    <div className="flex items-center justify-between p-3 bg-dark-200 rounded-lg hover:bg-dark-100 transition cursor-pointer">
      <div>
        <p className="text-white font-medium text-sm">{session.session_date}</p>
        <p className="text-gray-400 text-xs">
          {session.room} • {session.tournaments || 0} tournois • {session.hands_played} mains
        </p>
      </div>
      <div className="text-right">
        <p className={clsx('font-bold text-sm', isPositive ? 'profit-positive' : 'profit-negative')}>
          {hasProfit && isPositive ? '+' : ''}{formattedProfit}
        </p>
      </div>
    </div>
  );
}
