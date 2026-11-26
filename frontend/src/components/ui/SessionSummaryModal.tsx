import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { ipcService, type Json } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { useSessionSummaryStore } from '@/stores/sessionSummaryStore'
import { formatProfit } from '@/utils/formatters'
import { logError } from '@/utils/log'
import { shouldShowSummary } from '@/utils/sessionSummary'

const CHECK_INTERVAL_MS = 30_000
const PERCENT = 100

interface Summary {
  stats: Json
  time: Json
  multipliers: Json[]
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={clsx('mt-1 font-mono text-lg font-semibold', tone === undefined ? 'text-gray-100' : tone >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>{value}</div>
    </div>
  )
}

/** Opens the summary of the last session once the player has been idle long enough. */
function useAutomaticSummary() {
  const sessions = useAppStore((s) => s.sessions)
  const { inactivityMinutes, lastShownStart, open } = useSessionSummaryStore()

  useEffect(() => {
    const check = () => {
      if (shouldShowSummary(sessions[0], Date.now(), inactivityMinutes, lastShownStart)) open(sessions[0], true)
    }
    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [sessions, inactivityMinutes, lastShownStart, open])
}

/** Summary of a session: result, EV, volume, multipliers and table softness. */
export default function SessionSummaryModal() {
  const { t } = useTranslation()
  useAutomaticSummary()
  const session = useSessionSummaryStore((s) => s.openSession)
  const close = useSessionSummaryStore((s) => s.close)
  const heroName = useFilterStore((s) => s.heroName)
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    if (!session || !heroName) return undefined
    let cancelled = false
    setSummary(null)
    const range = { heroName, dateFrom: session.session_date, dateTo: session.session_end ?? session.session_date }
    void (async () => {
      try {
        const [stats, time, multipliers] = await Promise.all([
          ipcService.getDashboardStats(heroName, range.dateFrom, range.dateTo, null),
          ipcService.getTimeStats(range),
          ipcService.getMultiplierStats(range),
        ])
        if (!cancelled && stats.success) setSummary({ stats: stats.data, time: time.data ?? {}, multipliers: multipliers.data ?? [] })
      } catch (error) {
        logError('Failed to load the session summary:', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session, heroName])

  if (!session) return null
  const stats = summary?.stats
  const tournaments: number = stats?.total_tournaments ?? 0
  const fishCells: Json[] = (summary?.time.cells ?? []).filter((c: Json) => c.fish_share !== null)
  const fishShare = fishCells.length > 0 ? fishCells.reduce((n: number, c: Json) => n + c.fish_share * c.tournaments, 0) / fishCells.reduce((n: number, c: Json) => n + c.tournaments, 0) : null
  const hits = (summary?.multipliers ?? []).filter((m) => m.winCount > 0).sort((a, b) => b.multiplier - a.multiplier)

  return (
    <Modal open title={t('session_summary.title')} onClose={close} width={560}>
      {!summary ? (
        <div className="spinner mx-auto my-8" />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-400">
            {session.session_date} → {session.session_end}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Figure label={t('common.tournaments')} value={String(tournaments)} />
            <Figure label={t('dashboard.total_profit')} value={formatProfit(stats.total_profit ?? 0)} tone={stats.total_profit ?? 0} />
            <Figure label={t('dashboard.ev_profit')} value={formatProfit(stats.total_ev_profit ?? 0)} tone={stats.total_ev_profit ?? 0} />
            <Figure label={t('dashboard.chips_ev_avg')} value={(stats.avg_chips_ev ?? 0).toFixed(1)} tone={stats.avg_chips_ev ?? 0} />
            <Figure label={t('dashboard.win_rate')} value={`${tournaments > 0 ? (((stats.tournaments_won ?? 0) / tournaments) * PERCENT).toFixed(1) : '0.0'} %`} />
            <Figure label={t('time_analysis.profit_per_hour')} value={formatProfit(summary.time.profit_per_hour ?? 0)} tone={summary.time.profit_per_hour ?? 0} />
            <Figure label={t('time_analysis.hours_played')} value={`${(summary.time.hours_played ?? 0).toFixed(1)} h`} />
            <Figure label={t('time_analysis.avg_duration')} value={`${(summary.time.avg_duration_minutes ?? 0).toFixed(1)} min`} />
            <Figure label={t('session_summary.fish_share')} value={fishShare === null ? '—' : `${(fishShare * PERCENT).toFixed(0)} %`} />
          </div>
          {hits.length > 0 && (
            <div>
              <div className="stat-label">{t('session_summary.multipliers_won')}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {hits.map((m) => (
                  <span key={m.multiplier} className="rounded-md bg-dark-300 px-2 py-0.5 font-mono text-xs text-gray-100">
                    x{m.multiplier} · {m.winCount}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
