import React from 'react';
import clsx from 'clsx';
import { formatDate } from '../../../utils/formatters';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ArrowUpDown, Play } from 'lucide-react';
import PlayingCard from '../../../components/common/PlayingCard';
import { parseCards } from '../../../utils/handNormalizer';

export default function TournamentsTable({ 
  tournaments, 
  onSelectTournament, 
  selectedTournament,
  tournamentHands,
  isLoadingHands,
  onSelectHand,
  sortBy,
  onSort,
  onReplayTournament,
  onReplayHand
}) {
  const { t } = useTranslation();

  const handleSort = (field) => {
    let newSort = `${field}_desc`;
    if (sortBy === `${field}_desc`) newSort = `${field}_asc`;
    else if (sortBy === `${field}_asc`) newSort = `${field}_desc`;
    onSort(newSort);
  };

  const SortHeader = ({ label, field, className = "" }) => (
    <th 
      className={clsx("cursor-pointer hover:bg-dark-300 transition-colors group", className)}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={12} className={clsx(
          "transition-opacity",
          sortBy?.startsWith(field) ? "opacity-100 text-primary-400" : "opacity-0 group-hover:opacity-50"
        )} />
      </div>
    </th>
  );

  return (
    <div className="table-container">
      <table className="table w-full">
        <thead>
          <tr>
            <th className="w-10 text-center">#</th>
            <SortHeader label={t('common.date')} field="date" />
            <SortHeader label="Room" field="room" />
            <SortHeader label="Buy-in" field="buyin" />
            <SortHeader label="Hands" field="hands" className="text-right justify-end" />
            <SortHeader label="Avg CEV" field="cev" className="text-right justify-end" />
            <SortHeader label={t('common.result')} field="profit" className="text-right justify-end" />
            <th className="w-12"></th>
          </tr>
        </thead>
        <tbody>
          {tournaments.map((tourn) => {
            const isSelected = (selectedTournament?.gameId || selectedTournament?.GameId) === (tourn.gameId || tourn.GameId);
            const profit = tourn.netProfit ?? tourn.NetProfit ?? 0;
            const isPositive = profit >= 0;
            const cev = tourn.avgCev ?? tourn.AvgCev ?? 0;

            return (
              <React.Fragment key={t.gameId || t.GameId}>
                <tr
                  onClick={() => onSelectTournament(isSelected ? null : tourn)}
                  className={clsx(
                    'cursor-pointer transition-colors hover:bg-dark-300/50',
                    isSelected && 'bg-primary-500/10'
                  )}
                >
                  <td className="text-center">
                    {isSelected ? <ChevronDown className="w-4 h-4 text-primary-400 mx-auto" /> : <ChevronRight className="w-4 h-4 text-gray-500 mx-auto" />}
                  </td>
                  <td className="text-gray-300 text-sm">
                    {formatDate(tourn.dateTime || tourn.DateTime)}
                  </td>
                  <td>
                    <span className="text-gray-400 text-xs uppercase font-bold tracking-wider">{tourn.room || tourn.Room}</span>
                  </td>
                  <td>
                    <span className="text-white font-medium">{tourn.buyIn || tourn.BuyIn}€</span>
                  </td>
                  <td className="text-right text-gray-400 text-sm font-mono">
                    {tourn.handCount || tourn.HandCount}
                  </td>
                  <td className={clsx(
                    "text-right font-mono text-sm",
                    cev > 0 ? "text-emerald-400" : (cev < 0 ? "text-rose-400" : "text-gray-400")
                  )}>
                    {cev > 0 ? '+' : ''}{cev.toFixed(1)}
                  </td>
                  <td className={clsx(
                    'text-right font-semibold',
                    isPositive ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {isPositive ? '+' : ''}{profit.toFixed(2)}€
                  </td>
                  <td className="px-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onReplayTournament(tourn.gameId || tourn.GameId);
                      }}
                      className="p-1.5 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all"
                      title="Replay Tournament"
                    >
                      <Play size={14} fill="currentColor" />
                    </button>
                  </td>
                </tr>

                {/* Expanded Hands List */}
                {isSelected && (
                  <tr>
                    <td colSpan="8" className="p-0 bg-dark-900/30">
                      <div className="border-l-2 border-primary-500/50 ml-4 my-2">
                        {isLoadingHands ? (
                          <div className="p-4 text-center text-xs text-gray-500 italic">{t('hand_history.loading_hands')}</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="text-gray-500 border-b border-dark-100/30">
                                <tr>
                                  <th className="px-4 py-2 text-left">{t('hand_history.time')}</th>
                                  <th className="px-4 py-2 text-left">{t('common.cards')}</th>
                                  <th className="px-4 py-2 text-left">{t('common.position')}</th>
                                  <th className="px-4 py-2 text-right">CEV</th>
                                  <th className="px-4 py-2 text-right">{t('common.result')}</th>
                                  <th className="px-4 py-2 text-center w-12"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {tournamentHands.map((hand) => {
                                  const handProfit = hand.hero_profit || hand.dyn_hero_profit || 0;
                                  const handCards = hand.hero_cards || hand.dyn_hero_cards;
                                  const handCev = hand.ev_chips;
                                  
                                  return (
                                    <tr 
                                      key={hand.id} 
                                      className="hover:bg-primary-500/5 cursor-pointer border-b border-dark-100/10 last:border-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectHand(hand.id);
                                      }}
                                    >
                                      <td className="px-4 py-2 text-gray-500">
                                        {new Date(hand.date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                      </td>
                                      <td className="px-4 py-2">
                                        <div className="flex gap-0.5">
                                          {parseCards(handCards).map((c, i) => (
                                            <PlayingCard key={i} card={c} size="xs" />
                                          ))}
                                        </div>
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className="px-1.5 py-0.5 rounded bg-dark-300 text-[10px] text-gray-400">
                                          {hand.hero_position || hand.dyn_hero_position} ({hand.player_count === 2 ? 'HU' : '3W'})
                                        </span>
                                      </td>
                                      <td className={clsx(
                                        "px-4 py-2 text-right font-mono",
                                        handCev > 0 ? "text-emerald-500/80" : (handCev < 0 ? "text-rose-500/80" : "text-gray-500")
                                      )}>
                                        {handCev !== null && handCev !== undefined ? `${handCev > 0 ? '+' : ''}${handCev.toFixed(1)}` : '—'}
                                      </td>
                                      <td className={clsx(
                                        "px-4 py-2 text-right font-semibold",
                                        handProfit > 0 ? "text-emerald-500/80" : (handProfit < 0 ? "text-rose-500/80" : "text-gray-500")
                                      )}>
                                        {handProfit > 0 ? '+' : ''}{handProfit.toFixed(0)}
                                      </td>
                                      <td className="px-4 py-2 text-center">
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            console.log('Replaying hand:', hand.id, typeof hand.id);
                                            onReplayHand(hand.id);
                                          }}
                                          className="p-1 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all"
                                          title="Replay Hand"
                                        >
                                          <Play size={12} fill="currentColor" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
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
  );
}
