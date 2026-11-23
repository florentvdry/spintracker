import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import { ipcService } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import { formatProfit } from '@/utils/formatters'
import { logError } from '@/utils/log'
import { cellGrid, cellValue, heatColor, HOURS, maxAbs, type HeatmapMetric, type TimeCell } from './heatmap'

const FETCH_DEBOUNCE_MS = 300
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const METRICS: HeatmapMetric[] = ['euro', 'cev', 'fish']

interface Goal {
  target: number
  done: number
}

interface TimeStatsData {
  tournaments: number
  cells: TimeCell[]
  by_hour: number[]
  hours_played: number
  profit_per_hour: number
  avg_duration_minutes: number
  week: Goal | null
  month: Goal | null
}

function formatCell(value: number | null): string {
  return value === null ? '' : String(Math.round(value))
}

function GoalBar({ label, goal }: { label: string; goal: Goal }) {
  const percent = Math.min(100, (goal.done / goal.target) * 100)
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="font-mono text-gray-100">
          {goal.done} / {goal.target}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-dark-500">
        <div className="h-full bg-primary-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

/** Results, soft table hours, profit per hour and volume goals, by time of day and weekday. */
export default function TimeAnalysis() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const buyIn = useFilterStore((s) => s.buyIn)
  const customDateFrom = useFilterStore((s) => s.customDateFrom)
  const customDateTo = useFilterStore((s) => s.customDateTo)
  const lastUpdate = useAppStore((s) => s.lastUpdate)
  const [data, setData] = useState<TimeStatsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [metric, setMetric] = useState<HeatmapMetric>('euro')
  const [goalsReload, setGoalsReload] = useState(0)
  const [weekly, setWeekly] = useState('')
  const [monthly, setMonthly] = useState('')

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const timer = setTimeout(async () => {
      try {
        const { dateFrom, dateTo } = currentDateRange()
        const res = await ipcService.getTimeStats({ heroName, dateFrom, dateTo, buyIn: buyInParam(buyIn) })
        if (!cancelled) setData(res.success ? (res.data as TimeStatsData) : null)
      } catch (error) {
        logError('Failed to fetch the time statistics:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }, FETCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [heroName, dateRange, selectedSession, customDateFrom, customDateTo, buyIn, lastUpdate, goalsReload])

  useEffect(() => {
    void ipcService.getSetting('volume_goals').then((res) => {
      if (!res.success || !res.data) return
      setWeekly(res.data.weekly ? String(res.data.weekly) : '')
      setMonthly(res.data.monthly ? String(res.data.monthly) : '')
    })
  }, [])

  const saveGoals = async () => {
    await ipcService.saveSetting('volume_goals', { weekly: Math.max(0, Math.floor(Number(weekly) || 0)), monthly: Math.max(0, Math.floor(Number(monthly) || 0)) })
    setGoalsReload((n) => n + 1)
  }

  const grid = useMemo(() => cellGrid(data?.cells ?? []), [data])
  const max = useMemo(() => maxAbs(data?.cells ?? [], metric), [data, metric])
  const peakVolume = Math.max(1, ...(data?.by_hour ?? [0]))

  return (
    <div className="space-y-4">
      <Card
        title={t('time_analysis.heatmap_title')}
        subtitle={t(`time_analysis.metric_hint_${metric}`)}
        header={
          <div className="segmented">
            {METRICS.map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={clsx('px-3 py-1 text-[13px] font-medium rounded-md', metric === m ? 'bg-primary-500 text-onprimary font-semibold' : 'text-gray-400 hover:text-gray-100')}
              >
                {t(`time_analysis.metric_${m}`)}
              </button>
            ))}
          </div>
        }
      >
        <LoadingOverlay loading={isLoading}>
          {!data || data.tournaments === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{t('common.no_data')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0.5 text-[10px]">
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: HOURS }, (_, hour) => (
                      <th key={hour} className="w-9 font-mono font-normal text-gray-500">
                        {hour}h
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAY_KEYS.map((day, weekday) => (
                    <tr key={day}>
                      <th className="pr-2 text-right font-medium text-gray-400">{t(`time_analysis.weekdays.${day}`)}</th>
                      {grid[weekday].map((cell, hour) => {
                        const value = cell ? cellValue(cell, metric) : null
                        return (
                          <td
                            key={hour}
                            className="h-8 w-9 rounded text-center font-mono text-gray-100"
                            style={{ backgroundColor: heatColor(value, max, metric) }}
                            title={cell ? t('time_analysis.cell_tooltip', { count: cell.tournaments }) : undefined}
                          >
                            {formatCell(value)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LoadingOverlay>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t('time_analysis.hourly_title')}>
          <LoadingOverlay loading={isLoading}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="stat-label">{t('time_analysis.profit_per_hour')}</div>
                <div className={clsx('mt-1 font-mono text-xl font-semibold', (data?.profit_per_hour ?? 0) >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
                  {formatProfit(data?.profit_per_hour ?? 0)}
                </div>
              </div>
              <div>
                <div className="stat-label">{t('time_analysis.hours_played')}</div>
                <div className="mt-1 font-mono text-xl font-semibold text-gray-100">{(data?.hours_played ?? 0).toFixed(1)} h</div>
              </div>
              <div>
                <div className="stat-label">{t('time_analysis.avg_duration')}</div>
                <div className="mt-1 font-mono text-xl font-semibold text-gray-100">{(data?.avg_duration_minutes ?? 0).toFixed(1)} min</div>
              </div>
            </div>
          </LoadingOverlay>
        </Card>

        <Card title={t('time_analysis.goals_title')} subtitle={t('time_analysis.goals_subtitle')}>
          <div className="space-y-3">
            {data?.week && <GoalBar label={t('time_analysis.this_week')} goal={data.week} />}
            {data?.month && <GoalBar label={t('time_analysis.this_month')} goal={data.month} />}
            <div className="flex flex-wrap items-end gap-3 text-xs text-gray-400">
              <label className="flex flex-col gap-1">
                {t('time_analysis.weekly_goal')}
                <input className="input w-24 font-mono" inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                {t('time_analysis.monthly_goal')}
                <input className="input w-24 font-mono" inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
              </label>
              <button className="btn-secondary" onClick={() => void saveGoals()}>
                {t('common.save')}
              </button>
            </div>
          </div>
        </Card>
      </div>

      <Card title={t('time_analysis.volume_title')} subtitle={t('time_analysis.volume_subtitle')}>
        <LoadingOverlay loading={isLoading}>
          <div className="flex h-32 items-end gap-1">
            {(data?.by_hour ?? []).map((count, hour) => (
              <div key={hour} className="flex flex-1 flex-col items-center justify-end gap-1" title={t('time_analysis.cell_tooltip', { count })}>
                <div className="w-full rounded-t bg-primary-500/70" style={{ height: `${(count / peakVolume) * 100}%` }} />
                <span className="font-mono text-[10px] text-gray-500">{hour}</span>
              </div>
            ))}
          </div>
        </LoadingOverlay>
      </Card>
    </div>
  )
}
