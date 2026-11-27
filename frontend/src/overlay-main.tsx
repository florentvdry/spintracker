import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import './index.css'
import { overlayService } from '@/services/overlayService'
import { STREAMER_STATS } from '@/stores/streamerStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** Dashboard-stats field each overlay stat reads from. */
const STAT_FIELD: Record<string, string> = {
  net_won: 'total_profit',
  cev: 'avg_chips_ev',
  games: 'total_tournaments',
  ev_profit: 'total_ev_profit',
  hands: 'total_hands',
}

const pad = (n: number) => n.toString().padStart(2, '0')

/** UTC date-time the backend expects (`YYYY-MM-DD HH:MM:SS`). */
function formatDateTime(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

function startOfMonthUtc(): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return formatDateTime(d)
}

function formatStatValue(id: string, value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (id === 'cev') return value.toFixed(2)
  if (id === 'games' || id === 'hands') return Math.round(value).toString()
  // net_won / ev_profit: euros, with a sign.
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)} \u20AC`
}

function Overlay() {
  const [settings, setSettings] = useState<Json | null>(null)
  const [stats, setStats] = useState<Json | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // Re-read the stored settings regularly so changes made in the main window apply live.
  React.useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null
    const run = async () => {
      const res = await overlayService.getStreamerSettings()
      if (cancelled) return
      if (!res.success) {
        setError((res as { success: boolean; message?: string }).message ?? 'Could not read the overlay settings')
        return
      }
      setError(null)
      setSettings(res.settings ?? null)
    }
    run()
    timer = setInterval(run, 5_000)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [])

  // Recompute the figures whenever the settings or the refresh timer ticks.
  React.useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      if (!settings) return
      let dateFrom: string | null = null
      let dateTo: string | null = null
      try {
        if (settings.range === 'session') {
          const session = await overlayService.latestSession()
          if (!session.success || !session.data?.[0]) {
            setStats(null)
            setError('No session found')
            return
          }
          dateFrom = session.data[0].session_date ?? null
          dateTo = session.data[0].session_end ?? null
        } else if (settings.range === 'month') {
          dateFrom = startOfMonthUtc()
        }
        const res = await overlayService.dashboardStats(dateFrom, dateTo)
        if (cancelled) return
        if (!res.success) {
          setError((res as { success: boolean; message?: string }).message ?? 'Could not read the statistics')
          return
        }
        setError(null)
        setStats(res.data ?? null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    void fetch()
    return () => {
      cancelled = true
    }
  }, [settings, tick])

  // Auto-refresh the figures at the configured interval.
  React.useEffect(() => {
    if (!settings) return
    const timer = setInterval(() => setTick((t) => t + 1), Number(settings.refreshMs) || 5_000)
    return () => clearInterval(timer)
  }, [settings])

  const enabledStats = settings ? STREAMER_STATS.filter((s) => settings.stats?.[s.id] === true) : []

  return (
    <div className="bg-dark-500 text-gray-100 p-6 h-screen overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Streamer Overlay</h1>
          <p className="text-xs text-gray-400">SpinTracker &mdash; shown by OBS</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          {error ? <span className="text-profit-negative">{error}</span> : <span>Live</span>}
        </div>
      </div>

      {error && !stats && (
        <div className="rounded-lg bg-dark-600 p-4 text-sm text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {enabledStats.map((stat) => {
          const raw = stats?.[STAT_FIELD[stat.id]]
          return (
            <div key={stat.id} className="rounded-lg bg-dark-600 border border-dark-400/50 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider">{stat.label}</p>
              <p className="text-3xl font-mono font-bold">{formatStatValue(stat.id, raw)}</p>
              <p className="text-xs text-gray-500">{stat.unit}</p>
            </div>
          )
        })}
        {enabledStats.length === 0 && (
          <div className="col-span-3 rounded-lg bg-dark-600 p-10 text-center text-gray-500 text-sm">
            No stats selected. Open Settings &gt; Streamer overlay to pick some.
          </div>
        )}
      </div>

      {stats && (
        <p className="mt-4 text-xs text-gray-500">
          Range: {settings?.range === 'session' ? 'Current session' : settings?.range === 'month' ? 'This month' : 'All time'}
        </p>
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>,
)
