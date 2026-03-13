import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Search, Filter, Crown, Fish, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { ipcService } from '@services/ipcService';
import clsx from 'clsx';

export default function Players() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const loadPlayers = async () => {
    setLoading(true);
    try {
      const options = { 
        limit: 1000, 
        minHands: 1,
        isRegFilter: filter === 'all' ? null : filter
      };
      const result = await ipcService.getPlayers(options);
      if (result.success) {
        setPlayers(result.data || []);
      }
    } catch (error) {
      console.error('Failed to load players:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlayers();
  }, [filter]);

  const filteredPlayers = useMemo(() => {
    if (!searchTerm) return players;
    return players.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [players, searchTerm]);

  const paginatedPlayers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPlayers.slice(start, start + pageSize);
  }, [filteredPlayers, page]);

  const totalPages = Math.ceil(filteredPlayers.length / pageSize);

  const handleToggleReg = async (player) => {
    setUpdatingId(player.id);
    try {
      const newIsReg = !player.is_reg;
      const result = await ipcService.updatePlayerRegStatus(player.id, newIsReg);
      if (result.success) {
        setPlayers(prev => prev.map(p => 
          p.id === player.id ? { ...p, is_reg: newIsReg, is_reg_forced: true } : p
        ));
      }
    } catch (error) {
      console.error('Failed to update player reg status:', error);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-hidden bg-dark-400">
      <div className="flex items-center justify-between bg-dark-300 p-4 rounded-xl border border-white/5 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center border border-primary-500/20 shadow-inner">
            <Users className="w-6 h-6 text-primary-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">{t('players.title', 'Joueurs')}</h1>
            <p className="text-xs text-gray-500">{t('players.subtitle', 'Gérez vos adversaires')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('common.search', 'Rechercher...')}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="pl-9 pr-4 py-2 bg-dark-400 border border-dark-200 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-primary-500 w-64"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {['all', 'reg', 'fish'].map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={clsx(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              filter === f 
                ? "bg-primary-500 text-white shadow-lg shadow-primary-500/20" 
                : "bg-dark-300 text-gray-400 hover:text-white hover:bg-dark-200"
            )}
          >
            {f === 'all' && t('players.filter_all', 'Tous')}
            {f === 'reg' && (
              <span className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-400" />
                {t('players.filter_reg', 'Regs')}
              </span>
            )}
            {f === 'fish' && (
              <span className="flex items-center gap-2">
                <Fish className="w-4 h-4 text-blue-400" />
                {t('players.filter_fish', 'Poissons')}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 bg-dark-200 rounded-2xl shadow-2xl border border-white/5 flex flex-col min-h-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-dark-300/30">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary-400" />
            <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">
              {t('players.list', 'Liste des joueurs')} ({filteredPlayers.length})
            </h2>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-dark-300/50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {t('players.player', 'Joueur')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {t('players.hands', 'Mains')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {t('players.profit', 'Profit')}
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {t('players.type', 'Type')}
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {t('players.auto_detected', 'Auto-détecté')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {t('players.actions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-dark-300/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-dark-400 flex items-center justify-center text-xs font-bold text-gray-400">
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-white">{player.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-sm text-gray-300">{player.total_hands?.toLocaleString() || 0}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className={clsx(
                        "text-sm font-bold",
                        (player.total_profit || 0) >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {(player.total_profit || 0) >= 0 ? '+' : ''}{player.total_profit?.toFixed(0) || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleToggleReg(player)}
                        disabled={updatingId === player.id}
                        className={clsx(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all",
                          player.is_reg 
                            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30" 
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30"
                        )}
                      >
                        {updatingId === player.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : player.is_reg ? (
                          <Crown className="w-3 h-3" />
                        ) : (
                          <Fish className="w-3 h-3" />
                        )}
                        {player.is_reg ? 'Reg' : 'Fish'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {player.is_reg_forced ? (
                        <span className="text-xs text-gray-500">{t('players.manual', 'Manuel')}</span>
                      ) : player.total_hands >= 500 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                          <Crown className="w-3 h-3" />
                          Auto
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleToggleReg(player)}
                        disabled={updatingId === player.id}
                        className="text-xs text-primary-400 hover:text-primary-300 font-medium"
                      >
                        {player.is_reg ? t('players.mark_fish', 'Marquer Fish') : t('players.mark_reg', 'Marquer Reg')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-dark-300/30">
            <span className="text-xs text-gray-500">
              {t('players.page', 'Page')} {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg bg-dark-400 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg bg-dark-400 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
