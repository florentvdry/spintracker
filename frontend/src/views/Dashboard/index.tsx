import { DollarSign, Hash, Target, TrendingUp, Trophy, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import WinrateChart from '@/components/charts/WinrateChart'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import MultipliersCard from './components/MultipliersCard'
import SessionList from './components/SessionList'

interface CevRow {
  key: string
  label: string
  cev: { formatted: string; isPositive: boolean }
  sub?: boolean
}

export default function Dashboard() {
  const { t } = useTranslation()
  const stats = useAppStore((s) => s.dashboardStats) ?? {}
  const sessions = useAppStore((s) => s.sessions)
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)

  const rangeLabel =
    dateRange === 'all' ? '' : ` (${dateRange === 'custom' ? t('common.date') : t(`dashboard.filters.${dateRange}`)})`

  const winRate = stats.total_tournaments > 0 ? (stats.tournaments_won / stats.total_tournaments) * 100 : 0

  const formatCev = (value: number | undefined) => {
    const cev = stats.total_tournaments > 0 ? ((value ?? 0) / stats.total_tournaments).toFixed(1) : '0'
    const numeric = parseFloat(cev)
    return { formatted: numeric > 0 ? `+${cev}` : cev, isPositive: numeric >= 0 }
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-dark-200 border border-dark-200 rounded-lg overflow-hidden">
        <StatCard label={t('dashboard.total_profit') + rangeLabel} value={stats.total_profit || 0} format="profit" icon={DollarSign} />
        <StatCard label={t('dashboard.win_rate') + rangeLabel} value={winRate} format="percent" icon={Trophy} />
        <StatCard label={t('common.tournaments')} value={stats.total_tournaments || 0} format="number" icon={Hash} />
        <StatCard label={t('dashboard.chips_ev_avg')} value={stats.avg_chips_ev || 0} format="number" icon={Target} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card title={t('dashboard.chip_evolution')} subtitle={t('dashboard.profit_ev')} className="xl:col-span-2">
          {heroName && stats.total_hands > 0 ? (
            <WinrateChart />
          ) : (
            <div className="flex flex-col items-center justify-center h-[420px] text-gray-500">
              <TrendingUp className="w-8 h-8 mb-3 opacity-50" />
              <p className="font-medium mb-1">{heroName ? t('dashboard.no_data') : t('dashboard.no_hero')}</p>
              <p className="text-xs">{heroName ? t('dashboard.no_data_chart') : t('dashboard.select_hero_prompt')}</p>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-3 min-w-0">
          <Card padding="none" className="!p-0 overflow-hidden">
            <div className="px-4 pt-4">
              <p className="section-label">{t('dashboard.cev_per_positions')}</p>
            </div>
            <table className="w-full mt-2 text-sm">
              <tbody>
                {positionGroups.map((group) => (
                  <GroupRows key={group.title} title={group.title} rows={group.rows} />
                ))}
              </tbody>
            </table>
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

function GroupRows({ title, rows }: { title: string; rows: CevRow[] }) {
  return (
    <>
      <tr className="bg-dark-300/50">
        <td colSpan={2} className="px-4 py-1 text-[11px] uppercase tracking-wider text-gray-500">{title}</td>
      </tr>
      {rows.map((row) => (
        <tr key={row.key} className="border-t border-dark-300">
          <td className={clsx('px-4 py-1.5', row.sub ? 'pl-8 text-gray-500 text-xs' : 'text-gray-300')}>{row.label}</td>
          <td className={clsx('px-4 py-1.5 text-right font-mono', row.cev.isPositive ? 'text-profit-positive' : 'text-profit-negative')}>
            {row.cev.formatted}
          </td>
        </tr>
      ))}
    </>
  )
}
