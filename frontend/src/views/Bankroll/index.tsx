import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { usePoolEvStore } from '@/stores/poolEvStore'
import {
  ACCEPTABLE_RISK, buildBankrollSeries, COMFORTABLE_RISK, highestStakeUnder, recommendStakes,
  type BankrollTransaction, type EuroPoint,
} from '@/utils/bankroll'
import { formatProfit } from '@/utils/formatters'
import { logError } from '@/utils/log'
import type { SharingRoom } from '@/utils/varianceSimulator'
import { MULTIPLIER_PRESETS } from '@/views/VarianceSimulator/multiplierPresets'

const CHART_HEIGHT = 300
const LINE_COLOR = '#34c27a'
const GRID_COLOR = '#262b34'
const KNOWN_ROOMS: SharingRoom[] = ['winamax', 'unibet', 'betclic']
const todayIso = () => new Date().toISOString().slice(0, 10)

/** Bankroll: deposits and withdrawals, its evolution and the buy-ins it can carry. */
export default function Bankroll() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const lastUpdate = useAppStore((s) => s.lastUpdate)
  const stats = useAppStore((s) => s.dashboardStats)
  const poolTables = usePoolEvStore((s) => s.tables)
  const [transactions, setTransactions] = useState<BankrollTransaction[]>([])
  const [euroPoints, setEuroPoints] = useState<EuroPoint[]>([])
  const [date, setDate] = useState(todayIso)
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<'deposit' | 'withdrawal'>('deposit')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    try {
      const [list, chart] = await Promise.all([
        ipcService.getBankrollTransactions(),
        heroName ? ipcService.getWinrateChartData({ heroName }) : Promise.resolve(null),
      ])
      if (list.success) setTransactions(list.data ?? [])
      const rows: { date: string; euro_profit: number }[] = chart?.success ? chart.data ?? [] : []
      setEuroPoints(rows.map((row) => ({ date: row.date, euro: row.euro_profit })))
    } catch (error) {
      logError('Failed to load the bankroll:', error)
    }
  }, [heroName])

  useEffect(() => {
    void reload()
  }, [reload, lastUpdate])

  const series = useMemo(() => buildBankrollSeries(transactions, euroPoints), [transactions, euroPoints])
  const deposits = transactions.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0)
  const withdrawals = transactions.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0)
  const results = euroPoints.length > 0 ? euroPoints[euroPoints.length - 1].euro : 0
  const current = deposits + withdrawals + results

  useEffect(() => {
    if (!chartRef.current || series.length === 0) return
    const chart = echarts.init(chartRef.current)
    chart.setOption({
      backgroundColor: 'transparent',
      animation: false,
      grid: { top: 20, right: 10, bottom: 24, left: 50, containLabel: true },
      tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => `${Number(value).toFixed(2)}€` },
      xAxis: { type: 'category', data: series.map((p) => p.day), axisLabel: { color: '#a7aab3' }, boundaryGap: false },
      yAxis: { type: 'value', axisLabel: { color: '#a7aab3', formatter: '{value}€' }, splitLine: { lineStyle: { color: GRID_COLOR } } },
      series: [{ type: 'line', data: series.map((p) => p.bankroll), showSymbol: false, itemStyle: { color: LINE_COLOR }, lineStyle: { width: 2.5 } }],
    })
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [series])

  const addTransaction = async () => {
    const value = Math.abs(Number(amount.replace(',', '.')))
    if (!(value > 0)) {
      setFormError(true)
      return
    }
    const res = await ipcService.addBankrollTransaction({ occurredOn: date, amount: kind === 'deposit' ? value : -value, note: note.trim() })
    setFormError(!res.success)
    if (res.success) {
      setAmount('')
      setNote('')
      await reload()
    }
  }

  const removeTransaction = async (id: number) => {
    await ipcService.deleteBankrollTransaction(id)
    await reload()
  }

  const mainRoom: SharingRoom = KNOWN_ROOMS.find((room) => room === stats?.main_room) ?? 'winamax'
  const presetTable = (poolTables[mainRoom]?.length ? poolTables[mainRoom] : MULTIPLIER_PRESETS.winamax).map((row) => ({
    multiplier: Number(row.multiplier),
    weight: Number(row.weight),
  }))
  const chipEv: number = stats?.avg_chips_ev ?? 0
  const recommendations = useMemo(
    () => (current > 0 ? recommendStakes({ bankroll: current, chipEv, table: presetTable, room: mainRoom }) : []),
    // The table is rebuilt every render; its content only changes with the room or the settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, chipEv, mainRoom, poolTables],
  )
  const comfortable = highestStakeUnder(recommendations, COMFORTABLE_RISK)
  const acceptable = highestStakeUnder(recommendations, ACCEPTABLE_RISK)

  const tile = (label: string, value: number, signed = true) => (
    <div>
      <div className="stat-label">{label}</div>
      <div className={clsx('mt-1 font-mono text-xl font-semibold', value >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
        {signed ? formatProfit(value) : `${value.toFixed(2)}€`}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card title={t('bankroll.title')}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {tile(t('bankroll.current'), current, false)}
          {tile(t('bankroll.deposits'), deposits)}
          {tile(t('bankroll.withdrawals'), withdrawals)}
          {tile(t('bankroll.results'), results)}
        </div>
        {series.length > 0 && <div ref={chartRef} className="mt-4 w-full" style={{ height: CHART_HEIGHT }} />}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t('bankroll.movements')}>
          <div className="flex flex-wrap items-end gap-2 text-xs text-gray-400">
            <label className="flex flex-col gap-1">
              {t('common.date')}
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              {t('bankroll.type')}
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'deposit' | 'withdrawal')}>
                <option value="deposit">{t('bankroll.deposit')}</option>
                <option value="withdrawal">{t('bankroll.withdrawal')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              {t('bankroll.amount')}
              <input className="input w-24 font-mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              {t('bankroll.note')}
              <input className="input w-36" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="btn-primary" onClick={() => void addTransaction()}>
              {t('bankroll.add')}
            </button>
          </div>
          {formError && <p className="mt-2 text-xs text-profit-negative">{t('bankroll.invalid')}</p>}
          <div className="mt-3 max-h-64 overflow-y-auto">
            {transactions.length === 0 && <p className="py-4 text-center text-sm text-gray-500">{t('bankroll.none')}</p>}
            {[...transactions].reverse().map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-2 border-t border-[#1f242c] py-1.5 text-[13px]">
                <span className="font-mono text-gray-400">{tx.occurredOn}</span>
                <span className="flex-1 truncate text-gray-300">{tx.note}</span>
                <span className={clsx('font-mono font-medium', tx.amount >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>{formatProfit(tx.amount)}</span>
                <button className="btn-secondary p-1" onClick={() => void removeTransaction(tx.id)} aria-label={t('common.delete')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('bankroll.recommendation_title')} subtitle={t('bankroll.recommendation_subtitle', { chipEv: chipEv.toFixed(1) })}>
          {recommendations.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">{t('bankroll.recommendation_empty')}</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-gray-300">
                {acceptable === null
                  ? t('bankroll.no_stake_fits')
                  : t('bankroll.stake_summary', { acceptable, comfortable: comfortable ?? '—' })}
              </p>
              {recommendations.map((r) => (
                <div key={r.buyIn} className="flex items-center justify-between py-1 text-[13px]">
                  <span className="text-gray-100">{r.buyIn}€</span>
                  <span className="text-gray-400">
                    {t('bankroll.ruin_at_stake', { risk: r.ruinRisk === null ? '—' : (r.ruinRisk * 100).toFixed(1) })}
                  </span>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
