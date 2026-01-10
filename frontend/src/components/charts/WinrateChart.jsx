import { useEffect, useState, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { ipcService } from '@services/ipcService';
import { useAppStore } from '@stores/appStore';
import { LoadingSpinner } from '@components/ui';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import * as echarts from 'echarts';

// Couleurs des lignes (PT4 style)
const LINE_COLORS = {
  chipsWon: '#10b981',        // Vert - Chips Won
  netExpected: '#eab308',     // Jaune - Net Expected Chips Won
  wonWithShowdown: '#3b82f6', // Bleu - Won With Showdown
  wonWithoutShowdown: '#ef4444' // Rouge - Won Without Showdown
};

export default function WinrateChart({ className }) {
  const { t } = useTranslation();
  const chartRef = useRef(null);

  const LINE_LABELS = {
    chipsWon: t('common.chips_won', 'Chips Won'),
    netExpected: t('hand_history.table.ev_chips', 'EV Chips'),
    wonWithShowdown: t('common.showdown_winning', 'Showdown Won'),
    wonWithoutShowdown: t('common.non_showdown_winning', 'Non-Showdown Won')
  };
  const heroName = useAppStore(state => state.heroName);
  const lastUpdate = useAppStore(state => state.lastUpdate);
  const config = useAppStore(state => state.config);
  const _getDateRangeParams = useAppStore(state => state._getDateRangeParams);
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
      const { dateFrom, dateTo } = _getDateRangeParams();
      const result = await ipcService.getWinrateChartData({ dateFrom, dateTo, heroName });
      if (result && result.success && result.data) {
        const raw = result.data;
        let chartData = [];

        // Parsing logic
        if (Array.isArray(raw)) {
          chartData = raw.map((item, index) => ({
            time: index + 1, // Using index as time for performance
            label: item.date || `#${index + 1}`,
            chipsWon: item.profit ?? item.realWin ?? 0,
            netExpected: item.cumulative ?? item.theoricalWin ?? 0,
            wonWithShowdown: item.chips_won_showdown ?? item.chipsWonShowdown ?? 0,
            wonWithoutShowdown: item.chips_won_no_showdown ?? item.chipsWonNoShowdown ?? 0
          }));
        } else if (raw.labels && Array.isArray(raw.labels)) {
           const { labels, realWin, theoricalWin, wonWithShowdown, wonWithoutShowdown } = raw;
           chartData = labels.map((label, index) => ({
            time: index + 1,
            label: label,
            chipsWon: (realWin && realWin[index]) || 0,
            netExpected: (theoricalWin && theoricalWin[index]) || 0,
            wonWithShowdown: (wonWithShowdown && wonWithShowdown[index]) || 0,
            wonWithoutShowdown: (wonWithoutShowdown && wonWithoutShowdown[index]) || 0
          }));
        }
        setData(chartData);
      } else {
        setData([]);
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadChartData();
  }, [config.dateRange, heroName, lastUpdate]);

  // Suppression de l'effet takeGlobalCursor car il est capricieux et dépend de toolbox
  // On va utiliser brush pour un contrôle total
  /*
  useEffect(() => {
    if (!isLoading && data.length > 0 && chartRef.current) {
        const chart = chartRef.current.getEchartsInstance();
        chart.dispatchAction({
            type: 'takeGlobalCursor',
            key: 'dataZoomSelect',
            dataZoomSelectActive: true
        });
    }
  }, [isLoading, data]);
  */

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
        seriesList.push({
            name: LINE_LABELS.chipsWon,
            type: 'line',
            data: data.map(d => d.chipsWon),
            itemStyle: { color: LINE_COLORS.chipsWon },
            showSymbol: false,
            lineStyle: { width: 2 },
            emphasis: { focus: 'series' },
            large: true, // Optimisation pour grand nombre de points
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

    return {
      backgroundColor: 'transparent',
      animation: false, // Désactiver l'animation pour la performance
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
                result += `<div class="flex items-center justify-between gap-4 text-xs">
                    <span style="color:${color}">● ${name}</span>
                    <span class="font-mono text-white font-medium">${sign}${Math.round(value)}</span>
                </div>`;
            });
            return result;
        },
        axisPointer: { type: 'cross', label: { backgroundColor: '#374151' } }
      },
      // Brush permet de sélectionner une zone pour zoomer
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
        show: false,
        feature: {
            brush: {
                type: ['lineX']
            }
        }
      },
      // Configuration explicite de dataZoom pour gérer le zoom
      dataZoom: [
        {
            type: 'slider',
            show: false,
            xAxisIndex: 0
        },
        {
            type: 'inside',
            xAxisIndex: 0,
            disabled: true // On désactive le zoom molette/drag natif
        }
      ],
      // On retire toolbox car on gère tout custom ou via brush
      grid: {
        top: 30,
        right: 10,
        bottom: 20,
        left: 50,
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
        axisLabel: { color: '#9ca3af' },
        splitLine: { 
            show: true, 
            lineStyle: { color: '#2d3548' } // dark-200 equivalent
        }
      },
      // Pas de dataZoom 'inside' (molette désactivée)
      series: seriesList
    };
  }, [data, visibleLines]);

  // Fonction d'initialisation appelée quand le chart est prêt
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

  // On surveille le changement de zoom pour réappliquer le curseur si besoin
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

  if (isLoading) {
    return (
      <div className={clsx('flex items-center justify-center h-[500px]', className)}>
        <LoadingSpinner />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={clsx('flex flex-col items-center justify-center h-[500px] text-gray-400', className)}>
        <p className="mb-2">{t('dashboard.no_data_chart')}</p>
      </div>
    );
  }

  const handleChartEvents = {
    'brushEnd': (params) => {
        // Quand la sélection brush est terminée
        if (params.areas && params.areas.length > 0) {
            const area = params.areas[0];
            const coordRange = area.coordRange; // [startValue, endValue]
            
            if (coordRange && chartRef.current) {
                const chart = chartRef.current.getEchartsInstance();
                
                // Appliquer le zoom sur la zone sélectionnée
                chart.dispatchAction({
                    type: 'dataZoom',
                    startValue: coordRange[0],
                    endValue: coordRange[1]
                });
                
                // Nettoyer le brush pour qu'il ne reste pas affiché
                chart.dispatchAction({
                    type: 'brush',
                    areas: []
                });
                
                setIsZoomed(true);
            }
        }
    },
    // Réappliquer le mode brush après un restore ou autre interaction
    // On veut que l'outil lineX soit toujours actif
    'restore': () => {
        setIsZoomed(false);
        // Pas besoin de réactiver brushSelect car il est persistant si configuré via toolbox brush, 
        // mais ici on l'a mis en option globale.
        // On s'assure que le mode brush est actif par défaut au chargement via l'effet ci-dessous
    }
  };

  const handleResetZoom = () => {
    if (chartRef.current) {
        chartRef.current.getEchartsInstance().dispatchAction({
            type: 'restore'
        });
        // Le restore trigger l'event restore ci-dessus qui reset isZoomed et réactive le curseur
    }
  };

  return (
    <div className={className}>
      {/* Legend toggles */}
      <div className="flex flex-wrap items-center justify-end gap-4 mb-4">
        <div className="flex flex-wrap gap-3">
             {Object.entries(LINE_COLORS).map(([key, color]) => (
                 <button
                    key={key}
                    onClick={() => toggleLine(key)}
                    className={clsx(
                        'flex items-center gap-1.5 text-xs transition-opacity',
                        !visibleLines[key] && 'opacity-40'
                    )}
                 >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-gray-300">
                        {LINE_LABELS[key]}
                    </span>
                 </button>
             ))}
        </div>
      </div>

      {/* Chart Container */}
      <div 
        className="h-[500px] w-full relative" 
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
            notMerge={false}
            lazyUpdate={true}
            autoResize={true}
            theme={"dark"}
            onEvents={handleChartEvents}
            onChartReady={onChartReady}
        />
      </div>
    </div>
  );
}
