import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import { ipcService } from '@/services/ipcService'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import { formatProfit } from '@/utils/formatters'
import { logError } from '@/utils/log'
import { fishShare, maxAbsProfit, shadeOpacity, type HourlyAnalysis } from '@/utils/hourly'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const HOUR_LABEL_EVERY = 3
const PROFIT_COLOR = '#34c27a'
const LOSS_COLOR = '#ff7a6b'
const FISH_COLOR = '#f5c06b'
const BAR_MAX_PX = 56
const MIN_FISH_OPACITY = 0.1

/** When the hero wins: the weekday x hour grid, the profit per hour, and how many fish sit at the tables. */
export default function Hourly() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)
  const customDateFrom = useFilterStore((s) => s.customDateFrom)
  const customDateTo = useFilterStore((s) => s.customDateTo)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const buyIn = useFilterStore((s) => s.buyIn)

  const [data, setData] = useState<HourlyAnalysis | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!heroName) {
      setData(null)
      return
    }
    let active = true
    setLoading(true)
    const { dateFrom, dateTo } = currentDateRange()
    ipcService
      .getHourlyAnalysis({ heroName, dateFrom, dateTo, buyIn: buyInParam(buyIn) })
      .then((result) => {
        if (active) setData(result.success ? (result.data as HourlyAnalysis) : null)
      })
      .catch((error: unknown) => logError('hourly analysis failed', error))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // The date range and session are read through currentDateRange() when the request is sent.
  }, [heroName, dateRange, customDateFrom, customDateTo, selectedSession, buyIn])

  if (!heroName) {
    return <p className="text-sm text-gray-500">{t('hourly.select_hero')}</p>
  }

  const hasTournaments = data !== null && data.by_hour.some((hour) => hour.tournaments > 0)
  const maxProfit = data ? maxAbsProfit(data.results) : 0
  const maxHourProfit = data ? Math.max(0, ...data.by_hour.map((hour) => Math.abs(hour.profit))) : 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{t('hourly.title')}</h1>
        <p className="page-subtitle">{t('hourly.subtitle')}</p>
      </div>

      <LoadingOverlay loading={loading}>
        {!data || !hasTournaments ? (
          <p className="text-sm text-gray-500">{t('hourly.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <Card title={t('hourly.results_title')}>
              <Grid
                render={(day, hour) => {
                  const cell = data.results[day][hour]
                  const color = cell.profit >= 0 ? PROFIT_COLOR : LOSS_COLOR
                  const title = cell.tournaments
                    ? t('hourly.cell_results', { count: cell.tournaments, profit: formatProfit(cell.profit) })
                    : t('hourly.cell_empty')
                  return (
                    <div
                      className="h-5 rounded-sm"
                      title={title}
                      style={{ backgroundColor: color, opacity: shadeOpacity(cell.tournaments ? cell.profit : 0, maxProfit) }}
                    />
                  )
                }}
              />
            </Card>

            <Card title={t('hourly.by_hour_title')}>
              <div className="flex items-center gap-px">
                {HOURS.map((hour) => {
                  const profit = data.by_hour[hour].profit
                  const heightPx = maxHourProfit > 0 ? (Math.abs(profit) / maxHourProfit) * BAR_MAX_PX : 0
                  return (
                    <div key={hour} className="flex flex-1 flex-col items-center justify-center gap-1" style={{ height: BAR_MAX_PX * 2 }} title={formatProfit(profit)}>
                      <div className="w-full" style={{ height: heightPx, backgroundColor: profit >= 0 ? PROFIT_COLOR : LOSS_COLOR, marginTop: profit >= 0 ? 'auto' : 0 }} />
                      <span className="text-[10px] text-gray-500">{hour % HOUR_LABEL_EVERY === 0 ? `${hour}h` : ''}</span>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card title={t('hourly.fish_title')}>
              <Grid
                render={(day, hour) => {
                  const cell = data.fish[day][hour]
                  const share = fishShare(cell)
                  const title =
                    share === null
                      ? t('hourly.cell_empty')
                      : t('hourly.cell_fish', { fish: cell.fish, opponents: cell.opponents, percent: Math.round(share) })
                  return (
                    <div
                      className="h-5 rounded-sm"
                      title={title}
                      style={{ backgroundColor: FISH_COLOR, opacity: share === null ? 0.08 : Math.max(MIN_FISH_OPACITY, share / 100) }}
                    />
                  )
                }}
              />
            </Card>
          </div>
        )}
      </LoadingOverlay>
    </div>
  )
}

/** A weekday x hour grid: one row per day, one column per hour, with labels on the hours. */
function Grid({ render }: { render: (day: number, hour: number) => ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] space-y-1">
        <div className="grid grid-cols-[48px_repeat(24,minmax(0,1fr))] gap-px text-[10px] text-gray-500">
          <span />
          {HOURS.map((hour) => (
            <span key={hour} className="text-center">{hour % HOUR_LABEL_EVERY === 0 ? `${hour}h` : ''}</span>
          ))}
        </div>
        {DAYS.map((day, index) => (
          <div key={day} className="grid grid-cols-[48px_repeat(24,minmax(0,1fr))] items-center gap-px">
            <span className="text-xs text-gray-400">{t(`hourly.days.${day}`)}</span>
            {HOURS.map((hour) => (
              <div key={hour}>{render(index, hour)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
