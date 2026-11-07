import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, ChevronRight, Crown, Fish, Info, Layers, Play, Save, Upload, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import RangeGrid, { type CellStats } from '@/components/charts/RangeGrid'
import { ipcService, type Json } from '@/services/ipcService'
import { currentDateRange, useFilterStore } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { usePlayersStore } from '@/stores/playersStore'
import { useReplayerStore } from '@/stores/replayerStore'
import SituationSelector from './components/SituationSelector'
import { logError } from '@/utils/log'

const CONFIG_STORAGE_KEY = 'range_research_config_v2'
const FILTER_DEBOUNCE_MS = 300
const PLAYERS_LIMIT = 1000

const ACTION_COLORS: Record<string, string> = {
  AllIn: '#b71c1c',
  Raise: '#f44336',
  Raise2_3BB: '#e5594f',
  Raise4BB: '#f97316',
  Bet: '#ff9800',
  Call: '#4caf50',
  Check: '#9e9e9e',
  Fold: '#2196f3',
  None: '#1e293b',
}

const LEGEND: { color: string; shadow: string; label: string }[] = [
  { color: '#e5594f', shadow: 'shadow-red-500/50', label: '2-3bb' },
  { color: '#f97316', shadow: 'shadow-orange-500/50', label: '4bb+' },
  { color: '#ff9800', shadow: 'shadow-orange-500/50', label: 'actions.bet' },
  { color: '#4caf50', shadow: 'shadow-green-500/50', label: 'actions.call' },
  { color: '#9e9e9e', shadow: 'shadow-gray-500/50', label: 'actions.check' },
  { color: '#b71c1c', shadow: 'shadow-red-900/50', label: 'actions.allin' },
]

const DEFAULT_FILTERS: Json = {
  Situation: 'Preflop',
  Action: '',
  PlayerCount: 3,
  MinStackBB: null,
  MaxStackBB: null,
  Positions: [],
  ActionSequence: [],
  SituationId: '',
}

type OpponentType = 'all' | 'reg' | 'fish'

const normalizeAction = (action: string | undefined) => (action ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const handAction = (hand: Json): string => hand.action || hand.Action || ''
const handId = (hand: Json) => hand.id || hand.Id
const handProfit = (hand: Json): number => (hand.profit !== undefined ? hand.profit : hand.Profit || 0)

function matchesAction(hand: Json, filter: string | null): boolean {
  if (!filter) return true
  const action = normalizeAction(handAction(hand))
  const wanted = normalizeAction(filter)
  return action.includes(wanted) || wanted.includes(action)
}

function actionClass(action: string): string {
  if (action === 'Raise' || action === 'AllIn') return 'text-profit-negative'
  if (action === 'Call') return 'text-profit-positive'
  return 'text-info'
}

export default function RangeResearch() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const loadPlayers = usePlayersStore((s) => s.loadPlayers)
  const openSingleHandReplayer = useReplayerStore((s) => s.openSingleHandReplayer)
  const openReplayerForQueue = useReplayerStore((s) => s.openReplayerWindowForQueue)
  const heroName = useFilterStore((s) => s.heroName)
  // Subscribed so the combined filters (and the data) refresh when the global date range changes.
  const dateRange = useFilterStore((s) => s.dateRange)
  const selectedSession = useFilterStore((s) => s.selectedSession)

  const setDateRange = useFilterStore((s) => s.setDateRange)

  // The analysis reads every hand of the period: it opens on the current month at most. A wider
  // period stays one click away and shows the loading indicator while it is read.
  useEffect(() => {
    if (useFilterStore.getState().dateRange === 'all') setDateRange('month')
  }, [setDateRange])

  const [localFilters, setLocalFilters] = useState<Json>(DEFAULT_FILTERS)
  const [opponentType, setOpponentType] = useState<OpponentType>('all')
  const [rangeData, setRangeData] = useState<Json>({})
  const [rangeLoading, setRangeLoading] = useState(false)
  const [selectedHand, setSelectedHand] = useState<string | null>(null)
  const [selectedStats, setSelectedStats] = useState<CellStats | null>(null)
  const [actionFilter, setActionFilter] = useState<string | null>(null)
  const isFirstLoad = useRef(true)

  const opponentTypes = [
    { id: 'all' as const, label: t('range_analysis.all_opponents'), icon: Users },
    { id: 'reg' as const, label: t('range_analysis.regs_only'), icon: Crown },
    { id: 'fish' as const, label: t('range_analysis.fish_only'), icon: Fish },
  ]

  const combinedFilters = useMemo(() => {
    const { dateFrom, dateTo } = currentDateRange()
    return {
      ...localFilters,
      HeroName: localFilters.HeroName !== undefined ? localFilters.HeroName : heroName,
      DateFrom: dateFrom,
      DateTo: dateTo,
      OpponentType: opponentType,
    }
    // dateRange / selectedSession are inputs of currentDateRange().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFilters, heroName, opponentType, dateRange, selectedSession])

  useEffect(() => {
    void loadPlayers({ limit: PLAYERS_LIMIT })
  }, [loadPlayers])

  // Reload (debounced) whenever the filters change; the first load is immediate when a hero is set.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setRangeLoading(true)
      setSelectedHand(null)
      setSelectedStats(null)
      try {
        const response = await ipcService.getRangeBreakdown(combinedFilters)
        if (!cancelled && response.success) setRangeData(response.data || {})
      } catch (err) {
        logError('Failed to fetch range breakdown', err)
      } finally {
        if (!cancelled) setRangeLoading(false)
      }
    }

    if (isFirstLoad.current) {
      isFirstLoad.current = false
      if (heroName) void load()
      return () => { cancelled = true }
    }
    const timer = setTimeout(() => void load(), FILTER_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [combinedFilters, heroName])

  const sortedActions = selectedStats?.Actions ? Object.entries(selectedStats.Actions).sort((a, b) => b[1] - a[1]) : []
  const totalCount = selectedStats?.TotalCount || 0
  const actionPercent = (count: number) => (totalCount > 0 ? ((count / totalCount) * 100).toFixed(0) : '0')
  const filteredHands = (selectedStats?.Hands ?? []).filter((h) => matchesAction(h, actionFilter))

  const saveConfig = () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(localFilters))
    notify.success(t('range_analysis.config_saved'))
  }

  const loadConfig = () => {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!saved) return
    try {
      setLocalFilters(JSON.parse(saved))
      notify.success(t('range_analysis.config_loaded'))
    } catch {
      notify.error(t('common.error'))
    }
  }

  const replayFiltered = () => {
    const ids = filteredHands.map(handId).filter(Boolean)
    if (ids.length > 0) void openReplayerForQueue(ids, 0, heroName)
  }

  const selectPrompt = t('range_analysis.select_prompt')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t('range_analysis.title')}</h1>
          <p className="page-subtitle">{t('range_analysis.subtitle')}</p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={loadConfig} className="btn-secondary">
            <Upload className="w-4 h-4" /> {t('range_analysis.load_preset')}
          </button>
          <button onClick={saveConfig} className="btn-primary">
            <Save className="w-4 h-4" /> {t('range_analysis.save_config')}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 min-h-0">
        <SituationSelector filters={combinedFilters} onChange={(updates) => setLocalFilters((f: Json) => ({ ...f, ...updates }))} />

        <div className="flex items-center gap-4 bg-dark-600 p-3 rounded-[10px] border border-dark-200">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-[13px] font-semibold text-gray-400">{t('range_analysis.opponent_type')} :</span>
          </div>
          <div className="flex gap-2">
            {opponentTypes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setOpponentType(id)}
                className={clsx('pill !rounded-md', opponentType === id && 'active')}
              >
                <Icon className={clsx('w-3.5 h-3.5', id === 'reg' && 'text-primary-400', id === 'fish' && 'text-info')} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex gap-4 min-h-0">
          <div className="flex-1 bg-dark-400 rounded-[10px] border border-dark-200 flex flex-col min-h-0 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><BarChart3 className="w-32 h-32" /></div>

            <div className="px-5 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-gray-100">{t('range_analysis.matrix_title')}</h2>
              </div>
              <div className="flex gap-4">
                {LEGEND.map(({ color, shadow, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={clsx('w-2.5 h-2.5 rounded-full shadow-sm', shadow)} style={{ backgroundColor: color }} />
                    <span className="text-xs text-gray-400">{label.includes('.') ? t(label) : label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 p-6 overflow-auto flex items-center justify-center">
              {rangeLoading ? (
                <div className="flex flex-col items-center gap-4 text-gray-500 animate-pulse">
                  <div className="w-12 h-12 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin" />
                  <span className="text-sm font-medium tracking-wide">{t('range_analysis.loading')}</span>
                </div>
              ) : (
                <RangeGrid
                  data={rangeData}
                  size="lg"
                  selectedHand={selectedHand}
                  onCellClick={(hand, stats) => { setSelectedHand(hand); setSelectedStats(stats); setActionFilter(null) }}
                  className="shadow-xl border border-dark-200"
                />
              )}
            </div>
          </div>

          <div className="w-[450px] flex flex-col gap-4 min-h-0">
            <div className="bg-dark-400 rounded-[10px] border border-dark-200 p-5 relative overflow-hidden flex-shrink-0">
              {selectedHand ? (
                <div className="space-y-4">
                  <div className="flex items-end justify-between border-b border-dark-200 pb-4">
                    <div className="flex flex-col">
                      <span className="stat-label !text-primary-400 mb-1">{t('range_analysis.selected_hand')}</span>
                      <div className="text-6xl font-semibold font-mono text-gray-100 leading-none">{selectedHand}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('range_analysis.occurrences')}</div>
                      <div className="text-3xl font-black text-gray-100 leading-none">{totalCount}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-dark-300/50 p-4 rounded-lg border border-dark-200">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('range_analysis.total_profit')}</div>
                      <div className={clsx('text-xl font-black', (selectedStats?.TotalProfit || 0) >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
                        {(selectedStats?.TotalProfit || 0).toFixed(0)} <span className="text-[10px] opacity-50">{t('common.chips')}</span>
                      </div>
                    </div>
                    <div className="bg-dark-300/50 p-4 rounded-lg border border-dark-200">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t('range_analysis.ev_realized')}</div>
                      <div className={clsx('text-xl font-black', (selectedStats?.TotalEv || 0) >= 0 ? 'text-primary-400' : 'text-profit-negative')}>
                        {(selectedStats?.TotalEv || 0).toFixed(1)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500 gap-3">
                  <Info className="w-8 h-8 opacity-20" />
                  <p className="text-sm font-medium text-center whitespace-pre-line">{selectPrompt}</p>
                </div>
              )}
            </div>

            <div className="flex-1 bg-dark-400 rounded-[10px] border border-dark-200 flex flex-col min-h-0 overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-gray-100">{t('range_analysis.distributions')}</h2>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {selectedHand ? (
                  <>
                    <div className="space-y-3">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('range_analysis.frequencies')}</span>
                      <div className="grid grid-cols-3 gap-2">
                        {sortedActions.map(([action, count]) => (
                          <button
                            key={action}
                            onClick={() => setActionFilter(actionFilter === action ? null : action)}
                            className={clsx('flex flex-col p-3 rounded-lg border transition-all relative overflow-hidden', actionFilter === action ? 'ring-2 ring-white border-transparent' : 'border-transparent')}
                            style={{ backgroundColor: `${ACTION_COLORS[action] || ACTION_COLORS.None}22` }}
                          >
                            <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: ACTION_COLORS[action] || ACTION_COLORS.None }} />
                            <span className="text-[10px] font-bold uppercase opacity-60 mb-1">{action}</span>
                            <span className="text-lg font-black text-gray-100 leading-none">{actionPercent(count)}%</span>
                            <span className="text-[9px] mt-1 opacity-40">{count} {t('common.hands')}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-dark-200">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('range_analysis.history')}</span>
                        <button onClick={replayFiltered} className="text-[10px] font-bold text-primary-400 hover:text-primary-300 flex items-center gap-1.5 uppercase transition-colors">
                          <Play className="w-3 h-3" /> {t('range_analysis.replay_filtered')}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {filteredHands.map((hand, idx) => {
                          const profit = handProfit(hand)
                          const ev = hand.ev !== undefined ? hand.ev : hand.Ev || 0
                          return (
                            <div
                              key={handId(hand) ?? idx}
                              onClick={() => { const id = handId(hand); if (id) void openSingleHandReplayer(id, heroName) }}
                              className="flex items-center gap-3 p-3 bg-dark-400/50 rounded-lg border border-dark-200 hover:border-dark-200 hover:bg-dark-300 transition-all cursor-pointer group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-dark-500 flex items-center justify-center text-[10px] font-bold text-gray-500 group-hover:text-primary-400 transition-colors">{idx + 1}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className={clsx('text-[10px] font-black uppercase tracking-tighter', actionClass(handAction(hand)))}>{handAction(hand)}</span>
                                  <span className="text-[9px] text-gray-600 font-mono">{hand.date || hand.Date ? new Date(hand.date || hand.Date).toLocaleDateString() : ''}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={clsx('text-xs font-bold', profit >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
                                    {profit >= 0 ? '+' : ''}{profit.toFixed(0)} <span className="text-[9px] opacity-60">{t('common.chips')}</span>
                                  </span>
                                  <div className="w-1 h-1 rounded-full bg-white/5" />
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] text-gray-500 font-bold uppercase">EV</span>
                                    <span className={clsx('text-[10px] font-bold', ev >= 0 ? 'text-primary-400/80' : 'text-profit-negative/80')}>
                                      {hand.ev !== undefined && hand.ev !== null ? (hand.ev || 0).toFixed(1) : '—'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-100 transition-all transform group-hover:translate-x-1" />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
                    <Layers className="w-12 h-12" />
                    <p className="text-xs text-center font-medium whitespace-pre-line">{selectPrompt}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
