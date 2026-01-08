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
  const { isLoading, dashboardStats, sessions, loadDashboardStats, loadSessions, heroName } = useAppStore();

  useEffect(() => {
    loadDashboardStats();
    loadSessions(10);
  }, []);

  if (isLoading && !dashboardStats) {
    return <LoadingPage />;
  }

  const stats = dashboardStats || {};
  const winRate = stats.total_hands > 0 
    ? ((stats.hands_won / stats.total_hands) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{t('dashboard.title')}</h1>
        <p className="text-gray-400 mt-1">{t('dashboard.subtitle')}</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('dashboard.total_profit')}
          value={stats.total_profit || 0}
          format="profit"
          icon={DollarSign}
        />
        <StatCard
          label={t('dashboard.played_hands')}
          value={stats.total_hands || 0}
          format="number"
          icon={Hash}
        />
        <StatCard
          label={t('dashboard.win_rate')}
          value={winRate}
          format="percent"
          icon={Trophy}
        />
        <StatCard
          label={t('dashboard.sessions_month')}
          value={stats.sessions_this_month || 0}
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
