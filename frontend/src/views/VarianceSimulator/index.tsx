import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import { ipcService, type Json } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { MULTIPLIER_PRESETS, type DistributionChoice, type PresetKey } from './multiplierPresets'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import { logError } from '@/utils/log'
import {
  expectedMultiplier, MAX_SIMULATIONS, MAX_SPINS, MAX_WORK, runSimulation, breakevenChipEv, estimateRank, sampleCurve, tournamentCurve, validateInput, winRateFromChipEv,
  type SimulationInput, type SimulationResult,
} from '@/utils/varianceSimulator'

const DEFAULT_BUY_IN = 5
const DEFAULT_SPINS = 1000
const DEFAULT_SIMULATIONS = 4000
const DEFAULT_CHIP_EV = 40
const DEFAULT_BANKROLL = 300
const PERCENT = 100
const SEED_RANGE = 2 ** 32
const CHART_HEIGHT = 360
const CHART_COLOR = '#34c27a'
const REAL_COLOR = '#7aa7ff'
const PATH_COLOR = '#c9d1d9'
const EXPECTED_COLOR = '#eab308'
const LUCKY_COLOR = '#a7f3d0'
const UNLUCKY_COLOR = '#ff7a6b'
const GRID_COLOR = '#262b34'
const Y_PADDING = 0.25
const BAND_LOW_COLOR = 'rgba(52, 194, 122, 0.13)'
const BAND_HIGH_COLOR = 'rgba(52, 194, 122, 0.24)'

/** The prize pool of a Spin is made of the three buy-ins, rake included. */
const PLAYERS_PER_SPIN = 3

interface TableRow {
  multiplier: string
  weight: string
}

const toNumber = (value: string): number => (value.trim() === '' ? Number.NaN : Number(value.replace(',', '.')))
const signed = (value: number, digits = 0) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`
const euros = (value: number) => `${signed(value)} €`
const profitColor = (value: number) => (value >= 0 ? '#4ccf8f' : '#ff7a6b')
const labelClass = 'text-[11px] font-medium uppercase tracking-[.06em] text-gray-500'

function Field({ label, suffix, children }: { label: string; suffix?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      <span className="relative block">
        {children}
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">{suffix}</span>}
      </span>
    </label>
  )
}

function Tile({ label, value, hint, className }: { label: string; value: string; hint: string; className?: string }) {
  return (
    <div className="rounded-xl border border-dark-200 bg-dark-400 px-5 py-4">
      <div className={labelClass}>{label}</div>
      <div className={clsx('mt-2 font-mono text-2xl font-bold', className)}>{value}</div>
      <div className="mt-1 text-xs text-gray-500">{hint}</div>
    </div>
  )
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
      <span className={line ? 'h-0.5 w-4 rounded' : 'h-2.5 w-2.5 rounded-sm'} style={{ background: color }} />
      {label}
    </span>
  )
}

/** Monte Carlo variance simulator: what a given win rate can look like over a number of tournaments. */
export default function VarianceSimulator() {
  const { t, i18n } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const buyInFilter = useFilterStore((s) => s.buyIn)
  const dashboardStats = useAppStore((s) => s.dashboardStats)

  const [buyIn, setBuyIn] = useState(String(DEFAULT_BUY_IN))
  const [spins, setSpins] = useState(String(DEFAULT_SPINS))
  const [simulations, setSimulations] = useState(String(DEFAULT_SIMULATIONS))
  const [chipEv, setChipEv] = useState(String(DEFAULT_CHIP_EV))
  const [bankroll, setBankroll] = useState(String(DEFAULT_BANKROLL))
  const [table, setTable] = useState<TableRow[]>(MULTIPLIER_PRESETS.winamax)
  const [distribution, setDistribution] = useState<DistributionChoice>('winamax')
  const [outcome, setOutcome] = useState<{ result: SimulationResult; buyIn: number; bankroll: number | null; simulations: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyMessage, setHistoryMessage] = useState<string | null>(null)
  const [realCurve, setRealCurve] = useState<number[] | null>(null)
  const [runToken, setRunToken] = useState(0)

  const format = (value: number) => value.toLocaleString(i18n.language)

  const run = useCallback(() => {
    const stake = toNumber(buyIn)
    const bankrollEuros = bankroll.trim() === '' ? null : toNumber(bankroll)
    const input: SimulationInput = {
      spins: toNumber(spins),
      simulations: toNumber(simulations),
      winRate: winRateFromChipEv(toNumber(chipEv)),
      multipliers: table.map((row) => ({ multiplier: toNumber(row.multiplier), weight: toNumber(row.weight) })),
      bankroll: bankrollEuros === null ? null : bankrollEuros / stake,
      seed: Math.floor(Math.random() * SEED_RANGE),
    }
    const invalid = !(stake > 0) ? 'buyIn' : validateInput(input)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    const result = runSimulation(input)
    setOutcome(result ? { result, buyIn: stake, bankroll: bankrollEuros, simulations: input.simulations } : null)
  }, [buyIn, bankroll, spins, simulations, chipEv, table])

  // The effects below always call the latest `run` without re-running when an input changes.
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  }, [run])
  useEffect(() => {
    runRef.current()
  }, [runToken])

  const loadHistory = useCallback(async (): Promise<boolean> => {
    setLoadingHistory(true)
    setHistoryMessage(null)
    try {
      const { dateFrom, dateTo } = currentDateRange()
      const buyInFilterValue = buyInParam(buyInFilter)
      const tournamentsCount = Number(dashboardStats?.total_tournaments) || 0
      if (tournamentsCount === 0) {
        setHistoryMessage(t('variance.no_history'))
        return false
      }
      setChipEv((Number(dashboardStats?.avg_chips_ev) || 0).toFixed(1))
      if (buyInFilterValue) setBuyIn(String(buyInFilterValue))
      const chart = await ipcService.getWinrateChartData({ dateFrom, dateTo, heroName, buyIn: buyInFilterValue })
      const perHand: Json[] = chart.success && Array.isArray(chart.data) ? chart.data : []
      setRealCurve(tournamentCurve(perHand.map((item) => Number(item.euro_profit ?? item.euroProfit ?? 0))))
      setHistoryMessage(t('variance.history_loaded', { count: tournamentsCount }))
      return true
    } catch (loadError) {
      logError('Failed to load the history for the variance simulator:', loadError)
      setHistoryMessage(t('variance.no_history'))
      return false
    } finally {
      setLoadingHistory(false)
    }
  }, [heroName, buyInFilter, dashboardStats, t])

  const applyHistory = async () => {
    if (await loadHistory()) setRunToken((token) => token + 1)
  }

  // Start from the player's own data when there is some.
  const initialLoadStarted = useRef(false)
  useEffect(() => {
    if (initialLoadStarted.current || !heroName || !dashboardStats) return
    initialLoadStarted.current = true
    void loadHistory().then((loaded) => {
      if (loaded) setRunToken((token) => token + 1)
    })
  }, [heroName, dashboardStats, loadHistory])

  const mean = useMemo(
    () => expectedMultiplier(table.map((row) => ({ multiplier: toNumber(row.multiplier), weight: toNumber(row.weight) }))),
    [table],
  )
  const impliedWinRate = winRateFromChipEv(toNumber(chipEv))
  const theoreticalRoi = mean === null || Number.isNaN(impliedWinRate) ? null : impliedWinRate * mean - 1

  // Any manual change makes the table a custom one.
  const editTable = (change: (rows: TableRow[]) => TableRow[]) => {
    setTable(change)
    setDistribution('custom')
  }
  const choosePreset = (choice: DistributionChoice) => {
    setDistribution(choice)
    if (choice !== 'custom') setTable(MULTIPLIER_PRESETS[choice])
  }

  const updateRow = (index: number, patch: Partial<TableRow>) =>
    editTable((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const result = outcome?.result
  const stake = outcome?.buyIn ?? 0
  const tournaments = result ? (result.checkpoints.at(-1) ?? 0) : 0
  const realAtCheckpoints = useMemo(() => (result && realCurve ? sampleCurve(realCurve, result.checkpoints) : null), [result, realCurve])

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = echarts.init(el, 'dark')
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(el)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !result) return
    const scale = (values: number[]) => values.map((v) => Math.round(v * stake * 100) / 100)
    const [p10, p25, p50, p75, p90] = [result.bands.p10, result.bands.p25, result.bands.p50, result.bands.p75, result.bands.p90].map(scale)
    const gap = (high: number[], low: number[]) => high.map((v, i) => Math.round((v - low[i]) * 100) / 100)
    const band = (key: string, base: number[], height: number[], color: string) => [
      { name: `${key}-base`, type: 'line' as const, stack: key, data: base, symbol: 'none', silent: true, lineStyle: { opacity: 0 }, tooltip: { show: false } },
      { name: key, type: 'line' as const, stack: key, data: height, symbol: 'none', silent: true, lineStyle: { opacity: 0 }, areaStyle: { color }, tooltip: { show: false } },
    ]
    const lastIndex = result.checkpoints.length - 1
    const expected = result.checkpoints.map((count) => Math.round(result.roi * count * stake * 100) / 100)
    const realValues = (realAtCheckpoints ?? []).filter((v): v is number => v !== null)
    const highlighted = [...result.luckyPath, ...result.unluckyPath].map((v) => v * stake)
    const low = Math.min(0, ...p10, ...realValues, ...highlighted) * (1 + Y_PADDING)
    const high = Math.max(0, ...p90, ...realValues, ...highlighted) * (1 + Y_PADDING)
    // Round outwards to a round step so the axis labels stay readable.
    const step = 10 ** Math.floor(Math.log10(Math.max(high - low, 1)) - 1)
    const yMin = Math.floor(low / step) * step
    const yMax = Math.ceil(high / step) * step
    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 56, right: 16, top: 12, bottom: 44 },
      // Lists where the runs stand at the hovered tournament, so the player can place their own result.
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#12151a',
        borderColor: GRID_COLOR,
        textStyle: { color: '#e5e7eb', fontSize: 12 },
        formatter: (raw) => {
          const list = Array.isArray(raw) ? raw : [raw]
          const index = list[0]?.dataIndex ?? 0
          const row = (label: string, value: number, color?: string) =>
            `<div style="display:flex;justify-content:space-between;gap:20px"><span>${label}</span><b style="color:${color ?? profitColor(value)}">${euros(value)}</b></div>`
          const rows = [
            row(t('variance.tip_top', { pct: 10 }), p90[index]),
            row(t('variance.tip_top', { pct: 25 }), p75[index]),
            row(t('variance.median'), p50[index]),
            row(t('variance.expected'), expected[index], EXPECTED_COLOR),
            row(t('variance.tip_bottom', { pct: 25 }), p25[index]),
            row(t('variance.tip_bottom', { pct: 10 }), p10[index]),
          ]
          // The real curve has no value past the last tournament played.
          const real = realAtCheckpoints?.[index]
          if (typeof real === 'number') {
            const rank = estimateRank(real, { p10: p10[index], p25: p25[index], p50: p50[index], p75: p75[index], p90: p90[index] })
            const standing =
              rank.kind === 'above' ? t('variance.rank_above')
              : rank.kind === 'below' ? t('variance.rank_below')
              : rank.percentile >= 50 ? t('variance.rank_top', { pct: Math.max(1, Math.round(100 - rank.percentile)) })
              : t('variance.rank_bottom', { pct: Math.max(1, Math.round(rank.percentile)) })
            rows.push(`<hr style="border:0;border-top:1px solid #3a4150;margin:4px 0"/>`, row(`${t('variance.real')} (${standing})`, real, REAL_COLOR))
          }
          return `<div style="font-weight:600;margin-bottom:4px">${t('variance.tip_after', { count: result.checkpoints[index] })}</div>${rows.join('')}`
        },
      },
      xAxis: {
        type: 'category', data: result.checkpoints, boundaryGap: false, name: t('variance.axis_tournaments'), nameLocation: 'middle', nameGap: 28,
        axisLabel: { interval: (index: number) => index === 0 || index === lastIndex, color: '#8b93a1' },
        axisTick: { show: false }, axisLine: { show: false },
      },
      // Frame the bands, not the rare jackpot runs, which are simply cut by the plot area.
      yAxis: {
        type: 'value', min: yMin, max: yMax, axisLabel: { formatter: '{value} €', color: '#8b93a1' }, splitLine: { lineStyle: { color: GRID_COLOR } },
      },
      series: [
        ...band('band-80', p10, gap(p90, p10), BAND_LOW_COLOR),
        ...band('band-50', p25, gap(p75, p25), BAND_HIGH_COLOR),
        ...result.samplePaths.map((path, i) => ({
          name: t('variance.sample_path', { index: i + 1 }), type: 'line' as const, data: scale(path), symbol: 'none', silent: true,
          lineStyle: { width: 1, color: PATH_COLOR, opacity: 0.14 }, tooltip: { show: false },
        })),
        {
          name: t('variance.median'), type: 'line', data: p50, symbol: 'none', lineStyle: { width: 2.5, color: CHART_COLOR }, itemStyle: { color: CHART_COLOR },
          markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { type: 'dashed', color: '#4a5264' }, data: [{ yAxis: 0 }] },
        },
        { name: t('variance.expected'), type: 'line', data: expected, symbol: 'none', lineStyle: { width: 2, type: 'dashed', color: EXPECTED_COLOR }, itemStyle: { color: EXPECTED_COLOR }, tooltip: { show: false } },
        { name: t('variance.lucky_run'), type: 'line', data: scale(result.luckyPath), symbol: 'none', lineStyle: { width: 1.5, color: LUCKY_COLOR }, itemStyle: { color: LUCKY_COLOR }, tooltip: { show: false } },
        { name: t('variance.unlucky_run'), type: 'line', data: scale(result.unluckyPath), symbol: 'none', lineStyle: { width: 1.5, color: UNLUCKY_COLOR }, itemStyle: { color: UNLUCKY_COLOR }, tooltip: { show: false } },
        ...(realAtCheckpoints
          ? [{
              name: t('variance.real'), type: 'line' as const, symbol: 'none', connectNulls: false,
              data: realAtCheckpoints.map((v) => (v === null ? null : Math.round(v * 100) / 100)),
              lineStyle: { width: 2, color: REAL_COLOR }, itemStyle: { color: REAL_COLOR }, z: 5,
            }]
          : []),
      ],
    }
    chart.setOption(option, { notMerge: true })
  }, [result, stake, realAtCheckpoints, t])

  const endLow = result ? (result.bands.p10.at(-1) ?? 0) * stake : 0
  const endHigh = result ? (result.bands.p90.at(-1) ?? 0) * stake : 0
  const realLength = realCurve ? realCurve.length - 1 : 0
  // Compare the real result with the band at the same number of tournaments (or the last one simulated).
  const comparisonIndex = result ? Math.max(0, result.checkpoints.findIndex((count) => count >= Math.min(realLength, tournaments))) : 0
  const realValue = realCurve ? realCurve[Math.min(realLength, tournaments)] : null
  const verdict: 'inside' | 'above' | 'below' | null =
    !result || realValue === null || realLength === 0 ? null
    : realValue > result.bands.p90[comparisonIndex] * stake ? 'above'
    : realValue < result.bands.p10[comparisonIndex] * stake ? 'below'
    : 'inside'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="page-title">{t('variance.title')}</h1>
        <p className="page-subtitle">{t('variance.subtitle')}</p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[250px_1fr]">
        <div className="flex flex-col gap-4">
          <Card title={t('variance.parameters')}>
            <div className="flex flex-col gap-3">
              <Field label={t('variance.spins')}>
                <input className="input" inputMode="numeric" value={spins} onChange={(e) => setSpins(e.target.value)} />
              </Field>
              <Field label={t('variance.buy_in')} suffix="€">
                <input className="input" inputMode="decimal" value={buyIn} onChange={(e) => setBuyIn(e.target.value)} />
              </Field>
              <Field label={t('variance.chip_ev')}>
                <input className="input" inputMode="decimal" value={chipEv} onChange={(e) => setChipEv(e.target.value)} />
                {!Number.isNaN(impliedWinRate) && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">≈ {(impliedWinRate * PERCENT).toFixed(1)} %</span>
                )}
              </Field>
              <Field label={t('variance.simulations')}>
                <input className="input" inputMode="numeric" value={simulations} onChange={(e) => setSimulations(e.target.value)} />
              </Field>
              <Field label={t('variance.bankroll')} suffix="€">
                <input className="input" inputMode="decimal" value={bankroll} placeholder={t('variance.bankroll_placeholder')} onChange={(e) => setBankroll(e.target.value)} />
              </Field>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-xs text-profit-negative">
                {t(`variance.error.${error}`, { maxSpins: format(MAX_SPINS), maxSimulations: format(MAX_SIMULATIONS), maxWork: format(MAX_WORK) })}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <button className="btn-primary w-full justify-center" onClick={() => void applyHistory()} disabled={loadingHistory}>
                {t('variance.use_history')}
              </button>
              <button className="btn-secondary w-full justify-center" onClick={run}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {t('variance.rerun')}
              </button>
            </div>
            {historyMessage && <p className="mt-2 text-xs text-gray-400">{historyMessage}</p>}
          </Card>

          <Card title={t('variance.distribution')} subtitle={t('variance.distribution_hint')}>
            <div className="flex flex-col gap-1.5">
              <select className="select mb-1" aria-label={t('variance.distribution')} value={distribution} onChange={(e) => choosePreset(e.target.value as DistributionChoice)}>
                {(Object.keys(MULTIPLIER_PRESETS) as PresetKey[]).map((key) => (
                  <option key={key} value={key}>{t(`variance.preset.${key}`)}</option>
                ))}
                <option value="custom">{t('variance.preset.custom')}</option>
              </select>
              <div className="grid grid-cols-[1fr_1fr_24px] gap-2 px-1">
                <span className={labelClass}>{t('variance.multiplier')}</span>
                <span className={clsx(labelClass, 'text-right')}>{t('variance.frequency')}</span>
                <span />
              </div>
              {table.map((row, index) => (
                // Rows are only ever edited in place or removed by index, never reordered.
                <div key={index} className="grid grid-cols-[1fr_1fr_24px] items-center gap-2">
                  <span className="relative block">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500">×</span>
                    <input className="input pl-6 font-mono" aria-label={t('variance.multiplier')} inputMode="decimal" value={row.multiplier} onChange={(e) => updateRow(index, { multiplier: e.target.value })} />
                  </span>
                  <span className="relative block">
                    <input className="input pr-6 text-right font-mono" aria-label={t('variance.frequency')} inputMode="decimal" value={row.weight} onChange={(e) => updateRow(index, { weight: e.target.value })} />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
                  </span>
                  <button className="btn-icon p-0.5" aria-label={t('common.delete')} onClick={() => editTable((rows) => rows.filter((_, i) => i !== index))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {mean !== null && (
                <p className={clsx('mt-1 text-xs', mean >= PLAYERS_PER_SPIN ? 'text-profit-negative' : 'text-gray-500')}>
                  {mean >= PLAYERS_PER_SPIN
                    ? t('variance.mean_warning', { mean: mean.toFixed(2) })
                    : t('variance.mean_line', { mean: mean.toFixed(2), rake: ((1 - mean / PLAYERS_PER_SPIN) * PERCENT).toFixed(1), breakeven: Math.round(breakevenChipEv(mean)) })}
                </p>
              )}
              <button className="btn-secondary mt-1 self-start" onClick={() => editTable((rows) => [...rows, { multiplier: '', weight: '' }])}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('variance.add_row')}
              </button>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label={t('variance.tile_roi')}
              value={theoreticalRoi === null ? '—' : `${signed(theoreticalRoi * PERCENT, 1)} %`}
              hint={t('variance.tile_roi_hint')}
              className={theoreticalRoi !== null && theoreticalRoi < 0 ? 'text-profit-negative' : 'text-profit-positive'}
            />
            <Tile
              label={t('variance.tile_losing')}
              value={result ? `${(result.losingShare * PERCENT).toFixed(1)} %` : '—'}
              hint={t('variance.tile_losing_hint', { count: tournaments })}
              className="text-yellow-400"
            />
            <Tile
              label={t('variance.tile_downswing')}
              value={result ? euros(-result.p95MaxDrawdown * stake) : '—'}
              hint={t('variance.tile_downswing_hint')}
              className="text-profit-negative"
            />
            <Tile
              label={t('variance.tile_ruin')}
              value={result && result.ruinShare !== null ? `${(result.ruinShare * PERCENT).toFixed(1)} %` : '—'}
              hint={outcome && outcome.bankroll !== null ? t('variance.tile_ruin_hint', { amount: outcome.bankroll }) : t('variance.tile_ruin_none')}
              className="text-profit-negative"
            />
          </div>

          <Card title={t('variance.chart_title')} subtitle={t('variance.chart_subtitle', { count: outcome?.simulations ?? 0, formatted: format(outcome?.simulations ?? 0) })}>
            <div className="mb-2 flex flex-wrap gap-4">
              <Legend color={CHART_COLOR} label={t('variance.median')} line />
              <Legend color={EXPECTED_COLOR} label={t('variance.expected_legend')} line />
              <Legend color={LUCKY_COLOR} label={t('variance.lucky_run')} line />
              <Legend color={UNLUCKY_COLOR} label={t('variance.unlucky_run')} line />
              <Legend color={BAND_HIGH_COLOR} label={t('variance.band_50')} />
              <Legend color={BAND_LOW_COLOR} label={t('variance.band_80')} />
              {realCurve && realLength > 0 && <Legend color={REAL_COLOR} label={t('variance.real_legend', { count: realLength })} line />}
            </div>
            <div ref={containerRef} className="w-full" style={{ height: CHART_HEIGHT }} />
          </Card>

          {result && (
            <Card title={t('variance.reading')}>
              <p className="text-sm leading-relaxed text-gray-300">
                <Trans
                  i18nKey="variance.reading_text"
                  values={{ count: tournaments, high: euros(endHigh), low: euros(endLow) }}
                  components={{ good: <span className="font-semibold text-profit-positive" />, bad: <span className="font-semibold text-profit-negative" /> }}
                />{' '}
                {verdict && t(`variance.verdict_${verdict}`)}
              </p>
            </Card>
          )}

          <p className="text-xs text-gray-500">{t('variance.footnote')}</p>
        </div>
      </div>
    </div>
  )
}
