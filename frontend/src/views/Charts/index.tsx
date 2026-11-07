import { useEffect, useMemo, useRef, useState } from 'react'
import type * as echarts from 'echarts'
import { BarChart2, GripHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useBrushChart } from '@/hooks/useBrushChart'
import { ipcService, type Json } from '@/services/ipcService'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import PositionStat from './components/PositionStat'
import { logError } from '@/utils/log'

type LineKey = 'chipsWon' | 'netExpected' | 'wonWithShowdown' | 'wonWithoutShowdown'

interface Point {
  label: string
  chipsWon: number
  netExpected: number
  wonWithShowdown: number
  wonWithoutShowdown: number
}

const POSITIONS = ['all', 'HU_SB', 'HU_BB', '3W_BTN', '3W_SB', '3W_BB'] as const
const POSITION_LABELS: Record<string, string> = {
  all: 'All Positions', HU_SB: 'HU SB', HU_BB: 'HU BB', '3W_BTN': '3W BTN', '3W_SB': '3W SB', '3W_BB': '3W BB',
}
const LINE_COLORS: Record<LineKey, string> = {
  chipsWon: '#3fd49a',
  netExpected: '#eab308',
  wonWithShowdown: '#7aa7ff',
  wonWithoutShowdown: '#ff7a6b',
}
const LINE_KEYS = Object.keys(LINE_COLORS) as LineKey[]
const STATS_BOX_MIN_WIDTH = 250
const STATS_BOX_MIN_HEIGHT = 150

/** Keeps the last point of each date so the curve has one value per day. */
function groupByDate(raw: Json[]): Point[] {
  const grouped = new Map<string, Point>()
  for (const item of raw) {
    const label = item.date || 'Unknown'
    grouped.set(label, {
      label,
      chipsWon: item.profit ?? item.realWin ?? 0,
      netExpected: item.cumulative ?? item.theoricalWin ?? 0,
      wonWithShowdown: item.chips_won_showdown ?? item.chipsWonShowdown ?? 0,
      wonWithoutShowdown: item.chips_won_no_showdown ?? item.chipsWonNoShowdown ?? 0,
    })
  }
  return Array.from(grouped.values())
}

export default function Charts() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const buyIn = useFilterStore((s) => s.buyIn)
  const dateRange = useFilterStore((s) => s.dateRange)
  const selectedSession = useFilterStore((s) => s.selectedSession)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const [position, setPosition] = useState<string>('all')
  const [stats, setStats] = useState<Json | null>(null)
  const [data, setData] = useState<Point[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [visible, setVisible] = useState<Record<LineKey, boolean>>({
    chipsWon: true, netExpected: true, wonWithShowdown: true, wonWithoutShowdown: true,
  })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [boxPosition, setBoxPosition] = useState({ x: 80, y: 280 })

  const labels: Record<LineKey, string> = {
    chipsWon: t('common.chips_won', 'Chips Won'),
    netExpected: t('hand_history.table.ev_chips', 'EV Chips'),
    wonWithShowdown: t('common.showdown_winning', 'Showdown Won'),
    wonWithoutShowdown: t('common.non_showdown_winning', 'Non-Showdown Won'),
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!heroName) {
        setData([])
        setStats(null)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      try {
        const { dateFrom, dateTo } = currentDateRange()
        const [chart, dashboard] = await Promise.all([
          ipcService.getWinrateChartData({
            dateFrom, dateTo, heroName, buyIn: buyInParam(buyIn), position: position === 'all' ? null : position,
          }),
          ipcService.getDashboardStats(heroName, dateFrom, dateTo, buyInParam(buyIn)),
        ])
        if (cancelled) return
        setData(chart?.success && Array.isArray(chart.data) ? groupByDate(chart.data) : [])
        setStats(dashboard?.success && dashboard.data ? dashboard.data : null)
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
  }, [heroName, buyIn, position, dateRange, selectedSession])

  const hasData = !isLoading && !!heroName && data.length > 0

  const option = useMemo((): echarts.EChartsOption | null => {
    if (!data.length) return null
    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: { trigger: 'axis', backgroundColor: '#1b1f26', borderColor: '#262b34', textStyle: { color: '#a7aab3' } },
      brush: { xAxisIndex: 0, brushLink: 'all', outOfBrush: { colorAlpha: 0.1 } },
      dataZoom: [
        { type: 'slider', show: false, xAxisIndex: 0 },
        { type: 'inside', xAxisIndex: 0, disabled: true },
      ],
      grid: { top: 30, right: 30, bottom: 30, left: 60, containLabel: true },
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
        axisLabel: { color: '#a7aab3' },
        splitLine: { show: true, lineStyle: { color: '#262b34' } },
      },
      series: LINE_KEYS.filter((key) => visible[key]).map((key) => ({
        name: labels[key],
        type: 'line' as const,
        data: data.map((d) => d[key]),
        itemStyle: { color: LINE_COLORS[key] },
        showSymbol: false,
        lineStyle: { width: 2 },
        emphasis: { focus: 'series' as const },
        large: true,
      })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, visible, t])

  useBrushChart(chartRef, hasData, option)

  // Drag handling for the floating stats box.
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
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

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="page-title">{t('charts.title')}</h1>
          <p className="page-subtitle">{t('charts.subtitle')}</p>
        </div>
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="select w-48"
        >
          {POSITIONS.map((pos) => (
            <option key={pos} value={pos}>{t(`charts.positions.${pos}`, POSITION_LABELS[pos])}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-5 mb-3">
        {LINE_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setVisible((v) => ({ ...v, [key]: !v[key] }))}
            className={clsx('flex items-center gap-2 text-[13px] transition-opacity', !visible[key] && 'opacity-40')}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LINE_COLORS[key] }} />
            <span className="text-gray-400">{labels[key]}</span>
          </button>
        ))}
      </div>

      <div ref={containerRef} className="flex-1 w-full relative min-h-0 rounded-[10px] border border-dark-200 bg-dark-400 p-3">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
          </div>
        )}

        {!isLoading && !heroName && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <BarChart2 className="w-16 h-16 mb-4" />
            <p className="text-lg">{t('dashboard.no_hero')}</p>
            <p className="text-sm">{t('dashboard.select_hero_prompt')}</p>
          </div>
        )}

        {!isLoading && heroName && data.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <BarChart2 className="w-16 h-16 mb-4" />
            <p className="text-lg">{t('dashboard.no_data')}</p>
            <p className="text-sm">{t('dashboard.no_data_chart')}</p>
          </div>
        )}

        {hasData && <div ref={chartRef} className="w-full h-full" />}

        {stats && (
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
              <span className="text-[11px] font-medium text-gray-500 uppercase tracking-[.06em]">Stats</span>
              <GripHorizontal className="w-4 h-4 text-gray-500" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Tournaments</span>
                <span className="text-sm font-mono font-medium text-gray-100">{stats.total_tournaments}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">CEV</span>
                <span className={clsx('text-sm font-mono font-medium', cev >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
                  {cev >= 0 ? '+' : ''}{cev.toFixed(2)}
                </span>
              </div>
              {stats.cev_by_position && (
                <div className="mt-3 pt-2 border-t border-dark-200">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <p className="text-[9px] text-gray-500">Heads-Up</p>
                      <PositionStat label="SB" value={positionValue('HU_SB')} isSelected={position === 'HU_SB'} />
                      <PositionStat label="BB" value={positionValue('HU_BB')} isSelected={position === 'HU_BB'} />
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-500">3-Way</p>
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
