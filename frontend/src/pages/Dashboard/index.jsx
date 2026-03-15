import { useEffect } from 'react';
import { 
  TrendingUp, 
  Hash, 
  Trophy, 
  DollarSign,
  Target,
  Zap
} from 'lucide-react';
import { useAppStore } from '@stores/appStore';
import { useFilterStore } from '@stores/filterStore';
import { StatCard, Card, EmptyState, LoadingPage } from '@components/ui';
import { WinrateChart } from '@components/charts';
import SessionList from './components/SessionList';
import { useTranslation } from 'react-i18next';

export default function Dashboard() {
  const { t } = useTranslation();
  const { 
    isLoading, 
    dashboardStats, 
    sessions,
    availableBuyIns
  } = useAppStore();

  const { heroName, dateRange } = useFilterStore();

  if (isLoading && !dashboardStats) {
    return <LoadingPage />;
  }

  const stats = dashboardStats || {};
  const winRate = stats.total_tournaments > 0 
    ? ((stats.tournaments_won / stats.total_tournaments) * 100)
    : 0;

  const rangeLabel = dateRange !== 'all' 
    ? ` (${dateRange === 'custom' ? t('common.date') : t(`dashboard.filters.${dateRange}`)})` 
    : '';

  const PositionCev = ({ label, value, count }) => {
    const cev = stats.total_tournaments > 0 ? (value / stats.total_tournaments).toFixed(1) : '0';
    const numCev = parseFloat(cev);
    return (
      <div className="flex justify-between items-center text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={`font-mono font-medium ${numCev >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {numCev > 0 ? '+' : ''}{cev}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('dashboard.title')}</h1>
          <p className="text-gray-400 mt-1">{t('dashboard.subtitle')}</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label={t('dashboard.total_profit') + rangeLabel}
          value={stats.total_profit || 0}
          format="profit"
          icon={DollarSign}
        />
        <StatCard
          label={t('dashboard.total_ev') + rangeLabel}
          value={stats.total_ev || 0}
          format="profit"
          icon={DollarSign}
        />
        <StatCard
          label={t('dashboard.activity') + rangeLabel}
          value={null}
          icon={Hash}
          subStats={[
            { label: t('common.tournaments'), value: stats.total_tournaments || 0, format: 'number' },
            { label: t('common.hands'), value: stats.total_hands || 0, format: 'number' },
            { label: t('dashboard.chips_ev_avg'), value: stats.avg_chips_ev || 0, format: 'number' }
          ]}
        />
        <StatCard
          label={t('dashboard.win_rate') + rangeLabel}
          value={winRate}
          format="percent"
          icon={Trophy}
        />
        <Card className="flex flex-col justify-center">
          <div className="flex items-start justify-between mb-2">
            <p className="stat-label">{t('dashboard.cev_per_positions')}</p>
            <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0 -mt-1">
              <Target className="w-5 h-5 text-primary-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">3-Way</p>
              <div className="space-y-1">
                <PositionCev label="BTN" value={stats.cev_by_position?.['3W_BTN']} count={stats.count_by_position?.['3W_BTN']} />
                <PositionCev label="SB" value={stats.cev_by_position?.['3W_SB']} count={stats.count_by_position?.['3W_SB']} />
                <PositionCev label="BB" value={stats.cev_by_position?.['3W_BB']} count={stats.count_by_position?.['3W_BB']} />
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Heads-Up</p>
              <div className="space-y-1">
                <PositionCev 
                  label="SB" 
                  value={(stats.cev_by_position?.['HU_BTN SB'] || 0) + (stats.cev_by_position?.['HU_SB'] || 0)} 
                  count={(stats.count_by_position?.['HU_BTN SB'] || 0) + (stats.count_by_position?.['HU_SB'] || 0)} 
                />
                <PositionCev 
                  label="BB" 
                  value={stats.cev_by_position?.['HU_BB']} 
                  count={stats.count_by_position?.['HU_BB']} 
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main chart */}
        <Card 
          title={t('dashboard.chip_evolution')} 
          subtitle={t('dashboard.profit_ev')}
          className="lg:col-span-2 h-full"
        >
          {heroName && stats.total_hands > 0 ? (
            <WinrateChart />
          ) : (
            <EmptyState
              icon={TrendingUp}
              title={!heroName ? t('dashboard.no_hero') : t('dashboard.no_data')}
              description={!heroName ? t('dashboard.select_hero_prompt') : t('dashboard.no_data_chart')}
            />
          )}
        </Card>

        {/* Recent sessions */}
        <Card 
          title={t('dashboard.recent_sessions')}
          subtitle={t('dashboard.latest_games')}
          className="h-full flex flex-col"
        >
          {heroName ? (
            <SessionList sessions={sessions} />
          ) : (
             <EmptyState
              icon={Zap}
              title={t('dashboard.no_sessions')}
              description={t('dashboard.select_hero_sessions')}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
