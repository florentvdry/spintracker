import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Search, Filter, Crown, Fish, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Loader2, Eye, X, Play, ArrowUpDown } from 'lucide-react';
import { ipcService } from '@services/ipcService';
import { useFilterStore } from '@stores/filterStore';
import { useReplayerStore } from '@stores/replayerStore';
import PlayingCard from '@components/common/PlayingCard';
import { parseCards } from '@utils/handNormalizer';
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
  const [handsSortBy, setHandsSortBy] = useState('date_desc');
  const [expandedHands, setExpandedHands] = useState({});
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
    setExpandedHands({});
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

  const toggleHandExpand = (handId) => {
    setExpandedHands(prev => ({
      ...prev,
      [handId]: !prev[handId]
    }));
  };

  const handleHandsSort = (field) => {
    let newSort = `${field}_desc`;
    if (handsSortBy === `${field}_desc`) newSort = `${field}_asc`;
    else if (handsSortBy === `${field}_asc`) newSort = `${field}_desc`;
    setHandsSortBy(newSort);
    
    if (playerHands?.hands) {
      const sorted = [...playerHands.hands].sort((a, b) => {
        let valA, valB;
        switch (field) {
          case 'date':
            valA = new Date(a.date_time);
            valB = new Date(b.date_time);
            break;
          case 'profit':
            valA = a.dyn_hero_profit || a.hero_profit || 0;
            valB = b.dyn_hero_profit || b.hero_profit || 0;
            break;
          case 'cev':
            valA = a.ev_chips || 0;
            valB = b.ev_chips || 0;
            break;
          default:
            return 0;
        }
        if (newSort.endsWith('_desc')) return valB - valA;
        return valA - valB;
      });
      setPlayerHands(prev => ({ ...prev, hands: sorted }));
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
                        title={player.is_reg ? t('players.mark_fish', 'Définir comme fish') : t('players.mark_reg', 'Définir comme reg')}
                      >
                        {updatingId === player.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : player.is_reg ? (
                          <Crown className="w-3 h-3" />
                        ) : (
                          <Fish className="w-3 h-3" />
                        )}
                        {player.is_reg ? t('players.is_reg', 'Reg') : t('players.is_fish', 'Fish')}
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
                          className={clsx(
                            "text-xs font-medium transition-colors",
                            player.is_reg 
                              ? "text-yellow-400 hover:text-yellow-300" 
                              : "text-blue-400 hover:text-blue-300"
                          )}
                          title={player.is_reg ? t('players.mark_fish', 'Définir comme fish') : t('players.mark_reg', 'Définir comme reg')}
                        >
                          {player.is_reg ? t('players.set_fish', '→ Fish') : t('players.set_reg', '→ Reg')}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-200 rounded-2xl shadow-2xl border border-white/10 w-full max-w-5xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10 bg-dark-300/30 rounded-t-2xl">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center border border-primary-500/20">
                  <Users className="w-5 h-5 text-primary-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {t('players.hands_against', 'Mains contre')} <span className="text-primary-400">{selectedPlayer.name}</span>
                  </h2>
                  <p className="text-xs text-gray-400">
                    {playerHands?.total || 0} {t('players.total_hands', 'mains au total')}
                    {heroName ? (
                      <span className="ml-2 text-primary-400">• Hero: {heroName}</span>
                    ) : (
                      <span className="ml-2 text-yellow-400">• Sélectionnez un héros</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-dark-300 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              {handsLoading && !playerHands ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                </div>
              ) : playerHands?.hands?.length > 0 ? (
                <div className="table-container">
                  <table className="table w-full">
                    <thead className="bg-dark-300/50 sticky top-0 z-10">
                      <tr>
                        <th className="w-10 text-center">#</th>
                        <th 
                          className="cursor-pointer hover:bg-dark-300 transition-colors text-left"
                          onClick={() => handleHandsSort('date')}
                        >
                          <div className="flex items-center gap-1">
                            {t('common.date')}
                            <ArrowUpDown size={12} className={clsx(
                              "transition-opacity",
                              handsSortBy?.startsWith('date') ? "opacity-100 text-primary-400" : "opacity-0"
                            )} />
                          </div>
                        </th>
                        <th className="text-left">{t('common.cards')}</th>
                        <th className="text-left">{t('common.position')}</th>
                        <th className="text-right">{t('common.blinds')}</th>
                        <th 
                          className="cursor-pointer hover:bg-dark-300 transition-colors text-right"
                          onClick={() => handleHandsSort('cev')}
                        >
                          <div className="flex items-center justify-end gap-1">
                            CEV
                            <ArrowUpDown size={12} className={clsx(
                              "transition-opacity",
                              handsSortBy?.startsWith('cev') ? "opacity-100 text-primary-400" : "opacity-0"
                            )} />
                          </div>
                        </th>
                        <th 
                          className="cursor-pointer hover:bg-dark-300 transition-colors text-right"
                          onClick={() => handleHandsSort('profit')}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {t('common.result')}
                            <ArrowUpDown size={12} className={clsx(
                              "transition-opacity",
                              handsSortBy?.startsWith('profit') ? "opacity-100 text-primary-400" : "opacity-0"
                            )} />
                          </div>
                        </th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {playerHands.hands.map((hand, idx) => {
                        const handProfit = hand.dyn_hero_profit || hand.hero_profit || 0;
                        const handCards = hand.dyn_hero_cards || hand.hero_cards || '';
                        const handPosition = hand.opponent_position || '-';
                        const handCev = hand.ev_chips || 0;
                        const isExpanded = expandedHands[hand.id];
                        
                        return (
                          <React.Fragment key={hand.id || idx}>
                            <tr 
                              className="hover:bg-dark-300/30 transition-colors cursor-pointer group"
                              onClick={() => toggleHandExpand(hand.id)}
                            >
                              <td className="text-center">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-primary-400 mx-auto" />
                                ) : (
                                  <ChevronRightIcon className="w-4 h-4 text-gray-500 mx-auto" />
                                )}
                              </td>
                              <td className="text-gray-300 text-sm">
                                <div className="flex flex-col">
                                  <span>{new Date(hand.date_time).toLocaleDateString()}</span>
                                  <span className="text-xs text-gray-500">{new Date(hand.date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </td>
                              <td className="py-3">
                                <div className="flex gap-0.5">
                                  {parseCards(handCards).map((card, i) => (
                                    <PlayingCard key={i} card={card} size="sm" />
                                  ))}
                                </div>
                              </td>
                              <td>
                                <span className={clsx(
                                  "px-2 py-1 rounded text-xs font-medium",
                                  handPosition === 'BB' || handPosition === 'SB' ? "bg-purple-500/20 text-purple-400" :
                                  handPosition === 'BTN' ? "bg-orange-500/20 text-orange-400" :
                                  "bg-dark-400 text-gray-400"
                                )}>
                                  {handPosition}
                                </span>
                                <span className="ml-1 text-xs text-gray-500">
                                  ({hand.player_count === 2 ? 'HU' : `${hand.player_count}max`})
                                </span>
                              </td>
                              <td className="text-right text-gray-400 text-sm font-mono">
                                {hand.blinds || '-'}
                              </td>
                              <td className={clsx(
                                "text-right font-mono text-sm",
                                handCev > 0 ? "text-emerald-400" : handCev < 0 ? "text-rose-400" : "text-gray-400"
                              )}>
                                {handCev > 0 ? '+' : ''}{handCev.toFixed(1)}
                              </td>
                              <td className={clsx(
                                "text-right font-semibold text-sm",
                                handProfit > 0 ? "text-emerald-400" : handProfit < 0 ? "text-rose-400" : "text-gray-400"
                              )}>
                                {handProfit > 0 ? '+' : ''}{handProfit.toFixed(0)}
                              </td>
                              <td className="px-2">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenReplayer(hand.id);
                                  }}
                                  className="p-1.5 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all opacity-0 group-hover:opacity-100"
                                  title="Replay Hand"
                                >
                                  <Play size={14} fill="currentColor" />
                                </button>
                              </td>
                            </tr>

                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="p-0 bg-dark-900/30">
                                  <div className="border-l-2 border-primary-500/50 ml-4 my-2">
                                    <div className="p-4 space-y-3">
                                      <div className="flex items-center gap-6 flex-wrap">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-gray-500">Room:</span>
                                          <span className="text-xs text-gray-300 uppercase font-bold">{hand.room || '-'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-gray-500">Buy-in:</span>
                                          <span className="text-xs text-gray-300">{hand.buy_in ? `${hand.buy_in}€` : '-'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-gray-500">Table:</span>
                                          <span className="text-xs text-gray-300">{hand.table_id || '-'}</span>
                                        </div>
                                        {(hand.dyn_hero_all_in || hand.hero_all_in) && (
                                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400">
                                            ALL-IN
                                          </span>
                                        )}
                                        {hand.went_to_showdown && (
                                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-dark-400 text-gray-400">
                                            SD
                                          </span>
                                        )}
                                      </div>

                                      {(hand.flop || hand.turn || hand.river) && (
                                        <div className="flex items-center gap-3">
                                          <span className="text-xs text-gray-500">Board:</span>
                                          <div className="flex gap-0.5">
                                            {hand.flop && parseCards(hand.flop).map((card, i) => (
                                              <PlayingCard key={`flop-${i}`} card={card} size="sm" />
                                            ))}
                                            {hand.turn && <PlayingCard card={hand.turn} size="sm" />}
                                            {hand.river && <PlayingCard card={hand.river} size="sm" />}
                                          </div>
                                        </div>
                                      )}

                                      {hand.result && (
                                        <div className="text-xs text-gray-500 bg-dark-400/50 rounded p-2 max-w-md">
                                          <span className="text-gray-400">Showdown: </span>
                                          {hand.result}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-gray-400 py-12">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('players.no_hands', 'Aucune main trouvée')}</p>
                </div>
              )}

              {playerHands && playerHands.hands?.length < playerHands.total && (
                <div className="p-4 border-t border-white/5 text-center">
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
