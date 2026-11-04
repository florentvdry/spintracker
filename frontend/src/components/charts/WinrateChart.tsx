import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useBrushChart } from '@/hooks/useBrushChart'
import { ipcService, type Json } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import { logError } from '@/utils/log'

type ChartMode = 'chips' | 'euro'
type LineKey = 'chipsWon' | 'netExpected' | 'wonWithShowdown' | 'wonWithoutShowdown' | 'euroProfit'

interface Point {
  label: string
  chipsWon: number
  netExpected: number
  wonWithShowdown: number
  wonWithoutShowdown: number
  euroProfit: number
}

const LINE_COLORS: Record<LineKey, string> = {
  chipsWon: '#34c27a',
  netExpected: '#eab308',
  wonWithShowdown: '#3b82f6',
  wonWithoutShowdown: '#e5594f',
  euroProfit: '#34c27a',
}
const CHIP_LINES: LineKey[] = ['chipsWon', 'netExpected', 'wonWithShowdown', 'wonWithoutShowdown']
const CHART_HEIGHT = 500

function toPoints(raw: Json): Point[] {
  if (Array.isArray(raw)) {
    return raw.map((item, index) => ({
      label: item.date || `#${index + 1}`,
      chipsWon: item.profit ?? item.realWin ?? 0,
      netExpected: item.cumulative ?? item.theoricalWin ?? 0,
      wonWithShowdown: item.chips_won_showdown ?? item.chipsWonShowdown ?? 0,
      wonWithoutShowdown: item.chips_won_no_showdown ?? item.chipsWonNoShowdown ?? 0,
      euroProfit: item.euroProfit ?? item.euro_profit ?? 0,
    }))
  }
  if (raw?.labels && Array.isArray(raw.labels)) {
    const { labels, realWin, theoricalWin, wonWithShowdown, wonWithoutShowdown, euroProfit } = raw
    return labels.map((label: string, i: number) => ({
      label,
      chipsWon: realWin?.[i] || 0,
      netExpected: theoricalWin?.[i] || 0,
      wonWithShowdown: wonWithShowdown?.[i] || 0,
      wonWithoutShowdown: wonWithoutShowdown?.[i] || 0,
      euroProfit: euroProfit?.[i] || 0,
    }))
  }
  return []
}

export default function WinrateChart() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const buyIn = useFilterStore((s) => s.buyIn)
  const dateRange = useFilterStore((s) => s.dateRange)
  const lastUpdate = useAppStore((s) => s.lastUpdate)

  const containerRef = useRef<HTMLDivElement>(null)
  const [chartMode, setChartMode] = useState<ChartMode>('chips')
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<Point[]>([])
  const [visible, setVisible] = useState<Record<LineKey, boolean>>({
    chipsWon: true, netExpected: true, wonWithShowdown: true, wonWithoutShowdown: true, euroProfit: true,
  })

  const labels: Record<LineKey, string> = useMemo(
    () => ({
      chipsWon: t('common.chips_won', 'Chips Won'),
      netExpected: t('hand_history.table.ev_chips', 'EV Chips'),
      wonWithShowdown: t('common.showdown_winning', 'Showdown Won'),
      wonWithoutShowdown: t('common.non_showdown_winning', 'Non-Showdown Won'),
      euroProfit: t('dashboard.net_profit', 'Net Profit (€)'),
    }),
    [t],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!heroName) {
        setData([])
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      try {
        const { dateFrom, dateTo } = currentDateRange()
        const result = await ipcService.getWinrateChartData({ dateFrom, dateTo, heroName, buyIn: buyInParam(buyIn) })
        if (!cancelled) setData(result?.success && result.data ? toPoints(result.data) : [])
      } catch (error) {
        logError('Failed to load chart data:', error)
        if (!cancelled) setData([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [heroName, buyIn, dateRange, lastUpdate])

  const option = useMemo((): echarts.EChartsOption => {
    const keys: LineKey[] = chartMode === 'chips' ? CHIP_LINES : ['euroProfit']
    const series = keys
      .filter((key) => visible[key])
      .map((key) => ({
        name: labels[key],
        type: 'line' as const,
        data: data.map((d) => d[key]),
        itemStyle: { color: LINE_COLORS[key] },
        showSymbol: false,
        lineStyle: { width: chartMode === 'euro' ? 3 : 2 },
        emphasis: { focus: 'series' as const },
        large: true,
        ...(chartMode === 'euro' && {
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0)' },
            ]),
          },
        }),
      }))

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        textStyle: { color: '#9ca3af' },
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params]
          let html = `<div class="font-mono text-xs text-gray-300 mb-1">${(items[0] as unknown as { axisValueLabel: string }).axisValueLabel}</div>`
          for (const item of items) {
            const value = Number(item.value)
            const sign = value >= 0 ? '+' : ''
            const text = chartMode === 'euro' ? `${sign}${value.toFixed(2)}€` : `${sign}${Math.round(value)}`
            html += `<div class="flex items-center justify-between gap-4 text-xs">
              <span style="color:${item.color}">● ${item.seriesName}</span>
              <span class="font-mono text-white font-medium">${text}</span>
            </div>`
          }
          return html
        },
        axisPointer: { type: 'cross', label: { backgroundColor: '#374151' } },
      },
      brush: {
        xAxisIndex: 0,
        brushLink: 'all',
        outOfBrush: { colorAlpha: 0.1 },
        brushStyle: { borderWidth: 1, color: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.5)' },
      },
      toolbox: { show: false },
      dataZoom: [
        { type: 'slider', show: false, xAxisIndex: 0 },
        { type: 'inside', xAxisIndex: 0, disabled: true },
      ],
      grid: { top: 30, right: 10, bottom: 20, left: 50, containLabel: true },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.label),
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#4b5563' } },
        axisLabel: { color: '#9ca3af', showMaxLabel: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#9ca3af', formatter: (value: number) => (chartMode === 'euro' ? `${value}€` : String(value)) },
        splitLine: { show: true, lineStyle: { color: '#242936' } },
      },
      series,
    }
  }, [chartMode, data, labels, visible])

  const hasData = !isLoading && data.length > 0
  useBrushChart(containerRef, hasData, option)

  const toggleLine = (key: LineKey) => setVisible((v) => ({ ...v, [key]: !v[key] }))
  const legendKeys: LineKey[] = chartMode === 'chips' ? CHIP_LINES : ['euroProfit']
  const modeButton = (mode: ChartMode, label: string) => (
    <button
      onClick={() => setChartMode(mode)}
      className={clsx('px-4 py-1.5 text-xs font-medium rounded-md transition-all', chartMode === mode ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white')}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex bg-dark-400 p-1 rounded-lg">
          {modeButton('chips', 'CEV (Chips)')}
          {modeButton('euro', 'Euros (€)')}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {legendKeys.map((key) => (
            <button key={key} onClick={() => toggleLine(key)} className={clsx('flex items-center gap-1.5 text-xs transition-opacity', !visible[key] && 'opacity-40')}>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS[key] }} />
              <span className="text-gray-300">{labels[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center" style={{ height: CHART_HEIGHT }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      )}
      {!isLoading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center text-gray-400" style={{ height: CHART_HEIGHT }}>
          <p className="mb-2">{t('dashboard.no_data_chart')}</p>
        </div>
      )}
      {hasData && <div ref={containerRef} className="w-full" style={{ height: CHART_HEIGHT }} />}
    </div>
  )
}
