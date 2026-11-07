import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Crown, Eye, Fish, Loader2, Play, Search, Users, X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import PlayingCard from '@/components/common/PlayingCard'
import RoomLogo from '@/components/common/RoomLogo'
import { ipcService, type Json } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { useReplayerStore } from '@/stores/replayerStore'
import { parseCards } from '@/utils/formatters'
import AliasManagement from './AliasManagement'
import { logError } from '@/utils/log'

const PAGE_SIZE = 50
const PLAYER_LIMIT = 1000
const HANDS_PAGE_SIZE = 20
// Players with at least this many hands are auto-detected as regulars by the backend.
const AUTO_REG_MIN_HANDS = 500

type Tab = 'list' | 'aliases'
type RegFilter = 'all' | 'reg' | 'fish'

const handProfit = (hand: Json): number => hand.dyn_hero_profit || hand.hero_profit || 0
const signedColor = (value: number) => (value > 0 ? 'text-profit-positive' : value < 0 ? 'text-profit-negative' : 'text-gray-400')
const headCell = 'px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-[.06em]'

export default function Players() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const openSingleHandReplayer = useReplayerStore((s) => s.openSingleHandReplayer)

  const [activeTab, setActiveTab] = useState<Tab>('list')
  const [players, setPlayers] = useState<Json[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<RegFilter>('all')
  const [updatingId, setUpdatingId] = useState<number | string | null>(null)
  const [page, setPage] = useState(1)

  const [selectedPlayer, setSelectedPlayer] = useState<Json | null>(null)
  const [playerHands, setPlayerHands] = useState<Json | null>(null)
  const [handsLoading, setHandsLoading] = useState(false)
  const [handsPage, setHandsPage] = useState(1)
  const [handsSortBy, setHandsSortBy] = useState('date_desc')
  const [expandedHands, setExpandedHands] = useState<Record<string, boolean>>({})

  const loadPlayers = useCallback(async (regFilter: RegFilter) => {
    setLoading(true)
    try {
      const result = await ipcService.getPlayers({
        limit: PLAYER_LIMIT,
        minHands: 1,
        isRegFilter: regFilter === 'all' ? null : regFilter,
      })
      if (result.success) setPlayers(result.data || [])
    } catch (error) {
      logError('Failed to load players:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlayers('all')
  }, [loadPlayers])

  const filteredPlayers = useMemo(() => {
    if (!searchTerm) return players
    const needle = searchTerm.toLowerCase()
    return players.filter((p) => p.name.toLowerCase().includes(needle))
  }, [players, searchTerm])

  const totalPages = Math.ceil(filteredPlayers.length / PAGE_SIZE)
  const paginatedPlayers = filteredPlayers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const changeFilter = (next: RegFilter) => {
    setFilter(next)
    setPage(1)
    void loadPlayers(next)
  }

  const toggleReg = async (player: Json) => {
    setUpdatingId(player.id)
    try {
      const isReg = !player.is_reg
      const result = await ipcService.updatePlayerRegStatus(player.id, isReg)
      if (result.success) {
        setPlayers((list) => list.map((p) => (p.id === player.id ? { ...p, is_reg: isReg, is_reg_forced: true } : p)))
      }
    } catch (error) {
      logError('Failed to update player reg status:', error)
    } finally {
      setUpdatingId(null)
    }
  }

  const viewHands = async (player: Json) => {
    setSelectedPlayer(player)
    setHandsPage(1)
    setExpandedHands({})
    setHandsLoading(true)
    try {
      const result = await ipcService.getHandsAgainstPlayer(player.name, heroName, HANDS_PAGE_SIZE, 1)
      if (result.success) setPlayerHands(result.data)
    } catch (error) {
      logError('Failed to load player hands:', error)
    } finally {
      setHandsLoading(false)
    }
  }

  const loadMoreHands = async () => {
    if (!selectedPlayer || handsLoading) return
    setHandsLoading(true)
    try {
      const nextPage = handsPage + 1
      const result = await ipcService.getHandsAgainstPlayer(selectedPlayer.name, heroName, HANDS_PAGE_SIZE, nextPage)
      if (result.success) {
        setPlayerHands({ ...result.data, hands: [...(playerHands?.hands ?? []), ...result.data.hands] })
        setHandsPage(nextPage)
      }
    } catch (error) {
      logError('Failed to load more hands:', error)
    } finally {
      setHandsLoading(false)
    }
  }

  const sortHands = (field: 'date' | 'profit' | 'cev') => {
    const next = handsSortBy === `${field}_desc` ? `${field}_asc` : `${field}_desc`
    setHandsSortBy(next)
    if (!playerHands?.hands) return

    const value = (hand: Json): number => {
      if (field === 'date') return new Date(hand.date_time).getTime()
      if (field === 'profit') return handProfit(hand)
      return hand.ev_chips || 0
    }
    const direction = next.endsWith('_desc') ? -1 : 1
    const sorted = [...playerHands.hands].sort((a, b) => direction * (value(a) - value(b)))
    setPlayerHands({ ...playerHands, hands: sorted })
  }

  const closeModal = () => {
    setSelectedPlayer(null)
    setPlayerHands(null)
    setHandsPage(1)
  }

  const tabButton = (tab: Tab, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={clsx('segmented-item', activeTab === tab && 'active')}
    >
      {label}
    </button>
  )
  const sortIcon = (field: string) => (
    <ArrowUpDown className={clsx('w-3 h-3', handsSortBy.startsWith(field) ? 'opacity-100 text-primary-400' : 'opacity-0')} />
  )
  const handsHead = 'px-4 py-2.5 text-[11px] font-medium text-gray-500 uppercase tracking-[.06em]'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-dark-200 bg-dark-400 p-5">
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <h1 className="page-title">{t('players.title')}</h1>
            <p className="page-subtitle">{t('players.subtitle')}</p>
          </div>
          <div className="segmented bg-dark-600">
            {tabButton('list', t('players.tabs.list', 'Player List'))}
            {tabButton('aliases', t('players.tabs.aliases', 'Alias Management'))}
          </div>
        </div>

        {activeTab === 'list' && (
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 mr-2">
              {(['all', 'reg', 'fish'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => changeFilter(f)}
                  className={clsx(
                    'pill',
                    filter === f && 'active',
                  )}
                >
                  {f === 'all' && t('players.filter_all')}
                  {f === 'reg' && <span className="flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-primary-500" />{t('players.filter_reg')}</span>}
                  {f === 'fish' && <span className="flex items-center gap-1.5"><Fish className="w-3.5 h-3.5 text-info" />{t('players.filter_fish')}</span>}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('common.search')}
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
                className="input pl-9 w-64"
              />
            </div>
          </div>
        )}
      </div>

      {activeTab === 'aliases' ? (
        <AliasManagement />
      ) : (
        <div className="rounded-[10px] border border-dark-200 bg-dark-400 flex flex-col overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-gray-100">{t('players.list')} ({filteredPlayers.length})</h2>
            </div>
          </div>

          <div className="overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-dark-400 border-b border-dark-200">
                  <tr>
                    <th className={clsx(headCell, 'text-left')}>{t('players.player')}</th>
                    <th className={clsx(headCell, 'text-right')}>{t('players.hands')}</th>
                    <th className={clsx(headCell, 'text-right')}>{t('players.profit')}</th>
                    <th className={clsx(headCell, 'text-center')}>{t('players.type')}</th>
                    <th className={clsx(headCell, 'text-center')}>{t('players.auto_detected')}</th>
                    <th className={clsx(headCell, 'text-right')}>{t('players.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f242c]">
                  {paginatedPlayers.map((player) => (
                    <tr key={player.id} className="hover:bg-dark-300/60 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <RoomLogo room={player.room} />
                          <div className="w-8 h-8 rounded-full bg-dark-300 flex items-center justify-center text-xs font-semibold text-gray-400">
                            {player.name ? player.name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <span className="text-sm font-medium text-gray-100">{player.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right"><span className="text-sm text-gray-300">{(player.total_hands || 0).toLocaleString()}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={clsx('font-mono text-sm font-medium', (player.total_profit || 0) >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
                          {(player.total_profit || 0) >= 0 ? '+' : ''}{(player.total_profit || 0).toFixed(0)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => void toggleReg(player)}
                          disabled={updatingId === player.id}
                          className={clsx(
                            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all',
                            player.is_reg
                              ? 'bg-[#12332a] text-primary-500 border border-primary-500/30 hover:bg-primary-500/20'
                              : 'bg-[#172a4a] text-info border border-info/30 hover:bg-info/20',
                          )}
                          title={player.is_reg ? t('players.mark_fish') : t('players.mark_reg')}
                        >
                          {updatingId === player.id ? <Loader2 className="w-3 h-3 animate-spin" /> : player.is_reg ? <Crown className="w-3 h-3" /> : <Fish className="w-3 h-3" />}
                          {player.is_reg ? t('players.is_reg') : t('players.is_fish')}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {player.is_reg_forced ? (
                          <span className="text-xs text-gray-500">{t('players.manual')}</span>
                        ) : player.total_hands >= AUTO_REG_MIN_HANDS ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#12332a] text-profit-positive">
                            <Crown className="w-3 h-3" />{t('common.auto')}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => void viewHands(player)} className="text-xs text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1" title={t('players.view_hands')}>
                            <Eye className="w-3 h-3" />{t('players.view_hands')}
                          </button>
                          <button
                            onClick={() => void toggleReg(player)}
                            disabled={updatingId === player.id}
                            className={clsx('text-xs font-medium transition-colors', player.is_reg ? 'text-primary-500 hover:text-primary-300' : 'text-info hover:text-info')}
                            title={player.is_reg ? t('players.mark_fish') : t('players.mark_reg')}
                          >
                            {player.is_reg ? t('players.set_fish') : t('players.set_reg')}
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
            <div className="px-5 py-3 border-t border-dark-200 flex items-center justify-between">
              <span className="text-xs text-gray-500">{t('players.page')} {page} / {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="h-8 w-8 flex items-center justify-center rounded-lg bg-dark-300 text-gray-100 hover:bg-dark-200 disabled:opacity-50 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="h-8 w-8 flex items-center justify-center rounded-lg bg-dark-300 text-gray-100 hover:bg-dark-200 disabled:opacity-50 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-dark-600 rounded-[10px] shadow-xl border border-dark-200 w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-dark-200">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center border border-primary-500/20">
                  <RoomLogo room={selectedPlayer.room} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-100">
                    {t('players.hands_against')} <span className="text-primary-400">{selectedPlayer.name}</span>
                  </h2>
                  <p className="text-xs text-gray-400">
                    {playerHands?.total || 0} {t('players.total_hands')}
                    {heroName ? <span className="ml-2 text-primary-400">• {t('players.hero_label', { name: heroName })}</span> : <span className="ml-2 text-primary-400">• {t('common.select_hero')}</span>}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-dark-300 text-gray-400 hover:text-gray-100 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-auto p-2">
              {handsLoading && !playerHands ? (
                <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div>
              ) : playerHands?.hands?.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-dark-200">
                  <table className="w-full">
                    <thead className="bg-dark-600 sticky top-0 z-10">
                      <tr>
                        <th className={clsx(handsHead, 'w-10 text-center')}>#</th>
                        <th className={clsx(handsHead, 'text-left cursor-pointer hover:bg-dark-300')} onClick={() => sortHands('date')}><div className="flex items-center gap-1">{t('common.date')}{sortIcon('date')}</div></th>
                        <th className={clsx(handsHead, 'text-left')}>{t('common.cards')}</th>
                        <th className={clsx(handsHead, 'text-left')}>{t('common.position')}</th>
                        <th className={clsx(handsHead, 'text-right')}>{t('common.blinds')}</th>
                        <th className={clsx(handsHead, 'text-right cursor-pointer hover:bg-dark-300')} onClick={() => sortHands('cev')}><div className="flex items-center justify-end gap-1">{t('common.cev')}{sortIcon('cev')}</div></th>
                        <th className={clsx(handsHead, 'text-right cursor-pointer hover:bg-dark-300')} onClick={() => sortHands('profit')}><div className="flex items-center justify-end gap-1">{t('common.result')}{sortIcon('profit')}</div></th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f242c]">
                      {playerHands.hands.map((hand: Json, idx: number) => {
                        const profit = handProfit(hand)
                        const ev = hand.ev_chips || 0
                        const expanded = expandedHands[hand.id]
                        return (
                          <Fragment key={hand.id ?? idx}>
                            <tr className="hover:bg-dark-600/50 transition-colors cursor-pointer group" onClick={() => setExpandedHands((s) => ({ ...s, [hand.id]: !s[hand.id] }))}>
                              <td className="px-4 py-3 text-center">{expanded ? <ChevronDown className="w-4 h-4 text-primary-400 mx-auto" /> : <ChevronRight className="w-4 h-4 text-gray-500 mx-auto" />}</td>
                              <td className="px-4 py-3 text-gray-300 text-sm">
                                <div className="flex flex-col">
                                  <span>{new Date(hand.date_time).toLocaleDateString()}</span>
                                  <span className="text-xs text-gray-500">{new Date(hand.date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-0.5">
                                  {parseCards(hand.dyn_hero_cards || hand.hero_cards || '').map((card, i) => <PlayingCard key={i} card={card} size="sm" />)}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={clsx(
                                  'px-2 py-1 rounded text-xs font-medium',
                                  hand.opponent_position === 'BB' || hand.opponent_position === 'SB' ? 'bg-purple-500/20 text-purple-400'
                                    : hand.opponent_position === 'BTN' ? 'bg-orange-500/20 text-orange-400' : 'bg-dark-400 text-gray-400',
                                )}>
                                  {hand.opponent_position}
                                </span>
                                <span className="ml-1 text-xs text-gray-500">({hand.player_count === 2 ? 'HU' : `${hand.player_count}max`})</span>
                              </td>
                              <td className="px-4 py-3 text-right text-gray-400 text-sm font-mono">{hand.blinds || '-'}</td>
                              <td className={clsx('px-4 py-3 text-right font-mono text-sm', signedColor(ev))}>{ev > 0 ? '+' : ''}{ev.toFixed(1)}</td>
                              <td className={clsx('px-4 py-3 text-right font-semibold text-sm', signedColor(profit))}>{profit > 0 ? '+' : ''}{profit.toFixed(0)}</td>
                              <td className="px-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); void openSingleHandReplayer(hand.id, heroName) }}
                                  className="p-1.5 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400 transition-all opacity-0 group-hover:opacity-100"
                                  title={t('common.replay_hand')}
                                >
                                  <Play className="w-3.5 h-3.5" fill="currentColor" />
                                </button>
                              </td>
                            </tr>

                            {expanded && (
                              <tr>
                                <td colSpan={8} className="p-0 bg-dark-300">
                                  <div className="border-l-2 border-primary-500/50 ml-4 my-2">
                                    <div className="p-4 space-y-3">
                                      <div className="flex items-center gap-6 flex-wrap">
                                        <div className="flex items-center gap-2"><span className="text-xs text-gray-500">{t('common.room')}:</span><span className="text-xs text-gray-300 uppercase font-bold">{hand.room || '-'}</span></div>
                                        <div className="flex items-center gap-2"><span className="text-xs text-gray-500">{t('common.buy_in')}:</span><span className="text-xs text-gray-300">{hand.buy_in ? `${hand.buy_in}€` : '-'}</span></div>
                                        <div className="flex items-center gap-2"><span className="text-xs text-gray-500">{t('common.table')}:</span><span className="text-xs text-gray-300">{hand.table_id || '-'}</span></div>
                                        {(hand.dyn_hero_all_in || hand.hero_all_in) && <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-profit-negative">{t('common.all_in')}</span>}
                                        {hand.went_to_showdown && <span className="px-2 py-0.5 rounded text-xs font-medium bg-dark-400 text-gray-400">{t('common.showdown_short')}</span>}
                                      </div>

                                      {(hand.flop || hand.turn || hand.river) && (
                                        <div className="flex items-center gap-3">
                                          <span className="text-xs text-gray-500">{t('common.board')}:</span>
                                          <div className="flex gap-0.5">
                                            {parseCards(hand.flop || '').map((card, i) => <PlayingCard key={`flop-${i}`} card={card} size="sm" />)}
                                            {hand.turn && <PlayingCard card={hand.turn} size="sm" />}
                                            {hand.river && <PlayingCard card={hand.river} size="sm" />}
                                          </div>
                                        </div>
                                      )}

                                      {hand.went_to_showdown ? (
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="px-1.5 py-0.5 rounded bg-info/20 text-info font-medium">{t('common.showdown_short')}</span>
                                          <span className={profit > 0 ? 'text-profit-positive' : 'text-profit-negative'}>{profit > 0 ? t('common.won') : t('common.lost')}</span>
                                        </div>
                                      ) : profit > 0 ? (
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="px-1.5 py-0.5 rounded bg-profit-positive/15 text-profit-positive font-medium">{t('common.fold')}</span>
                                          <span className="text-profit-positive">{t('common.won')}</span>
                                        </div>
                                      ) : null}
                                    </div>
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
              ) : (
                <div className="text-center text-gray-400 py-12">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>{t('players.no_hands')}</p>
                </div>
              )}

              {playerHands && playerHands.hands?.length < playerHands.total && (
                <div className="p-4 border-t border-dark-200 text-center">
                  <button onClick={() => void loadMoreHands()} disabled={handsLoading} className="btn-primary">
                    {handsLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <span>{t('players.load_more')}</span>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
