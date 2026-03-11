import { formatDate, formatCurrency } from '@utils/formatters';
import { Calendar, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFilterStore } from '@stores/filterStore';
import { useAppStore } from '@stores/appStore';

export default function SessionList({ sessions = [] }) {
  const { t } = useTranslation();
  const { dateRange, selectedSession, setSelectedSession } = useFilterStore();
  const refreshAll = useAppStore(state => state.refreshAll);

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        {t('dashboard.sessions_placeholder')}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
      {sessions.map((session, index) => {
        const isWin = session.profit > 0;
        const isSelected = dateRange === 'session' && selectedSession?.session_date === session.session_date;
        
        return (
          <div 
            key={index}
            onClick={async () => {
              if (isSelected) {
                setSelectedSession(null);
              } else {
                setSelectedSession(session);
              }
              // Rafraîchir les stats du dashboard en fonction de la session sélectionnée
              await refreshAll();
            }}
            className={`p-3 rounded-lg border transition-all cursor-pointer ${
              isSelected 
                ? 'bg-blue-600/20 border-blue-500 shadow-lg' 
                : 'bg-dark-300/50 border-dark-200 hover:border-dark-100'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <span>{formatDate(session.session_date)}</span>
              </div>
              <span className={`text-sm font-bold flex items-center gap-1 ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                {isWin ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {formatCurrency(session.profit)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Clock className="w-3 h-3" />
                <span>{session.tournaments || 0} {t('common.tournaments')}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-400 justify-end">
                <span>{session.hands_played} {t('common.hands')}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
