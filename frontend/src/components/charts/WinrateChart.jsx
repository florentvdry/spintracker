import { useEffect, useState } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import { ipcService } from '@services/ipcService';
import { LoadingSpinner } from '@components/ui';
import clsx from 'clsx';

// Couleurs des lignes (PT4 style)
const LINE_COLORS = {
  chipsWon: '#10b981',        // Vert - Chips Won
  netExpected: '#eab308',     // Jaune - Net Expected Chips Won
  wonWithShowdown: '#3b82f6', // Bleu - Won With Showdown
  wonWithoutShowdown: '#ef4444' // Rouge - Won Without Showdown
};

export default function WinrateChart({ className }) {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [visibleLines, setVisibleLines] = useState({
    chipsWon: true,
    netExpected: true,
    wonWithShowdown: true,
    wonWithoutShowdown: true
  });

  useEffect(() => {
    loadChartData();
  }, [period]);

  const loadChartData = async () => {
    setIsLoading(true);
    try {
      const result = await ipcService.getWinrateChartData({ period });
      if (result && result.success && result.data) {
        const raw = result.data;

        // Supporter deux formats renvoyés par le backend :
        // - Ancien format : { labels: [], realWin: [], theoricalWin: [], wonWithShowdown: [], wonWithoutShowdown: [] }
        // - Nouveau format : [{ date, profit, cumulative, ... }, ...]
        if (Array.isArray(raw)) {
          const chartData = raw.map((item, index) => ({
            hand: item.date || `#${index + 1}`,
            chipsWon: item.profit ?? item.realWin ?? 0,
            netExpected: item.cumulative ?? item.theoricalWin ?? 0,
            wonWithShowdown: item.chips_won_showdown ?? item.chipsWonShowdown ?? 0,
            wonWithoutShowdown: item.chips_won_no_showdown ?? item.chipsWonNoShowdown ?? 0
          }));
          setData(chartData);
        } else if (raw.labels && Array.isArray(raw.labels)) {
          const { labels, realWin, theoricalWin, wonWithShowdown, wonWithoutShowdown } = raw;
          const chartData = labels.map((label, index) => ({
            hand: label,
            chipsWon: (realWin && realWin[index]) || 0,
            netExpected: (theoricalWin && theoricalWin[index]) || 0,
            wonWithShowdown: (wonWithShowdown && wonWithShowdown[index]) || 0,
            wonWithoutShowdown: (wonWithoutShowdown && wonWithoutShowdown[index]) || 0
          }));
          setData(chartData);
        } else {
          console.warn('WinrateChart: unexpected data format', raw);
          setData([]);
        }
      } else {
        setData([]);
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleLine = (lineKey) => {
    setVisibleLines(prev => ({
      ...prev,
      [lineKey]: !prev[lineKey]
    }));
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    
    return (
      <div className="bg-dark-400 border border-dark-100 rounded-lg p-3 shadow-xl">
        <p className="text-xs text-gray-400 mb-2">Main #{label}</p>
        {payload.map((entry, index) => (
          <p 
            key={index}
            className="text-sm font-medium"
            style={{ color: entry.color }}
          >
            {entry.name}: {entry.value >= 0 ? '+' : ''}{Math.round(entry.value)} chips
          </p>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={clsx('flex items-center justify-center h-64', className)}>
        <LoadingSpinner />
      </div>
    );
  }

  const legendItems = [
    { key: 'chipsWon', label: 'Chips Won', color: LINE_COLORS.chipsWon },
    { key: 'netExpected', label: 'Net Expected Chips Won', color: LINE_COLORS.netExpected },
    { key: 'wonWithShowdown', label: 'Won With Showdown', color: LINE_COLORS.wonWithShowdown },
    { key: 'wonWithoutShowdown', label: 'Won Without Showdown', color: LINE_COLORS.wonWithoutShowdown }
  ];

  return (
    <div className={className}>
      {/* Period selector */}
      <div className="flex gap-2 mb-4">
        {['7d', '30d', '90d', 'all'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={clsx(
              'px-3 py-1 text-sm rounded-lg transition-colors',
              period === p 
                ? 'bg-primary-500/20 text-primary-400' 
                : 'text-gray-400 hover:bg-dark-200'
            )}
          >
            {p === 'all' ? 'Tout' : p}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3548" />
            <XAxis 
              dataKey="hand" 
              stroke="#6b7280"
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis 
              stroke="#6b7280"
              tick={{ fontSize: 11 }}
              tickLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" />
            
            {/* Chips Won - Vert */}
            {visibleLines.chipsWon && (
              <Line 
                type="monotone" 
                dataKey="chipsWon" 
                name="Chips Won"
                stroke={LINE_COLORS.chipsWon}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: LINE_COLORS.chipsWon }}
              />
            )}
            
            {/* Net Expected Chips Won - Jaune */}
            {visibleLines.netExpected && (
              <Line 
                type="monotone" 
                dataKey="netExpected" 
                name="Net Expected Chips Won"
                stroke={LINE_COLORS.netExpected}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: LINE_COLORS.netExpected }}
              />
            )}
            
            {/* Won With Showdown - Bleu */}
            {visibleLines.wonWithShowdown && (
              <Line 
                type="monotone" 
                dataKey="wonWithShowdown" 
                name="Won With Showdown"
                stroke={LINE_COLORS.wonWithShowdown}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: LINE_COLORS.wonWithShowdown }}
              />
            )}
            
            {/* Won Without Showdown - Rouge */}
            {visibleLines.wonWithoutShowdown && (
              <Line 
                type="monotone" 
                dataKey="wonWithoutShowdown" 
                name="Won Without Showdown"
                stroke={LINE_COLORS.wonWithoutShowdown}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: LINE_COLORS.wonWithoutShowdown }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interactive Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
        {legendItems.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => toggleLine(key)}
            className={clsx(
              'flex items-center gap-2 px-2 py-1 rounded transition-opacity',
              visibleLines[key] ? 'opacity-100' : 'opacity-40'
            )}
          >
            <div 
              className="w-4 h-1 rounded"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-gray-300">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
