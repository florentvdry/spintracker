import React from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, TrendingUp, DollarSign, PieChart } from 'lucide-react';
import StatCard from '@components/ui/StatCard';
import NextActions from './NextActions';

export default function AnalysisDashboard({ data, loading }) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Key Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Hands"
          value={data.TotalHands}
          format="number"
          icon={Activity}
        />
        <StatCard
          label="Net Profit"
          value={data.TotalProfit}
          format="profit"
          icon={DollarSign}
        />
        <StatCard
          label="VPIP / PFR"
          value={`${data.Vpip?.toFixed(1)} / ${data.Pfr?.toFixed(1)}`}
          icon={PieChart}
          format="default"
        />
        <StatCard
          label="Aggression Freq"
          value={data.AggressionFreq}
          format="percent"
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart - Takes 2 cols */}
        <div className="lg:col-span-2 card h-[400px] flex flex-col">
          <h3 className="font-semibold mb-4">{t('analysis.profit_graph', 'Profit Graph')}</h3>
          <div className="flex-1 -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.GraphData}>
                <defs>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis 
                  dataKey="Date" 
                  stroke="#9ca3af" 
                  tickFormatter={(str) => {
                      if (!str) return '';
                      const d = new Date(str);
                      return `${d.getDate()}/${d.getMonth()+1}`;
                  }}
                  fontSize={12}
                />
                <YAxis stroke="#9ca3af" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                  formatter={(value) => [`${value.toFixed(2)}€`, 'Profit']}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Area 
                  type="monotone" 
                  dataKey="CumulativeProfit" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorProfit)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Next Actions - Takes 1 col */}
        <div className="lg:col-span-1 h-[400px]">
          <NextActions stats={data} />
        </div>
      </div>

      {/* Secondary Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <div className="card p-4">
            <div className="text-gray-400 text-xs uppercase mb-1">3-Bet</div>
            <div className="text-xl font-bold">{data.ThreeBet?.toFixed(1)}%</div>
         </div>
         <div className="card p-4">
            <div className="text-gray-400 text-xs uppercase mb-1">WTSD</div>
            <div className="text-xl font-bold">{data.Wtsd?.toFixed(1)}%</div>
         </div>
         <div className="card p-4">
            <div className="text-gray-400 text-xs uppercase mb-1">W$SD</div>
            <div className="text-xl font-bold">{data.Wsd?.toFixed(1)}%</div>
         </div>
         <div className="card p-4">
            <div className="text-gray-400 text-xs uppercase mb-1">Won Hands</div>
            <div className="text-xl font-bold">{data.WonHands} <span className="text-gray-500 text-sm font-normal">({((data.WonHands/data.TotalHands)*100 || 0).toFixed(1)}%)</span></div>
         </div>
      </div>
    </div>
  );
}
