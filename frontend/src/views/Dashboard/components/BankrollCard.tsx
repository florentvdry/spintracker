import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import { ipcService } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { RISK_THRESHOLD, curvePath, parseBounded, recommendBuyIn, riskTable, ruinShareAt, type BankrollMovement, type BankrollOverview, type RiskRow } from '@/utils/bankroll'
import { formatCurrency, formatPercent } from '@/utils/formatters'
import { logError } from '@/utils/log'
import { winRateFromChipEv, type MultiplierWeight, type SharingRoom } from '@/utils/varianceSimulator'

const MAX_AMOUNT = 1_000_000_000
const RECENT_MOVEMENTS = 5
const CHART = { width: 300, height: 80 } as const

interface DashboardFigures {
  avg_chips_ev?: number
  main_room?: string | null
}

interface MultiplierRow {
  multiplier: number
  total_count: number
}

/** Bankroll: balance and its curve, deposits and withdrawals, and the buy-in the bankroll can afford. */
export default function BankrollCard() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const figures = useAppStore((s) => s.dashboardStats) as DashboardFigures | null
  const notify = useNotificationStore()

  const [overview, setOverview] = useState<BankrollOverview | null>(null)
  const [buyIns, setBuyIns] = useState<number[]>([])
  const [table, setTable] = useState<MultiplierWeight[]>([])
  const [version, setVersion] = useState(0)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [toDelete, setToDelete] = useState<BankrollMovement | null>(null)

  useEffect(() => {
    let active = true
    ipcService
      .getBankroll(heroName)
      .then((result) => {
        if (active) setOverview(result.success ? (result.data as BankrollOverview) : null)
      })
      .catch((error: unknown) => logError('bankroll fetch failed', error))
    return () => {
      active = false
    }
  }, [heroName, version])

  useEffect(() => {
    let active = true
    ipcService
      .getBuyIns()
      .then((result) => {
        if (active && result.success) setBuyIns(result.data as number[])
      })
      .catch((error: unknown) => logError('buy-in list failed', error))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!heroName) {
      setTable([])
      return
    }
    let active = true
    ipcService
      .getMultiplierStats({ heroName })
      .then((result) => {
        if (!active || !result.success) return
        const rows = result.data as MultiplierRow[]
        setTable(rows.filter((r) => r.total_count > 0).map((r) => ({ multiplier: r.multiplier, weight: r.total_count })))
      })
      .catch((error: unknown) => logError('multiplier table failed', error))
    return () => {
      active = false
    }
  }, [heroName])

  const balance = overview?.totals.balance ?? 0
  const winRate = winRateFromChipEv(figures?.avg_chips_ev ?? 0)
  const room = (figures?.main_room ?? 'none') as SharingRoom

  // Risk of ruin per candidate buy-in, from the same simulator as the Variance tab.
  const riskAt = useMemo(
    () => (buyIn: number) => (table.length === 0 ? null : ruinShareAt(balance, buyIn, winRate, table, room)),
    [balance, winRate, table, room],
  )
  const rows: RiskRow[] = useMemo(() => (balance > 0 ? riskTable(balance, buyIns, riskAt) : []), [balance, buyIns, riskAt])
  const recommendation = useMemo(() => (balance > 0 ? recommendBuyIn(balance, buyIns, riskAt) : null), [balance, buyIns, riskAt])

  const save = async (sign: 1 | -1) => {
    const value = parseBounded(amount, 0.01, MAX_AMOUNT)
    if (value === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    try {
      const result = await ipcService.addBankrollMovement(sign * value, note)
      if (!result.success) {
        notify.error(t('bankroll.save_failed'))
        return
      }
      setAmount('')
      setNote('')
      setVersion((v) => v + 1)
    } catch (error: unknown) {
      logError('bankroll save failed', error)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    const id = toDelete.id
    setToDelete(null)
    try {
      const result = await ipcService.deleteBankrollMovement(id)
      if (result.success) setVersion((v) => v + 1)
    } catch (error: unknown) {
      logError('bankroll delete failed', error)
    }
  }

  const path = overview ? curvePath(overview.curve, CHART.width, CHART.height) : ''

  return (
    <Card title={t('bankroll.title')} subtitle={t('bankroll.subtitle')}>
      <LoadingOverlay loading={overview === null && heroName !== null}>
        <div className="space-y-4">
          <div>
            <div className="stat-label">{t('bankroll.balance')}</div>
            <div className={clsx('mt-1 font-mono text-3xl font-semibold', balance >= 0 ? 'text-gray-100' : 'text-profit-negative')}>{formatCurrency(balance)}</div>
            {overview && (
              <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
                <span>{t('bankroll.deposits')} <span className="font-mono">{formatCurrency(overview.totals.deposits)}</span></span>
                <span>{t('bankroll.withdrawals')} <span className="font-mono">{formatCurrency(overview.totals.withdrawals)}</span></span>
                <span>{t('bankroll.profit')} <span className="font-mono">{formatCurrency(overview.totals.profit)}</span></span>
              </div>
            )}
          </div>

          {path && (
            <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} preserveAspectRatio="none" className="h-20 w-full" role="img" aria-label={t('bankroll.chart')}>
              <path d={path} fill="none" stroke="#34c27a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="w-28 rounded bg-dark-300 px-2 py-1 text-right font-mono text-gray-100"
              inputMode="decimal"
              aria-label={t('bankroll.amount')}
              placeholder={t('bankroll.amount')}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <input
              className="min-w-0 flex-1 rounded bg-dark-300 px-2 py-1 text-gray-100"
              aria-label={t('bankroll.note')}
              placeholder={t('bankroll.note')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <button type="button" className="rounded bg-primary-500 px-3 py-1 text-sm font-medium text-onprimary" onClick={() => void save(1)}>
              {t('bankroll.deposit')}
            </button>
            <button type="button" className="rounded bg-dark-300 px-3 py-1 text-sm text-gray-200" onClick={() => void save(-1)}>
              {t('bankroll.withdraw')}
            </button>
          </div>
          {invalid && <p className="text-xs text-profit-negative">{t('bankroll.invalid_amount')}</p>}

          {overview && overview.movements.length > 0 && (
            <ul className="space-y-1 text-sm">
              {overview.movements.slice(-RECENT_MOVEMENTS).reverse().map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-gray-300">
                  <span className="truncate">
                    {m.note || (m.amount > 0 ? t('bankroll.deposit') : t('bankroll.withdraw'))}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={clsx('font-mono', m.amount > 0 ? 'text-profit-positive' : 'text-profit-negative')}>{formatCurrency(m.amount)}</span>
                    <button type="button" className="text-xs text-gray-500 hover:text-gray-200" onClick={() => setToDelete(m)}>
                      {t('common.delete')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-dark-200 pt-3">
            <div className="text-[11px] uppercase tracking-[.06em] text-gray-500">{t('bankroll.recommend_title')}</div>
            {balance <= 0 ? (
              <p className="mt-1 text-sm text-gray-500">{t('bankroll.recommend_empty')}</p>
            ) : table.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">{t('bankroll.recommend_no_history')}</p>
            ) : recommendation ? (
              <p className="mt-1 text-sm text-gray-200">
                {t('bankroll.recommended', { buyIn: formatCurrency(recommendation.buyIn), risk: formatPercent((recommendation.risk ?? 0) * 100, 1) })}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-400">{t('bankroll.none_recommended', { threshold: Math.round(RISK_THRESHOLD * 100) })}</p>
            )}
            <ul className="mt-2 space-y-1 text-xs text-gray-400">
              {rows.map((row) => (
                <li key={row.buyIn} className="flex justify-between">
                  <span>{t('bankroll.risk_row', { buyIn: formatCurrency(row.buyIn) })}</span>
                  <span className="font-mono">{row.risk === null ? '—' : formatPercent(row.risk * 100, 1)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </LoadingOverlay>

      <ConfirmDialog
        open={toDelete !== null}
        title={t('bankroll.delete_title')}
        detail={t('bankroll.delete_detail')}
        confirmLabel={t('common.delete')}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  )
}
