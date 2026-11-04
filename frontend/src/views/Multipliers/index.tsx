import { useEffect, useState } from 'react'
import { Hash, Inbox, Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ipcService, type Json } from '@/services/ipcService'
import { currentDateRange, useFilterStore } from '@/stores/filterStore'
import { logError } from '@/utils/log'

const FETCH_DEBOUNCE_MS = 300
// Win rates (%) separating good / average / losing results over a Spin sample.
const GOOD_WIN_RATE = 38
const AVERAGE_WIN_RATE = 35

function multiplierColor(multiplier: number): string {
  if (multiplier >= 100) return 'bg-yellow-500 text-black'
  if (multiplier >= 25) return 'bg-purple-600 text-white'
  if (multiplier >= 10) return 'bg-blue-600 text-white'
  if (multiplier >= 4) return 'bg-green-600 text-white'
  return 'bg-dark-500 text-dark-50 border border-dark-100/20'
}

function winRateColor(winRate: number): string {
  if (winRate >= GOOD_WIN_RATE) return 'text-profit-positive'
  if (winRate >= AVERAGE_WIN_RATE) return 'text-yellow-400'
  return 'text-profit-negative'
}

const headerCell = 'px-6 py-4 text-[11px] font-black text-dark-100 uppercase tracking-widest border-b border-dark-100/20'

export default function Multipliers() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const customDateFrom = useFilterStore((s) => s.customDateFrom)
  const customDateTo = useFilterStore((s) => s.customDateTo)

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Json[]>([])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const { dateFrom, dateTo } = currentDateRange()
        const res = await ipcService.getMultiplierStats({ heroName, dateFrom, dateTo })
        if (!cancelled && res.success) setStats(res.data ?? [])
      } catch (error) {
        logError('Failed to fetch multiplier stats:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, FETCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [heroName, dateRange, selectedSession, customDateFrom, customDateTo])

  const totalGames = stats.reduce((acc, s) => acc + s.totalCount, 0)
  const totalWins = stats.reduce((acc, s) => acc + s.winCount, 0)
  const globalWinRate = totalGames === 0 ? 0 : (totalWins / totalGames) * 100

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between bg-dark-400 border border-dark-100/30 p-6 rounded-lg shadow-xl shadow-black/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary-500/10 border border-primary-500/20 text-primary-400">
            <Hash className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white leading-tight tracking-tight uppercase">{t('multipliers.title')}</h1>
            <p className="text-dark-100 text-sm font-medium">{t('multipliers.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-dark-500/50 p-2 rounded-lg border border-dark-100/20">
          <div className="px-4 py-2 text-center border-r border-dark-100/20">
            <span className="block text-[10px] font-black text-dark-100 uppercase tracking-widest leading-none mb-1">{t('multipliers.total_games')}</span>
            <span className="text-lg font-black text-white leading-none">{totalGames}</span>
          </div>
          <div className="px-4 py-2 text-center">
            <span className="block text-[10px] font-black text-dark-100 uppercase tracking-widest leading-none mb-1">{t('multipliers.global_win_rate')}</span>
            <span className={clsx('text-lg font-black leading-none', globalWinRate >= GOOD_WIN_RATE ? 'text-profit-positive' : 'text-yellow-400')}>
              {globalWinRate.toFixed(2)}%
            </span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-dark-400 rounded-lg border border-dark-100/30">
          <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
          <span className="text-dark-100 font-bold uppercase tracking-widest text-sm">{t('common.loading')}</span>
        </div>
      ) : stats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-dark-400 rounded-lg border border-dark-100/30 text-center">
          <div className="w-16 h-16 bg-dark-100/10 rounded-full flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-dark-100/40" />
          </div>
          <h3 className="text-white font-bold text-lg">{t('common.no_data')}</h3>
          <p className="text-dark-100 text-sm mt-1 max-w-xs">{t('dashboard.no_data_chart')}</p>
        </div>
      ) : (
        <div className="bg-dark-400 rounded-lg border border-dark-100/30 shadow-xl shadow-black/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-dark-500/50">
                  <th className={headerCell}>{t('multipliers.multiplier')}</th>
                  <th className={clsx(headerCell, 'text-center')}>{t('multipliers.total')}</th>
                  <th className={clsx(headerCell, 'text-center')}>{t('multipliers.percentage')}</th>
                  <th className={clsx(headerCell, 'text-center')}>{t('multipliers.won')}</th>
                  <th className={clsx(headerCell, 'text-center')}>{t('multipliers.lost')}</th>
                  <th className={clsx(headerCell, 'text-right')}>{t('multipliers.win_rate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-100/10">
                {stats.map((s) => (
                  <tr key={s.multiplier} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-5">
                      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg shadow-inner', multiplierColor(s.multiplier))}>
                        x{s.multiplier}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center text-white font-bold text-lg">{s.totalCount}</td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-dark-50 font-black text-base">{s.percentageOfTotal}%</span>
                        <div className="w-20 h-1 bg-dark-500 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-500/60" style={{ width: `${s.percentageOfTotal}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-profit-positive font-bold text-sm border border-green-500/20">
                        <TrendingUp className="w-3.5 h-3.5" />
                        {s.winCount}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-profit-negative font-bold text-sm border border-red-500/20">
                        <TrendingDown className="w-3.5 h-3.5" />
                        {s.lossCount}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className={clsx('text-xl font-black', winRateColor(s.winPercentage))}>{s.winPercentage.toFixed(2)}%</span>
                        <span className="text-[10px] text-dark-100 font-black uppercase tracking-tighter opacity-60">{t('multipliers.success_rate')}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
