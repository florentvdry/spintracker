import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import { ipcService } from '@/services/ipcService'
import { buyInParam, currentDateRange, useFilterStore } from '@/stores/filterStore'
import {
  BAD_BEAT_EQUITY,
  BAD_BEAT_WINDOW,
  parseBounded,
  sortedMultipliers,
  type CevBreakdown,
  type CevBucket,
  type TableMixKey,
} from '@/utils/cevBreakdown'
import { formatNumber } from '@/utils/formatters'
import { logError } from '@/utils/log'

const TABLE_MIX_ORDER: TableMixKey[] = ['fish_only', 'mixed', 'reg_only']
const EMPTY_BUCKET: CevBucket = { hands: 0, ev: 0 }
const STORAGE_KEYS = { window: 'spintracker.badBeatWindow', equity: 'spintracker.badBeatEquity' }

/** The bad-beat settings are a per-viewer convenience: they are kept in the browser, not in the database. */
function readStored(key: string, fallback: number): number {
  try {
    const parsed = parseBounded(window.localStorage.getItem(key) ?? '', 0, Number.MAX_SAFE_INTEGER)
    return parsed ?? fallback
  } catch {
    // Storage can be blocked (private window): the default still works for this session.
    return fallback
  }
}

function storeValue(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Same as above: losing the remembered value only resets it on the next launch.
  }
}

/** Chip EV by table mix, multiplier, progress and the tournaments after a bad beat. Sums, in chips. */
export default function CevBreakdownCard() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)
  const customDateFrom = useFilterStore((s) => s.customDateFrom)
  const customDateTo = useFilterStore((s) => s.customDateTo)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const buyIn = useFilterStore((s) => s.buyIn)

  const [windowValue, setWindowValue] = useState(() => readStored(STORAGE_KEYS.window, BAD_BEAT_WINDOW.default))
  const [equityValue, setEquityValue] = useState(() => readStored(STORAGE_KEYS.equity, BAD_BEAT_EQUITY.default))
  const [data, setData] = useState<CevBreakdown | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!heroName) {
      setData(null)
      return
    }
    let active = true
    setLoading(true)
    const { dateFrom, dateTo } = currentDateRange()
    ipcService
      .getCevBreakdown({ heroName, dateFrom, dateTo, buyIn: buyInParam(buyIn), badBeatWindow: windowValue, badBeatEquity: equityValue })
      .then((result) => {
        if (active) setData(result.success ? (result.data as CevBreakdown) : null)
      })
      .catch((error: unknown) => logError('cev breakdown failed', error))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // The date range and session are read through currentDateRange() when the request is sent.
  }, [heroName, dateRange, customDateFrom, customDateTo, selectedSession, buyIn, windowValue, equityValue])

  const onWindowChange = (raw: string) => {
    const value = parseBounded(raw, BAD_BEAT_WINDOW.min, BAD_BEAT_WINDOW.max)
    if (value === null) return
    setWindowValue(value)
    storeValue(STORAGE_KEYS.window, value)
  }

  const onEquityChange = (raw: string) => {
    const value = parseBounded(raw, BAD_BEAT_EQUITY.min, BAD_BEAT_EQUITY.max)
    if (value === null) return
    setEquityValue(value)
    storeValue(STORAGE_KEYS.equity, value)
  }

  const hasHands = data !== null && Object.values(data.by_progress).some((bucket) => bucket.hands > 0)

  return (
    <Card title={t('cev_breakdown.title')} subtitle={t('cev_breakdown.subtitle')}>
      <LoadingOverlay loading={loading}>
        {!data || !hasHands ? (
          <p className="text-sm text-gray-500">{t('cev_breakdown.empty')}</p>
        ) : (
          <div className="space-y-4">
            <Section title={t('cev_breakdown.table_mix')}>
              {TABLE_MIX_ORDER.map((key) => (
                <BucketRow key={key} label={t(`cev_breakdown.${key}`)} bucket={data.by_table_mix[key] ?? EMPTY_BUCKET} />
              ))}
            </Section>

            <Section title={t('cev_breakdown.multiplier')}>
              {sortedMultipliers(data.by_multiplier).map(([multiplier, bucket]) => (
                <BucketRow key={multiplier} label={`${multiplier}×`} bucket={bucket} />
              ))}
            </Section>

            <Section title={t('cev_breakdown.progress')}>
              {data.by_progress.map((bucket, index) => (
                <BucketRow key={index} label={t('cev_breakdown.progress_part', { index: index + 1 })} bucket={bucket} />
              ))}
            </Section>

            <Section title={t('cev_breakdown.bad_beat')}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-300">
                <label className="flex items-center gap-2">
                  {t('cev_breakdown.bad_beat_window')}
                  <input
                    className="w-16 rounded bg-dark-300 px-2 py-1 text-right font-mono text-gray-100"
                    inputMode="numeric"
                    defaultValue={windowValue}
                    onChange={(event) => onWindowChange(event.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2">
                  {t('cev_breakdown.bad_beat_equity')}
                  <input
                    className="w-16 rounded bg-dark-300 px-2 py-1 text-right font-mono text-gray-100"
                    inputMode="decimal"
                    defaultValue={equityValue}
                    onChange={(event) => onEquityChange(event.target.value)}
                  />
                </label>
              </div>
              <BucketRow
                label={t('cev_breakdown.bad_beat_summary', {
                  tournaments: data.after_bad_beat.tournaments,
                  bad_beats: data.after_bad_beat.bad_beats,
                })}
                bucket={{ hands: data.after_bad_beat.tournaments, ev: data.after_bad_beat.ev }}
                unit="tournaments"
              />
              <p className="pt-1 text-xs text-gray-500">{t('cev_breakdown.bad_beat_definition')}</p>
            </Section>
          </div>
        )}
      </LoadingOverlay>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] uppercase tracking-[.06em] text-gray-500">{title}</div>
      {children}
    </div>
  )
}

function BucketRow({ label, bucket, unit = 'hands' }: { label: string; bucket: CevBucket; unit?: 'hands' | 'tournaments' }) {
  const { t } = useTranslation()
  const positive = bucket.ev >= 0
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-gray-300">{label}</span>
      <span className="flex items-center gap-3">
        <span className="text-xs text-gray-500">{t(`cev_breakdown.count_${unit}`, { count: bucket.hands })}</span>
        <span className={clsx('w-20 text-right font-mono font-medium', positive ? 'text-profit-positive' : 'text-profit-negative')}>
          {`${positive && bucket.ev > 0 ? '+' : ''}${formatNumber(bucket.ev, { decimals: 1 })}`}
        </span>
      </span>
    </div>
  )
}
