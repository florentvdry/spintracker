import { Fragment } from 'react'
import { ArrowUpDown, ChevronDown, ChevronRight, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import CardTile from '@/components/common/CardTile'
import type { Json } from '@/services/ipcService'
import { formatDate, parseCards } from '@/utils/formatters'

interface TournamentsTableProps {
  tournaments: Json[]
  selectedTournament: Json | null
  tournamentHands: Json[]
  isLoadingHands: boolean
  sortBy: string
  onSelectTournament: (tournament: Json | null) => void
  onSelectHand: (handId: string | number) => void
  onSort: (sortBy: string) => void
  onReplayTournament: (gameId: string | number) => void
  onReplayHand: (handId: string | number) => void
}

const gameId = (t: Json) => t.gameId ?? t.GameId
const netProfit = (t: Json): number => t.netProfit ?? t.NetProfit ?? 0
const avgCev = (t: Json): number => t.avgCev ?? t.AvgCev ?? 0
const handProfit = (h: Json): number => h.hero_profit || h.dyn_hero_profit || 0
const handCev = (h: Json): number => (h.ev_chips !== null && h.ev_chips !== undefined ? h.ev_chips : handProfit(h))

const formatCev = (cev: number | null | undefined) => (cev === null || cev === undefined ? '—' : `${cev > 0 ? '+' : ''}${cev.toFixed(1)}`)
const signed = (value: number) => (value > 0 ? 'text-profit-positive' : value < 0 ? 'text-profit-negative' : 'text-gray-500')
const formatHandTime = (dateTime: string) =>
  new Date(dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function TournamentsTable({
  tournaments, selectedTournament, tournamentHands, isLoadingHands, sortBy,
  onSelectTournament, onSelectHand, onSort, onReplayTournament, onReplayHand,
}: TournamentsTableProps) {
  const { t } = useTranslation()

  const isSelected = (tourn: Json) => !!selectedTournament && gameId(selectedTournament) === gameId(tourn)
  const handleSort = (field: string) => onSort(sortBy === `${field}_desc` ? `${field}_asc` : `${field}_desc`)
  const sortIcon = (field: string) => (
    <ArrowUpDown className={clsx('w-3 h-3', sortBy?.startsWith(field) ? 'opacity-100 text-primary-400' : 'opacity-0')} />
  )
  const sortable = 'cursor-pointer hover:bg-dark-300 transition-colors'

  return (
    <div className="overflow-x-auto">
      <table className="table w-full">
        <thead>
          <tr>
            <th className="w-10 text-center">#</th>
            <th className={sortable} onClick={() => handleSort('date')}><div className="flex items-center gap-1">{t('common.date')}{sortIcon('date')}</div></th>
            <th className={sortable} onClick={() => handleSort('room')}><div className="flex items-center gap-1">Room{sortIcon('room')}</div></th>
            <th className={sortable} onClick={() => handleSort('buyin')}><div className="flex items-center gap-1">Buy-in{sortIcon('buyin')}</div></th>
            <th className={clsx(sortable, 'text-right')} onClick={() => handleSort('hands')}><div className="flex items-center justify-end gap-1">{t('common.hands')}{sortIcon('hands')}</div></th>
            <th className={clsx(sortable, 'text-right')} onClick={() => handleSort('cev')}><div className="flex items-center justify-end gap-1">Avg CEV{sortIcon('cev')}</div></th>
            <th className={clsx(sortable, 'text-right')} onClick={() => handleSort('profit')}><div className="flex items-center justify-end gap-1">{t('common.result')}{sortIcon('profit')}</div></th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {tournaments.map((tourn) => {
            const selected = isSelected(tourn)
            const cev = avgCev(tourn)
            const profit = netProfit(tourn)
            return (
              <Fragment key={gameId(tourn)}>
                <tr
                  onClick={() => onSelectTournament(selected ? null : tourn)}
                  className={clsx('cursor-pointer transition-colors hover:bg-dark-300/50', selected && 'bg-primary-500/10')}
                >
                  <td className="text-center">
                    {selected ? <ChevronDown className="w-4 h-4 text-primary-400 mx-auto" /> : <ChevronRight className="w-4 h-4 text-gray-500 mx-auto" />}
                  </td>
                  <td className="text-gray-300 text-sm">{formatDate(tourn.dateTime || tourn.DateTime)}</td>
                  <td><span className="text-gray-200">{tourn.room || tourn.Room}</span></td>
                  <td><span className="text-gray-100">{tourn.buyIn || tourn.BuyIn}€</span></td>
                  <td className="text-right text-gray-400 text-sm font-mono">{tourn.handCount || tourn.HandCount}</td>
                  <td className={clsx('text-right font-mono text-sm', cev > 0 ? 'text-profit-positive' : cev < 0 ? 'text-profit-negative' : 'text-gray-400')}>
                    {formatCev(cev)}
                  </td>
                  <td className={clsx('text-right font-mono text-sm font-medium', profit >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
                    {`${profit >= 0 ? '+' : ''}${profit.toFixed(2)}€`}
                  </td>
                  <td className="px-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onReplayTournament(gameId(tourn)) }}
                      className="p-1.5 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all"
                      title="Replay Tournament"
                    >
                      <Play style={{ width: 14, height: 14 }} fill="currentColor" />
                    </button>
                  </td>
                </tr>

                {selected && (
                  <tr>
                    <td colSpan={8} className="p-0 bg-dark-600">
                      <div className="border-l-2 border-primary-500/50 ml-4 my-2">
                        {isLoadingHands ? (
                          <div className="p-4 text-center text-xs text-gray-500 italic">{t('hand_history.loading_hands')}</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="text-gray-500 border-b border-dark-200">
                                <tr>
                                  <th className="px-4 py-2 text-left">{t('hand_history.time')}</th>
                                  <th className="px-4 py-2 text-left">{t('common.cards')}</th>
                                  <th className="px-4 py-2 text-left">{t('common.position')}</th>
                                  <th className="px-4 py-2 text-right">CEV</th>
                                  <th className="px-4 py-2 text-right">{t('common.result')}</th>
                                  <th className="px-4 py-2 text-center w-12" />
                                </tr>
                              </thead>
                              <tbody>
                                {tournamentHands.map((hand) => (
                                  <tr
                                    key={hand.id}
                                    className="hover:bg-primary-500/5 cursor-pointer border-b border-dark-200 last:border-0"
                                    onClick={() => onSelectHand(hand.id)}
                                  >
                                    <td className="px-4 py-2 text-gray-500">{formatHandTime(hand.date_time)}</td>
                                    <td className="px-4 py-2">
                                      <div className="flex gap-[3px] items-center">
                                        {parseCards(hand.hero_cards || hand.dyn_hero_cards).map((c, i) => <CardTile key={i} card={c} />)}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2">
                                      <span className="px-2 py-0.5 rounded-md bg-dark-300 text-[11px] text-gray-400">
                                        {hand.hero_position || hand.dyn_hero_position} ({hand.player_count === 2 ? 'HU' : '3W'})
                                      </span>
                                    </td>
                                    <td className={clsx('px-4 py-2 text-right font-mono', signed(handCev(hand)))}>{formatCev(handCev(hand))}</td>
                                    <td className={clsx('px-4 py-2 text-right font-semibold', signed(handProfit(hand)))}>
                                      {`${handProfit(hand) > 0 ? '+' : ''}${handProfit(hand).toFixed(0)}`}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); onReplayHand(hand.id) }}
                                        className="p-1 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all"
                                        title={t('common.replay_hand')}
                                      >
                                        <Play style={{ width: 12, height: 12 }} fill="currentColor" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
