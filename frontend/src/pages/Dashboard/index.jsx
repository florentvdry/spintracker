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
    loadDashboardStats, 
    loadSessions, 
    heroName,
    config,
    setDateRange
  } = useAppStore();

  useEffect(() => {
    loadDashboardStats();
    loadSessions(10);
  }, [config.dateRange]);

  if (isLoading && !dashboardStats) {
    return <LoadingPage />;
  }

  const stats = dashboardStats || {};
  const winRate = stats.total_hands > 0 
    ? ((stats.hands_won / stats.total_hands) * 100)
    : 0;

  const dateFilters = [
    { id: 'today', label: t('dashboard.filters.today') },
    { id: 'week', label: t('dashboard.filters.week') },
    { id: 'month', label: t('dashboard.filters.month') },
    { id: 'all', label: t('dashboard.filters.all') },
  ];

  const rangeLabel = config.dateRange !== 'all' 
    ? ` (${dateFilters.find(f => f.id === config.dateRange)?.label})` 
    : '';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('dashboard.title')}</h1>
          <p className="text-gray-400 mt-1">{t('dashboard.subtitle')}</p>
        </div>

        {/* Date Filters */}
        <div className="flex bg-[#1e2533] rounded-lg p-1">
          {dateFilters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setDateRange(filter.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                config.dateRange === filter.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('dashboard.total_profit') + rangeLabel}
          value={stats.total_profit || 0}
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
        <StatCard
          label={t('common.sessions') + rangeLabel}
          value={stats.total_sessions || 0}
          format="number"
          icon={Zap}
        />
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
