import { useEffect, useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import { ipcService, type Json } from '@/services/ipcService'
import { currentDateRange, useFilterStore } from '@/stores/filterStore'
import { logError } from '@/utils/log'

const FETCH_DEBOUNCE_MS = 300
// Win rates (%) separating good / average / losing results over a Spin sample.
const GOOD_WIN_RATE = 38
const AVERAGE_WIN_RATE = 35
// Multipliers from which a badge gets a stronger colour.
const MULTIPLIER_TIERS: { from: number; className: string }[] = [
  { from: 100, className: 'bg-yellow-500 text-black' },
  { from: 25, className: 'bg-purple-600 text-white' },
  { from: 10, className: 'bg-blue-600 text-white' },
  { from: 4, className: 'bg-green-600 text-white' },
]
const DEFAULT_BADGE = 'bg-dark-500 text-dark-50 border border-dark-100/20'

const badgeClass = (multiplier: number) => MULTIPLIER_TIERS.find((tier) => multiplier >= tier.from)?.className ?? DEFAULT_BADGE

const winRateClass = (winRate: number) => (winRate >= GOOD_WIN_RATE ? 'text-profit-positive' : winRate >= AVERAGE_WIN_RATE ? 'text-yellow-400' : 'text-profit-negative')

const headerCell = 'px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500'

/** Results by Spin multiplier, for the hero and the period selected in the filters. */
export default function MultipliersCard() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const customDateFrom = useFilterStore((s) => s.customDateFrom)
  const customDateTo = useFilterStore((s) => s.customDateTo)
  const [stats, setStats] = useState<Json[]>([])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { dateFrom, dateTo } = currentDateRange()
        const res = await ipcService.getMultiplierStats({ heroName, dateFrom, dateTo })
        if (!cancelled && res.success) setStats(res.data ?? [])
      } catch (error) {
        logError('Failed to fetch multiplier stats:', error)
      }
    }, FETCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [heroName, dateRange, selectedSession, customDateFrom, customDateTo])

  const totalGames = stats.reduce((sum, s) => sum + s.totalCount, 0)
  const totalWins = stats.reduce((sum, s) => sum + s.winCount, 0)
  const globalWinRate = totalGames === 0 ? 0 : (totalWins / totalGames) * 100

  return (
    <Card
      title={t('multipliers.title')}
      subtitle={t('multipliers.subtitle')}
      header={
        totalGames > 0 ? (
          <div className="flex items-center gap-4 text-right text-xs text-gray-400">
            <span>
              {t('multipliers.total')} <span className="font-mono text-sm font-bold text-white">{totalGames}</span>
            </span>
            <span>
              {t('multipliers.win_rate')} <span className={clsx('font-mono text-sm font-bold', winRateClass(globalWinRate))}>{globalWinRate.toFixed(2)}%</span>
            </span>
          </div>
        ) : undefined
      }
    >
      {stats.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">{t('common.no_data')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-dark-300">
                <th className={headerCell}>{t('multipliers.multiplier')}</th>
                <th className={clsx(headerCell, 'text-center')}>{t('multipliers.total')}</th>
                <th className={clsx(headerCell, 'text-center')}>{t('multipliers.percentage')}</th>
                <th className={clsx(headerCell, 'text-center')}>{t('multipliers.won')}</th>
                <th className={clsx(headerCell, 'text-center')}>{t('multipliers.lost')}</th>
                <th className={clsx(headerCell, 'text-right')}>{t('multipliers.win_rate')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.multiplier} className="border-t border-dark-300 hover:bg-white/5">
                  <td className="px-4 py-2">
                    <span className={clsx('inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-2 py-1 text-sm font-black', badgeClass(s.multiplier))}>x{s.multiplier}</span>
                  </td>
                  <td className="px-4 py-2 text-center font-mono text-white">{s.totalCount}</td>
                  <td className="px-4 py-2">
                    <div className="mx-auto flex w-24 flex-col items-center gap-1">
                      <span className="font-mono text-xs text-gray-300">{s.percentageOfTotal}%</span>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-dark-500">
                        <div className="h-full bg-primary-500/60" style={{ width: `${s.percentageOfTotal}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-flex items-center gap-1 font-mono text-profit-positive">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {s.winCount}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-flex items-center gap-1 font-mono text-profit-negative">
                      <TrendingDown className="h-3.5 w-3.5" />
                      {s.lossCount}
                    </span>
                  </td>
                  <td className={clsx('px-4 py-2 text-right font-mono font-bold', winRateClass(s.winPercentage))}>{s.winPercentage.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
