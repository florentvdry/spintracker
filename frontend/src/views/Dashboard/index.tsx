import { TrendingUp, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import WinrateChart from '@/components/charts/WinrateChart'
import Card from '@/components/ui/Card'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { formatProfit } from '@/utils/formatters'
import MultipliersCard from './components/MultipliersCard'
import SessionList from './components/SessionList'

interface CevRow {
  key: string
  label: string
  cev: { formatted: string; isPositive: boolean; value: number }
  sub?: boolean
}

export default function Dashboard() {
  const { t } = useTranslation()
  const stats = useAppStore((s) => s.dashboardStats) ?? {}
  const sessions = useAppStore((s) => s.sessions)
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)
  const isLoading = useAppStore((s) => s.isLoading)

  const rangeLabel =
    dateRange === 'all' ? '' : ` (${dateRange === 'custom' ? t('common.date') : t(`dashboard.filters.${dateRange}`)})`

  const winRate = stats.total_tournaments > 0 ? (stats.tournaments_won / stats.total_tournaments) * 100 : 0

  const formatCev = (value: number | undefined) => {
    const cev = stats.total_tournaments > 0 ? ((value ?? 0) / stats.total_tournaments).toFixed(1) : '0'
    const numeric = parseFloat(cev)
    return { formatted: numeric > 0 ? `+${cev}` : cev, isPositive: numeric >= 0, value: numeric }
  }

  const byPosition = stats.cev_by_position ?? {}
  const c = (key: string) => formatCev(byPosition[key])
  const huSb = (byPosition['HU_BTN SB'] || 0) + (byPosition['HU_SB'] || 0)

  const positionGroups: { title: string; rows: CevRow[] }[] = [
    {
      title: '3-Way',
      rows: [
        { key: '3W_BTN', label: 'BTN', cev: c('3W_BTN') },
        { key: '3W_SB', label: 'SB', cev: c('3W_SB') },
        { key: '3W_SB_vs_BTN', label: 'vs BTN', cev: c('3W_SB_vs_BTN'), sub: true },
        { key: '3W_SB_vs_BB', label: 'vs BB', cev: c('3W_SB_vs_BB'), sub: true },
        { key: '3W_BB', label: 'BB', cev: c('3W_BB') },
        { key: '3W_BB_vs_BTN', label: 'vs BTN', cev: c('3W_BB_vs_BTN'), sub: true },
        { key: '3W_BB_vs_SB', label: 'vs SB', cev: c('3W_BB_vs_SB'), sub: true },
      ],
    },
    {
      title: 'Heads-Up',
      rows: [
        { key: 'HU_SB', label: 'SB', cev: formatCev(huSb) },
        { key: 'HU_BB', label: 'BB', cev: c('HU_BB') },
      ],
    },
  ]

  const totalProfit = stats.total_profit || 0
  const unpriced: number = stats.unpriced_tournaments || 0
  const maxAbsCev = Math.max(1, ...positionGroups.flatMap((g) => g.rows.map((r) => Math.abs(r.cev.value))))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{t('dashboard.title')}</h1>
        <p className="page-subtitle">{t('dashboard.subtitle')}</p>
        {isLoading && (
          <div role="status" className="mt-2 flex items-center gap-2 text-sm text-slate-400">
            <div className="spinner h-4 w-4" />
            {t('common.loading')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-stretch">
        <section className="hero-card flex flex-col min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="stat-label">{t('dashboard.total_profit') + rangeLabel}</div>
              <div className={clsx('mt-1 font-mono text-5xl font-semibold leading-[1.1]', totalProfit >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
                {formatProfit(totalProfit)}
              </div>
              {unpriced > 0 && <p className="mt-2 max-w-md text-xs text-gray-500">{t('dashboard.unpriced_note', { count: unpriced })}</p>}
            </div>
            <div className="flex gap-9">
              <HeroStat label={t('dashboard.win_rate') + rangeLabel} value={`${winRate.toFixed(2)} %`} />
              <HeroStat label={t('common.tournaments')} value={(stats.total_tournaments || 0).toLocaleString()} />
              <HeroStat
                label={t('dashboard.chips_ev_avg')}
                value={(stats.avg_chips_ev || 0).toLocaleString()}
                tone={(stats.avg_chips_ev || 0) >= 0 ? 'positive' : 'negative'}
              />
            </div>
          </div>

          <div className="mt-5">
            <h2 className="text-[15px] font-semibold text-gray-100">
              {t('dashboard.chip_evolution')} <span className="font-normal text-gray-500">· {t('dashboard.profit_ev')}</span>
            </h2>
          </div>
          <div className="mt-3 flex-1">
            {heroName && stats.total_hands > 0 ? (
              <WinrateChart />
            ) : (
              <div className="flex flex-col items-center justify-center h-[420px] text-gray-500">
                <TrendingUp className="w-8 h-8 mb-3 opacity-50" />
                <p className="font-medium mb-1">{heroName ? t('dashboard.no_data') : t('dashboard.no_hero')}</p>
                <p className="text-xs">{heroName ? t('dashboard.no_data_chart') : t('dashboard.select_hero_prompt')}</p>
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-4 min-w-0">
          <Card title={t('dashboard.cev_per_positions')}>
            {positionGroups.map((group) => (
              <div key={group.title}>
                <div className="mt-3 mb-0.5 text-[11px] uppercase tracking-[.06em] text-gray-500">{group.title}</div>
                {group.rows.map((row) => (
                  <CevBarRow key={row.key} row={row} maxAbs={maxAbsCev} />
                ))}
              </div>
            ))}
          </Card>

          <Card title={t('dashboard.recent_sessions')} subtitle={t('dashboard.latest_games')} className="flex-1 flex flex-col min-h-[240px]">
            {heroName ? (
              <SessionList sessions={sessions} />
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-gray-500 py-8">
                <Zap className="w-8 h-8 mb-3 opacity-50" />
                <p className="font-medium mb-1">{t('dashboard.no_sessions')}</p>
                <p className="text-xs">{t('dashboard.select_hero_sessions')}</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <MultipliersCard />
    </div>
  )
}

function HeroStat({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={clsx('mt-1 font-mono text-[22px] font-semibold', tone === 'positive' && 'text-profit-positive', tone === 'negative' && 'text-profit-negative', !tone && 'text-gray-100')}>
        {value}
      </div>
    </div>
  )
}

/** One position: a bar growing right (profit) or left (loss) from a centre line. */
function CevBarRow({ row, maxAbs }: { row: CevRow; maxAbs: number }) {
  const widthPercent = Math.min(50, (Math.abs(row.cev.value) / maxAbs) * 50)
  return (
    <div className={clsx('flex items-center gap-2.5 py-1', row.sub && 'pl-4')}>
      <span className={clsx('w-14', row.sub ? 'text-xs text-gray-500' : 'text-[13px] text-gray-100')}>{row.label}</span>
      <span className="relative h-2 flex-1 rounded bg-dark-300">
        <span
          className={clsx('absolute inset-y-0 rounded', row.cev.isPositive ? 'bg-profit-positive' : 'bg-profit-negative')}
          style={row.cev.isPositive ? { left: '50%', width: `${widthPercent}%` } : { right: '50%', width: `${widthPercent}%` }}
        />
        <span className="absolute -inset-y-[3px] left-1/2 w-px bg-dark-100" />
      </span>
      <span className={clsx('w-14 text-right font-mono text-xs font-medium', row.cev.isPositive ? 'text-profit-positive' : 'text-profit-negative')}>
        {row.cev.formatted}
      </span>
    </div>
  )
}
