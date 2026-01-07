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
          label="EV Total"
          value={stats.total_ev || 0}
          format="profit"
          icon={Target}
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

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Zap className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Sessions ce mois</p>
            <p className="text-xl font-bold text-white">{stats.sessions_this_month || 0}</p>
          </div>
        </Card>
        
        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Target className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Multiplier moyen</p>
            <p className="text-xl font-bold text-white">{(stats.avg_multiplier || 0).toFixed(1)}x</p>
          </div>
        </Card>
        
        <Card className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Trophy className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Meilleur gain</p>
            <p className="text-xl font-bold profit-positive">
              +{(stats.best_win || 0).toFixed(2)}€
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
