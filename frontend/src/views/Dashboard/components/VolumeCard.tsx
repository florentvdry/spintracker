import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import { ipcService } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { logError } from '@/utils/log'
import {
  DEFAULT_INACTIVITY_MINUTES,
  MAX_INACTIVITY_MINUTES,
  MIN_INACTIVITY_MINUTES,
  goalPercent,
  parseBounded,
  sessionStatus,
  type GoalPeriodKey,
  type VolumeSummary,
} from '@/utils/volume'

const GOAL_PERIODS: GoalPeriodKey[] = ['week', 'month']
const INACTIVITY_KEY = 'spintracker.sessionInactivityMinutes'

interface SessionRow {
  tournaments: number
  profit: number
  session_date: string
  session_end: string
}

function readInactivity(): number {
  try {
    return parseBounded(window.localStorage.getItem(INACTIVITY_KEY) ?? '', MIN_INACTIVITY_MINUTES, MAX_INACTIVITY_MINUTES) ?? DEFAULT_INACTIVITY_MINUTES
  } catch {
    // Storage can be blocked (private window): the default still applies for this session.
    return DEFAULT_INACTIVITY_MINUTES
  }
}

/** Volume of play (tournaments per hour, Spin duration), goals per week and month, and the latest session. */
export default function VolumeCard() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)
  const customDateFrom = useFilterStore((s) => s.customDateFrom)
  const customDateTo = useFilterStore((s) => s.customDateTo)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const buyIn = useFilterStore((s) => s.buyIn)
  const sessions = useAppStore((s) => s.sessions) as SessionRow[]

  const [summary, setSummary] = useState<VolumeSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [version, setVersion] = useState(0)
  const [inactivity, setInactivity] = useState(readInactivity)

  const onInactivityChange = (raw: string) => {
    const value = parseBounded(raw, MIN_INACTIVITY_MINUTES, MAX_INACTIVITY_MINUTES)
    if (value === null) return
    setInactivity(value)
    try {
      window.localStorage.setItem(INACTIVITY_KEY, String(value))
    } catch {
      // Same as above: the choice then lasts for this session only.
    }
  }

  useEffect(() => {
    if (!heroName) {
      setSummary(null)
      return
    }
    let active = true
    setLoading(true)
    const { dateFrom, dateTo } = currentDateRange()
    ipcService
      .getVolume({ heroName, dateFrom, dateTo, buyIn: buyInParam(buyIn) })
      .then((result) => {
        if (active) setSummary(result.success ? (result.data as VolumeSummary) : null)
      })
      .catch((error: unknown) => logError('volume fetch failed', error))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // The date range and session are read through currentDateRange() when the request is sent.
  }, [heroName, dateRange, customDateFrom, customDateTo, selectedSession, buyIn, version])

  if (!heroName) return null

  const latest = sessions[0]
  const latestStatus = latest ? sessionStatus(latest.session_end, new Date(), inactivity) : null

  return (
    <Card title={t('volume.title')} subtitle={t('volume.subtitle')}>
      <LoadingOverlay loading={loading}>
        {summary && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Figure label={t('volume.per_hour')} value={summary.volume.tournaments_per_hour.toFixed(1)} />
              <Figure label={t('volume.average_duration')} value={`${Math.round(summary.volume.average_duration_minutes)} min`} />
              <Figure label={t('volume.play_hours')} value={summary.volume.play_hours.toFixed(1)} />
            </div>

            <div className="space-y-2">
              {GOAL_PERIODS.map((period) => {
                const goal = summary.goals.find((g) => g.period === period)
                return (
                  <GoalRow
                    key={period}
                    label={t(`volume.goal_${period}`)}
                    done={goal?.done ?? 0}
                    target={goal?.target ?? 0}
                    onSaved={() => setVersion((v) => v + 1)}
                    period={period}
                  />
                )
              })}
            </div>

            <div className="rounded-lg border border-dark-200 bg-dark-300 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-[.06em] text-gray-500">{t('volume.last_session')}</div>
                <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  {t('volume.inactivity')}
                  <input
                    className="w-14 rounded bg-dark-400 px-1.5 py-0.5 text-right font-mono text-xs text-gray-100"
                    inputMode="numeric"
                    defaultValue={inactivity}
                    onChange={(event) => onInactivityChange(event.target.value)}
                  />
                </label>
              </div>
              {latest ? (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-300">
                  <span>
                    {formatDate(latest.session_date)} · {t('common.tournaments')} {latest.tournaments}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={clsx('font-mono', latest.profit >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>{formatCurrency(latest.profit)}</span>
                    <span className="text-xs text-gray-500">{t(`volume.session_${latestStatus}`)}</span>
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-gray-500">{t('volume.no_session')}</p>
              )}
            </div>
          </div>
        )}
      </LoadingOverlay>
    </Card>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-gray-100">{value}</div>
    </div>
  )
}

interface GoalRowProps {
  period: GoalPeriodKey
  label: string
  done: number
  target: number
  onSaved: () => void
}

function GoalRow({ period, label, done, target, onSaved }: GoalRowProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(target > 0 ? String(target) : '')
  const [failed, setFailed] = useState(false)
  const percent = goalPercent(done, target)

  const save = async () => {
    const value = draft.trim() === '' ? null : parseBounded(draft, 1, 100_000)
    if (draft.trim() !== '' && value === null) {
      setFailed(true)
      return
    }
    setFailed(false)
    try {
      const result = await ipcService.saveGoal(period, value)
      if (!result.success) setFailed(true)
      else onSaved()
    } catch (error: unknown) {
      logError('goal save failed', error)
      setFailed(true)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm text-gray-300">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-400">
            {done}
            {target > 0 ? ` / ${target}` : ''}
          </span>
          <input
            className="w-20 rounded bg-dark-300 px-2 py-0.5 text-right font-mono text-xs text-gray-100"
            inputMode="numeric"
            aria-label={`${label} ${t('volume.target')}`}
            placeholder={t('volume.no_target')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void save()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save()
            }}
          />
        </span>
      </div>
      {target > 0 && (
        <div className="mt-1 h-1.5 rounded bg-dark-300">
          <div className="h-1.5 rounded bg-primary-500" style={{ width: `${percent}%` }} />
        </div>
      )}
      {failed && <p className="mt-1 text-xs text-profit-negative">{t('volume.invalid_target')}</p>}
    </div>
  )
}
