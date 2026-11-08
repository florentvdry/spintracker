import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { GripHorizontal } from 'lucide-react'
import { useBrushChart } from '@/hooks/useBrushChart'
import { ipcService, type Json } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import { logError } from '@/utils/log'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import PositionStat from './PositionStat'

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
  chipsWon: '#3fd49a',
  netExpected: '#eab308',
  wonWithShowdown: '#7aa7ff',
  wonWithoutShowdown: '#ff7a6b',
  euroProfit: '#3fd49a',
}
const CHIP_LINES: LineKey[] = ['chipsWon', 'netExpected', 'wonWithShowdown', 'wonWithoutShowdown']
const CHART_HEIGHT = 500
const POSITIONS = ['all', 'HU_SB', 'HU_BB', '3W_BTN', '3W_SB', '3W_BB'] as const
const STATS_BOX_MIN_WIDTH = 250
const STATS_BOX_MIN_HEIGHT = 150
const STATS_BOX_START = { x: 80, y: 280 }

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
  const customDateFrom = useFilterStore((s) => s.customDateFrom)
  const customDateTo = useFilterStore((s) => s.customDateTo)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const lastUpdate = useAppStore((s) => s.lastUpdate)
  const stats = useAppStore((s) => s.dashboardStats)

  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [position, setPosition] = useState<string>('all')
  const [dragging, setDragging] = useState(false)
  const [boxPosition, setBoxPosition] = useState(STATS_BOX_START)
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
        const result = await ipcService.getWinrateChartData({
          dateFrom, dateTo, heroName, buyIn: buyInParam(buyIn), position: position === 'all' ? null : position,
        })
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
  }, [heroName, buyIn, dateRange, customDateFrom, customDateTo, selectedSession, lastUpdate, position])

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
        backgroundColor: '#1b1f26',
        borderColor: '#262b34',
        textStyle: { color: '#a7aab3' },
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
        axisPointer: { type: 'cross', label: { backgroundColor: '#262b34' } },
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
        axisLine: { lineStyle: { color: '#3a4150' } },
        axisLabel: { color: '#a7aab3', showMaxLabel: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#a7aab3', formatter: (value: number) => (chartMode === 'euro' ? `${value}€` : String(value)) },
        splitLine: { show: true, lineStyle: { color: '#262b34' } },
      },
      series,
    }
  }, [chartMode, data, labels, visible])

  const hasData = !isLoading && data.length > 0
  useBrushChart(containerRef, hasData, option)

  // Drag handling for the floating stats box.
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const rect = frameRef.current?.getBoundingClientRect()
      if (!rect) return
      setBoxPosition({
        x: Math.max(0, Math.min(e.clientX - rect.left - dragOffset.current.x, rect.width - STATS_BOX_MIN_WIDTH)),
        y: Math.max(0, Math.min(e.clientY - rect.top - dragOffset.current.y, rect.height - STATS_BOX_MIN_HEIGHT)),
      })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const cev = stats?.avg_chips_ev || 0
  const positionValue = (key: string): string => {
    const cevForPosition = stats?.cev_by_position?.[key] || 0
    if (position === 'all') return (cevForPosition / (stats?.total_tournaments || 1)).toFixed(2)
    // With a position selected, only that position has a meaningful per-tournament value.
    if (key !== position) return '0.00'
    return (cevForPosition / (stats?.tournaments_by_position?.[key] || 1)).toFixed(2)
  }

  const toggleLine =(key: LineKey) => setVisible((v) => ({ ...v, [key]: !v[key] }))
  const legendKeys: LineKey[] = chartMode === 'chips' ? CHIP_LINES : ['euroProfit']
  const modeButton = (mode: ChartMode, label: string) => (
    <button
      onClick={() => setChartMode(mode)}
      className={clsx('px-3 py-1 text-[13px] font-medium rounded-md transition-colors', chartMode === mode ? 'bg-primary-500 text-onprimary font-semibold' : 'text-gray-400 hover:text-gray-100')}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="segmented">
            {modeButton('chips', 'CEV (Chips)')}
            {modeButton('euro', 'Euros (€)')}
          </div>
          <select value={position} onChange={(e) => setPosition(e.target.value)} className="select w-44">
            {POSITIONS.map((pos) => (
              <option key={pos} value={pos}>{t(`charts.positions.${pos}`)}</option>
            ))}
          </select>
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

      <div ref={frameRef} className="relative">
        {isLoading && (
          <LoadingOverlay loading>
            <div style={{ height: CHART_HEIGHT }} />
          </LoadingOverlay>
        )}
        {!isLoading && data.length === 0 && (
          <div className="flex flex-col items-center justify-center text-gray-400" style={{ height: CHART_HEIGHT }}>
            <p className="mb-2">{t('dashboard.no_data_chart')}</p>
          </div>
        )}
        {hasData && <div ref={containerRef} className="w-full" style={{ height: CHART_HEIGHT }} />}

        {hasData && stats && (
          <div
            className="absolute bg-dark-600/95 backdrop-blur-sm border border-dark-200 rounded-lg p-3 shadow-xl select-none"
            style={{ left: boxPosition.x, top: boxPosition.y, cursor: dragging ? 'grabbing' : 'grab', minWidth: 200 }}
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
              setDragging(true)
            }}
          >
            <div className="flex items-center justify-between mb-2 border-b border-dark-200 pb-2">
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[.06em]">{t('charts.stats_title')}</span>
              <GripHorizontal className="w-4 h-4 text-gray-500" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">{t('common.tournaments')}</span>
                <span className="text-sm font-mono font-medium text-gray-100">{stats.total_tournaments}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">{t('charts.cev')}</span>
                <span className={clsx('text-sm font-mono font-medium', cev >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
                  {cev >= 0 ? '+' : ''}{cev.toFixed(2)}
                </span>
              </div>
              {stats.cev_by_position && (
                <div className="mt-3 pt-2 border-t border-dark-200">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <p className="text-[9px] text-gray-500">{t('charts.heads_up')}</p>
                      <PositionStat label="SB" value={positionValue('HU_SB')} isSelected={position === 'HU_SB'} />
                      <PositionStat label="BB" value={positionValue('HU_BB')} isSelected={position === 'HU_BB'} />
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-500">{t('charts.three_way')}</p>
                      <PositionStat label="BTN" value={positionValue('3W_BTN')} isSelected={position === '3W_BTN'} />
                      <PositionStat label="SB" value={positionValue('3W_SB')} isSelected={position === '3W_SB'} />
                      <PositionStat label="BB" value={positionValue('3W_BB')} isSelected={position === '3W_BB'} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
