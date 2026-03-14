import { useEffect, useState, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { ipcService } from '@services/ipcService';
import { useFilterStore } from '@stores/filterStore';
import { LoadingSpinner } from '@components/ui';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import * as echarts from 'echarts';
import { BarChart2, GripHorizontal } from 'lucide-react';

const LINE_COLORS = {
  chipsWon: '#10b981',
  netExpected: '#eab308',
  wonWithShowdown: '#3b82f6',
  wonWithoutShowdown: '#ef4444'
};

const POSITIONS = [
  { value: 'all', label: 'All Positions' },
  { value: 'HU_SB', label: 'HU SB' },
  { value: 'HU_BB', label: 'HU BB' },
  { value: '3W_BTN', label: '3W BTN' },
  { value: '3W_SB', label: '3W SB' },
  { value: '3W_BB', label: '3W BB' }
];

export default function Charts() {
  const { t } = useTranslation();
  const chartRef = useRef(null);
  const [chartPosition, setChartPosition] = useState('all');
  const [stats, setStats] = useState(null);
  const [boxPosition, setBoxPosition] = useState({ x: 80, y: 280 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const LINE_LABELS = {
    chipsWon: t('common.chips_won', 'Chips Won'),
    netExpected: t('hand_history.table.ev_chips', 'EV Chips'),
    wonWithShowdown: t('common.showdown_winning', 'Showdown Won'),
    wonWithoutShowdown: t('common.non_showdown_winning', 'Non-Showdown Won')
  };

  const { heroName, buyIn, dateRange, customDateFrom, customDateTo, getDateRangeParams } = useFilterStore();
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);
  const [visibleLines, setVisibleLines] = useState({
    chipsWon: true,
    netExpected: true,
    wonWithShowdown: true,
    wonWithoutShowdown: true
  });

  const loadChartData = async () => {
    if (!heroName) {
      setData([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { dateFrom, dateTo } = getDateRangeParams();
      const buyInParam = buyIn === 'all' ? null : Number(buyIn);
      const positionParam = chartPosition === 'all' ? null : chartPosition;
      const result = await ipcService.getWinrateChartData({ 
        dateFrom, 
        dateTo, 
        heroName, 
        buyIn: buyInParam,
        position: positionParam
      });
      if (result && result.success && result.data) {
        const raw = result.data;
        
        if (Array.isArray(raw) && raw.length > 0) {
          const groupedData = new Map();
          
          raw.forEach(item => {
            const label = item.date || 'Unknown';
            if (!groupedData.has(label)) {
              groupedData.set(label, {
                label,
                lastProfit: 0,
                lastCumulative: 0,
                lastShowdown: 0,
                lastNoShowdown: 0
              });
            }
            const entry = groupedData.get(label);
            entry.lastProfit = item.profit ?? item.realWin ?? 0;
            entry.lastCumulative = item.cumulative ?? item.theoricalWin ?? 0;
            entry.lastShowdown = item.chips_won_showdown ?? item.chipsWonShowdown ?? 0;
            entry.lastNoShowdown = item.chips_won_no_showdown ?? item.chipsWonNoShowdown ?? 0;
          });
          
          const chartData = Array.from(groupedData.values()).map((item, index) => ({
            time: index + 1,
            label: item.label,
            chipsWon: item.lastProfit,
            netExpected: item.lastCumulative,
            wonWithShowdown: item.lastShowdown,
            wonWithoutShowdown: item.lastNoShowdown
          }));
          
          setData(chartData);
        } else {
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

  const loadStats = async () => {
    if (!heroName) {
      setStats(null);
      return;
    }

    try {
      const { dateFrom, dateTo } = getDateRangeParams();
      const buyInParam = buyIn === 'all' ? null : Number(buyIn);
      const positionParam = chartPosition === 'all' ? null : chartPosition;
      const result = await ipcService.getDashboardStats(heroName, dateFrom, dateTo, buyInParam, positionParam);
      if (result && result.success && result.data) {
        setStats(result.data);
      } else {
        setStats(null);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
      setStats(null);
    }
  };

  useEffect(() => {
    loadChartData();
    loadStats();
  }, [dateRange, customDateFrom, customDateTo, buyIn, heroName, chartPosition]);

  const toggleLine = (lineKey) => {
    setVisibleLines(prev => ({
      ...prev,
      [lineKey]: !prev[lineKey]
    }));
  };

  const getOption = useMemo(() => {
    if (!data.length) return {};

    const seriesList = [];
    
    if (visibleLines.chipsWon) {
        if (visibleLines.chipsWon) {
            seriesList.push({
                name: LINE_LABELS.chipsWon,
                type: 'line',
                data: data.map(d => d.chipsWon),
                itemStyle: { color: LINE_COLORS.chipsWon },
                showSymbol: false,
                lineStyle: { width: 2 },
                emphasis: { focus: 'series' },
                large: true,
            });
        }

        if (visibleLines.netExpected) {
            seriesList.push({
                name: LINE_LABELS.netExpected,
                type: 'line',
                data: data.map(d => d.netExpected),
                itemStyle: { color: LINE_COLORS.netExpected },
                showSymbol: false,
                lineStyle: { width: 2 },
                emphasis: { focus: 'series' },
                large: true,
            });
        }

        if (visibleLines.wonWithShowdown) {
            seriesList.push({
                name: LINE_LABELS.wonWithShowdown,
                type: 'line',
                data: data.map(d => d.wonWithShowdown),
                itemStyle: { color: LINE_COLORS.wonWithShowdown },
                showSymbol: false,
                lineStyle: { width: 2 },
                emphasis: { focus: 'series' },
                large: true,
            });
        }

        if (visibleLines.wonWithoutShowdown) {
            seriesList.push({
                name: LINE_LABELS.wonWithoutShowdown,
                type: 'line',
                data: data.map(d => d.wonWithoutShowdown),
                itemStyle: { color: LINE_COLORS.wonWithoutShowdown },
                showSymbol: false,
                lineStyle: { width: 2 },
                emphasis: { focus: 'series' },
                large: true,
            });
        }
    }

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        textStyle: { color: '#9ca3af' },
        formatter: function (params) {
            let result = `<div class="font-mono text-xs text-gray-300 mb-1">${params[0].axisValueLabel}</div>`;
            params.forEach(item => {
                const color = item.color;
                const value = item.value;
                const name = item.seriesName;
                const sign = value >= 0 ? '+' : '';
                const formattedValue = `${sign}${Math.round(value)}`;
                
                result += `<div class="flex items-center justify-between gap-4 text-xs">
                    <span style="color:${color}">● ${name}</span>
                    <span class="font-mono text-white font-medium">${formattedValue}</span>
                </div>`;
            });
            return result;
        },
        axisPointer: { type: 'cross', label: { backgroundColor: '#374151' } }
      },
      brush: {
        xAxisIndex: 0,
        brushLink: 'all',
        outOfBrush: {
            colorAlpha: 0.1
        },
        brushStyle: {
            borderWidth: 1,
            color: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'rgba(16, 185, 129, 0.5)'
        }
      },
      toolbox: {
        show: false
      },
      dataZoom: [
        {
            type: 'slider',
            show: false,
            xAxisIndex: 0
        },
        {
            type: 'inside',
            xAxisIndex: 0,
            disabled: true
        }
      ],
      grid: {
        top: 30,
        right: 30,
        bottom: 30,
        left: 60,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: data.map(d => d.label),
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#4b5563' } },
        axisLabel: { color: '#9ca3af', showMaxLabel: true },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { 
            color: '#9ca3af',
            formatter: (value) => value
        },
        splitLine: { 
            show: true, 
            lineStyle: { color: '#2d3548' }
        }
      },
      series: seriesList
    };
  }, [data, visibleLines, LINE_LABELS]);

  const onChartReady = (chart) => {
    chart.dispatchAction({
        type: 'takeGlobalCursor',
        key: 'brush',
        brushOption: {
            brushType: 'lineX',
            brushMode: 'single'
        }
    });
  };

  useEffect(() => {
    if (!isLoading && chartRef.current && !isZoomed) {
         const chart = chartRef.current.getEchartsInstance();
         chart.dispatchAction({
            type: 'takeGlobalCursor',
            key: 'brush',
            brushOption: {
                brushType: 'lineX',
                brushMode: 'single'
            }
        });
    }
  }, [isZoomed, isLoading]);

  const finalStats = useMemo(() => {
    if (!stats) return null;
    const totalGames = stats.total_tournaments || 1;
    return {
      cev: stats.avg_chips_ev || 0,
      chipsWon: stats.total_ev || 0,
      showdown: 0,
      nonShowdown: 0
    };
  }, [stats]);

  if (!heroName) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <BarChart2 className="w-16 h-16 mb-4" />
        <p className="text-lg">{t('dashboard.no_hero')}</p>
        <p className="text-sm">{t('dashboard.select_hero_prompt')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <BarChart2 className="w-16 h-16 mb-4" />
        <p className="text-lg">{t('dashboard.no_data')}</p>
        <p className="text-sm">{t('dashboard.no_data_chart')}</p>
      </div>
    );
  }

  const handleChartEvents = {
    'brushEnd': (params) => {
        if (params.areas && params.areas.length > 0) {
            const area = params.areas[0];
            const coordRange = area.coordRange;
            
            if (coordRange && chartRef.current) {
                const chart = chartRef.current.getEchartsInstance();
                chart.dispatchAction({
                    type: 'dataZoom',
                    startValue: coordRange[0],
                    endValue: coordRange[1]
                });
                chart.dispatchAction({
                    type: 'brush',
                    areas: []
                });
                setIsZoomed(true);
            }
        }
    },
    'restore': () => {
        setIsZoomed(false);
    }
  };

  const PositionStat = ({ label, value, isSelected }) => {
    const displayValue = value || 0;
    return (
      <div className="flex justify-between items-center text-xs">
        <span className={isSelected ? 'text-primary-400 font-medium' : 'text-gray-500'}>{label}</span>
        <span className={`font-mono font-medium ${displayValue >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {displayValue > 0 ? '+' : ''}{displayValue}
        </span>
      </div>
    );
  };

  const handleResetZoom = () => {
    if (chartRef.current) {
        chartRef.current.getEchartsInstance().dispatchAction({
            type: 'restore'
        });
    }
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const container = document.getElementById('chart-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragOffset.x;
    const newY = e.clientY - rect.top - dragOffset.y;
    setBoxPosition({
      x: Math.max(0, Math.min(newX, rect.width - 250)),
      y: Math.max(0, Math.min(newY, rect.height - 150))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="h-[calc(100vh-180px)] flex flex-col" onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('charts.title', 'Charts')}</h1>
          <p className="text-gray-400 mt-1">{t('charts.subtitle', 'Full screen winrate visualization')}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={chartPosition}
            onChange={(e) => setChartPosition(e.target.value)}
            className="bg-[#1e2533] text-white px-4 py-2 rounded-lg border border-[#374151] focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          >
            {POSITIONS.map(pos => (
              <option key={pos.value} value={pos.value}>
                {t(`charts.positions.${pos.value}`, pos.label)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {Object.entries(LINE_COLORS).map(([key, color]) => (
             <button
               key={key}
               onClick={() => toggleLine(key)}
               className={clsx(
                   'flex items-center gap-1.5 text-xs transition-opacity',
                   !visibleLines[key] && 'opacity-40'
               )}
           >
               <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
               <span className="text-gray-300">
                   {LINE_LABELS[key]}
               </span>
           </button>
        ))}
      </div>

      <div 
        id="chart-container"
        className="flex-1 w-full relative min-h-0" 
        onContextMenu={(e) => {
            e.preventDefault();
            handleResetZoom();
        }}
      >
        <ReactECharts 
            ref={chartRef}
            echarts={echarts}
            option={getOption} 
            style={{ height: '100%', width: '100%' }}
            notMerge={true}
            lazyUpdate={true}
            autoResize={true}
            theme={"dark"}
            onEvents={handleChartEvents}
            onChartReady={onChartReady}
        />
        
          {finalStats && (
            <div 
              className="absolute bg-[#1e2533]/95 backdrop-blur-sm border border-[#374151] rounded-lg p-3 shadow-xl select-none"
              style={{ 
                left: boxPosition.x, 
                top: boxPosition.y,
                cursor: isDragging ? 'grabbing' : 'grab',
                minWidth: '200px'
              }}
              onMouseDown={handleMouseDown}
            >
              <div className="flex items-center justify-between mb-2 border-b border-[#374151] pb-2">
                <span className="text-xs font-medium text-gray-400 uppercase">Stats</span>
                <GripHorizontal className="w-4 h-4 text-gray-500" />
              </div>
              
                <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Tournaments</span>
                  <span className="text-sm font-mono font-medium text-white">
                    {stats?.total_tournaments || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Total</span>
                  <span className="text-sm font-mono font-medium text-white">
                    {stats?.total_hands || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">CEV</span>
                  <span className={clsx('text-sm font-mono font-medium', finalStats.cev >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {finalStats.cev >= 0 ? '+' : ''}{finalStats.cev.toFixed(2)}
                  </span>
                </div>
                
                {stats && stats.cev_by_position && (
                  <div className="mt-3 pt-2 border-t border-[#374151]">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <div>
                        <p className="text-[9px] text-gray-500">Heads-Up</p>
                        {(() => {
                          const totalTournaments = stats.total_tournaments || 1;
                          const getCevValue = (positionKey) => {
                            const value = stats.cev_by_position?.[positionKey] || 0;
                            if (chartPosition === 'all') {
                              return (value / totalTournaments).toFixed(2);
                            }
                            return chartPosition === positionKey ? (value / totalTournaments).toFixed(2) : '0.00';
                          };
                          return (
                            <>
                              <PositionStat label="SB" value={getCevValue('HU_SB')} isSelected={chartPosition === 'HU_SB'} />
                              <PositionStat label="BB" value={getCevValue('HU_BB')} isSelected={chartPosition === 'HU_BB'} />
                            </>
                          );
                        })()}
                      </div>
                      <div>
                        <p className="text-[9px] text-gray-500">3-Way</p>
                        {(() => {
                          const totalTournaments = stats.total_tournaments || 1;
                          const getCevValue = (positionKey) => {
                            const value = stats.cev_by_position?.[positionKey] || 0;
                            if (chartPosition === 'all') {
                              return (value / totalTournaments).toFixed(2);
                            }
                            return chartPosition === positionKey ? (value / totalTournaments).toFixed(2) : '0.00';
                          };
                          return (
                            <>
                              <PositionStat label="BTN" value={getCevValue('3W_BTN')} isSelected={chartPosition === '3W_BTN'} />
                              <PositionStat label="SB" value={getCevValue('3W_SB')} isSelected={chartPosition === '3W_SB'} />
                              <PositionStat label="BB" value={getCevValue('3W_BB')} isSelected={chartPosition === '3W_BB'} />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

