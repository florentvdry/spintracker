import { useEffect, useRef, type RefObject } from 'react'
import * as echarts from 'echarts'

/**
 * Owns an ECharts instance with horizontal brush-to-zoom (drag to zoom,
 * right click to reset). The chart exists only while `enabled` is true,
 * because its container is not rendered otherwise.
 */
export function useBrushChart(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  option: echarts.EChartsOption | null,
): void {
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!enabled || !el) return

    const chart = echarts.init(el, 'dark')
    chartRef.current = chart

    const onBrushEnd = (params: { areas?: { coordRange?: [number, number] }[] }) => {
      const range = params.areas?.[0]?.coordRange
      if (range) {
        chart.dispatchAction({ type: 'dataZoom', startValue: range[0], endValue: range[1] })
        chart.dispatchAction({ type: 'brush', areas: [] })
      }
    }
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      chart.dispatchAction({ type: 'restore' })
    }
    const onResize = () => chart.resize()

    chart.on('brushEnd', onBrushEnd as never)
    el.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('resize', onResize)

    return () => {
      chart.off('brushEnd', onBrushEnd as never)
      el.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('resize', onResize)
      chart.dispose()
      chartRef.current = null
    }
  }, [containerRef, enabled])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !enabled || !option) return
    chart.setOption(option, { notMerge: true })
    chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } })
  }, [enabled, option])
}
