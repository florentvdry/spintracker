import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Search, Filter, Crown, Fish, ChevronLeft, ChevronRight, Loader2, Eye, X, Play } from 'lucide-react';
import { ipcService } from '@services/ipcService';
import { useFilterStore } from '@stores/filterStore';
import { useReplayerStore } from '@stores/replayerStore';
import clsx from 'clsx';

export default function Players() {
  const { t } = useTranslation();
  const { heroName } = useFilterStore();
  const { loadHand } = useReplayerStore();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);
  const [page, setPage] = useState(1);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerHands, setPlayerHands] = useState(null);
  const [handsLoading, setHandsLoading] = useState(false);
  const [handsPage, setHandsPage] = useState(1);
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

  const handleViewHands = async (player) => {
    setSelectedPlayer(player);
    setHandsPage(1);
    setHandsLoading(true);
    try {
      const result = await ipcService.getHandsAgainstPlayer(player.name, heroName, 20, 1);
      if (result.success) {
        setPlayerHands(result.data);
      }
    } catch (error) {
      console.error('Failed to load player hands:', error);
    } finally {
      setHandsLoading(false);
    }
  };

  const loadMoreHands = async () => {
    if (!selectedPlayer || handsLoading) return;
    setHandsLoading(true);
    try {
      const nextPage = handsPage + 1;
      const result = await ipcService.getHandsAgainstPlayer(selectedPlayer.name, heroName, 20, nextPage);
      if (result.success) {
        setPlayerHands(prev => ({
          ...result.data,
          hands: [...(prev?.hands || []), ...result.data.hands]
        }));
        setHandsPage(nextPage);
      }
    } catch (error) {
      console.error('Failed to load more hands:', error);
    } finally {
      setHandsLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedPlayer(null);
    setPlayerHands(null);
    setHandsPage(1);
  };

  const handleOpenReplayer = async (handId) => {
    try {
      await loadHand(handId);
    } catch (error) {
      console.error('Failed to open replayer:', error);
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
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleViewHands(player)}
                          className="text-xs text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1"
                          title={t('players.view_hands', 'Voir les mains')}
                        >
                          <Eye className="w-3 h-3" />
                          {t('players.view_hands', 'Voir')}
                        </button>
                        <button
                          onClick={() => handleToggleReg(player)}
                          disabled={updatingId === player.id}
                          className="text-xs text-gray-400 hover:text-white font-medium"
                        >
                          {player.is_reg ? t('players.mark_fish', 'Fish') : t('players.mark_reg', 'Reg')}
                        </button>
                      </div>
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

      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-200 rounded-2xl shadow-2xl border border-white/10 w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {t('players.hands_against', 'Mains contre')} {selectedPlayer.name}
                </h2>
                <p className="text-xs text-gray-400">
                  {playerHands?.total || 0} {t('players.total_hands', 'mains au total')}
                  {heroName ? (
                    <span className="ml-2 text-primary-400">• Hero: {heroName}</span>
                  ) : (
                    <span className="ml-2 text-yellow-400">• Sélectionnez un héros dans les paramètres pour voir vos mains</span>
                  )}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-dark-300 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {handsLoading && !playerHands ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                </div>
              ) : playerHands?.hands?.length > 0 ? (
                <div className="space-y-3">
                  {playerHands.hands.map((hand, idx) => (
                    <div
                      key={hand.id || idx}
                      onClick={() => handleOpenReplayer(hand.id)}
                      className="bg-dark-300 rounded-lg p-3 border border-white/5 cursor-pointer hover:border-primary-500/50 hover:bg-dark-300/80 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {hand.date_time ? new Date(hand.date_time).toLocaleString() : ''}
                          </span>
                          <span className="text-xs text-gray-500">
                            {hand.blinds}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            "text-xs font-bold",
                            hand.dyn_hero_profit > 0 ? "text-green-400" : hand.dyn_hero_profit < 0 ? "text-red-400" : "text-gray-400"
                          )}>
                            {hand.dyn_hero_profit > 0 ? '+' : ''}{hand.dyn_hero_profit?.toFixed(2) || 0}
                          </span>
                          <Play className="w-3 h-3 text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-dark-400/50 rounded px-2 py-1">
                          <span className="text-xs text-gray-500">Hero</span>
                          <span className="text-sm font-bold text-primary-400">
                            {hand.dyn_hero_cards || '-'}
                          </span>
                          <span className="text-xs text-gray-500">({hand.dyn_hero_position || '-'})</span>
                        </div>
                        
                        <span className="text-gray-500">vs</span>
                        
                        <div className="flex items-center gap-1.5 bg-dark-400/50 rounded px-2 py-1">
                          <span className="text-xs text-gray-500">{selectedPlayer.name}</span>
                          <span className="text-xs text-gray-500">
                            {hand.dyn_hero_all_in ? '(AI)' : ''}
                          </span>
                        </div>
                      </div>

                      {(hand.flop || hand.turn || hand.river) && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-gray-500">Board:</span>
                          <div className="flex gap-1">
                            {hand.flop && hand.flop.split(',').map((card, i) => (
                              <span key={`flop-${i}`} className="text-xs bg-dark-400 px-1 rounded text-gray-300">{card.trim()}</span>
                            ))}
                            {hand.turn && <span className="text-xs bg-dark-400 px-1 rounded text-gray-300">{hand.turn.trim()}</span>}
                            {hand.river && <span className="text-xs bg-dark-400 px-1 rounded text-gray-300">{hand.river.trim()}</span>}
                          </div>
                        </div>
                      )}

                      {hand.result && (
                        <div className="mt-2 text-xs text-gray-500 line-clamp-2">
                          {hand.result}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">
                  {t('players.no_hands', 'Aucune main trouvée')}
                </div>
              )}

              {playerHands && playerHands.hands?.length < playerHands.total && (
                <div className="mt-4 text-center">
                  <button
                    onClick={loadMoreHands}
                    disabled={handsLoading}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
                  >
                    {handsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    ) : (
                      t('players.load_more', 'Charger plus')
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
