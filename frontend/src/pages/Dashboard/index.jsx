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

export default function Dashboard() {
  const { isLoading, dashboardStats, sessions, loadDashboardStats, loadSessions } = useAppStore();

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
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Vue d'ensemble de vos performances</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Profit Total"
          value={stats.total_profit || 0}
          format="profit"
          icon={DollarSign}
        />
        <StatCard
          label="Mains Jouées"
          value={stats.total_hands || 0}
          format="number"
          icon={Hash}
        />
        <StatCard
          label="Taux de Victoire"
          value={winRate}
          format="percent"
          icon={Trophy}
        />
        <StatCard
          label="Sessions ce mois"
          value={stats.sessions_this_month || 0}
          format="number"
          icon={Zap}
        />
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main chart */}
        <Card 
          title="Evolution des jetons" 
          subtitle="Profit et EV"
          className="lg:col-span-2"
        >
          {stats.total_hands > 0 ? (
            <WinrateChart />
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="Aucune donnée"
              description="Importez des mains pour voir votre courbe de gains"
            />
          )}
        </Card>

        {/* Recent sessions */}
        <Card 
          title="Sessions Récentes"
          subtitle="Dernières parties"
        >
          <SessionList sessions={sessions} />
        </Card>
      </div>
    </div>
  );
}
