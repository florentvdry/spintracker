import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Download, Loader, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ipcService } from '@/services/ipcService'
import { useNotificationStore } from '@/stores/notificationStore'
import {
  availableBuyIns,
  availableRooms,
  buildFilter,
  formatBytes,
  handsByRoom,
  periodRange,
  summarize,
  type ExportBucket,
  type ExportGrouping,
  type ExportPeriod,
} from '@/utils/exportFilter'
import { formatCurrency, formatNumber } from '@/utils/formatters'
import { logError } from '@/utils/log'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
}

const PERIODS: { id: ExportPeriod; labelKey: string }[] = [
  { id: 'all', labelKey: 'export.dialog.period_all' },
  { id: 'last12Months', labelKey: 'export.dialog.period_last_12_months' },
  { id: 'last30Days', labelKey: 'export.dialog.period_last_30_days' },
  { id: 'custom', labelKey: 'common.custom' },
]

const GROUPINGS: ExportGrouping[] = ['day', 'month', 'single']

const CHIP = 'h-11 px-4 rounded-lg border text-sm font-medium flex items-center gap-2.5 transition-colors'
const CHIP_ON = 'border-primary-500 bg-primary-500/15 text-gray-100'
const CHIP_OFF = 'border-dark-100 bg-dark-500 text-gray-300 hover:border-gray-500'
const SECTION_TITLE = 'text-xs font-semibold uppercase tracking-wider text-gray-500'
const DATE_INPUT = 'h-11 px-3 rounded-lg bg-dark-500 border border-dark-100 text-sm text-gray-100'

/** Lets the user narrow the hand history export by period, room and buy-in before choosing the file. */
export default function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { t, i18n } = useTranslation()
  const notify = useNotificationStore()

  const [buckets, setBuckets] = useState<ExportBucket[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [period, setPeriod] = useState<ExportPeriod>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [rooms, setRooms] = useState<ReadonlySet<string>>(new Set())
  const [buyIns, setBuyIns] = useState<ReadonlySet<number>>(new Set())
  const [grouping, setGrouping] = useState<ExportGrouping>('day')

  // Reads what the database holds each time the dialog opens, and ignores a late answer after closing.
  useEffect(() => {
    if (!open) return
    let stale = false
    setBuckets(null)
    setLoadFailed(false)
    ipcService
      .getExportSummary()
      .then((result) => {
        if (stale) return
        if (!result.success || !result.data) throw new Error(result.message ?? 'Export summary unavailable')
        setBuckets(result.data)
        setRooms(new Set(availableRooms(result.data)))
        setBuyIns(new Set(availableBuyIns(result.data)))
      })
      .catch((error: unknown) => {
        if (stale) return
        logError('Export summary failed', error)
        setLoadFailed(true)
      })
    return () => {
      stale = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !exporting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, exporting, onClose])

  const locale = i18n.language
  const today = useMemo(() => new Date(), [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const selection = useMemo(
    () => ({ period, customFrom, customTo, rooms, buyIns, grouping }),
    [period, customFrom, customTo, rooms, buyIns, grouping],
  )
  const roomOptions = useMemo(() => (buckets ? availableRooms(buckets) : []), [buckets])
  const buyInOptions = useMemo(() => (buckets ? availableBuyIns(buckets) : []), [buckets])
  const roomCounts = useMemo(
    () => (buckets ? handsByRoom(buckets, periodRange(selection, today)) : new Map<string, number>()),
    [buckets, selection, today],
  )
  const filter = useMemo(() => (buckets ? buildFilter(selection, buckets, today) : null), [buckets, selection, today])
  const summary = useMemo(() => (buckets && filter ? summarize(buckets, filter) : null), [buckets, filter])

  if (!open) return null

  const toggle = <T,>(set: ReadonlySet<T>, value: T, apply: (next: ReadonlySet<T>) => void) => {
    const next = new Set(set)
    if (!next.delete(value)) next.add(value)
    apply(next)
  }

  const handleExport = async () => {
    if (!filter) return
    setExporting(true)
    try {
      const result = await ipcService.exportData(t('export.dialog_title'), filter)
      if (result.success) {
        notify.success(t('export.success', { count: result.fileCount }), t('settings.messages.export_success_title'))
        onClose()
      } else if (result.message !== 'Export cancelled') {
        notify.error(result.message ?? t('settings.messages.error_unknown'), t('common.error'))
      }
    } catch (error) {
      logError('Export failed', error)
      notify.error(error instanceof Error ? error.message : String(error), t('common.error'))
    } finally {
      setExporting(false)
    }
  }

  const hands = summary?.hands ?? 0
  const canExport = !exporting && hands > 0

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => !exporting && onClose()}>
      <div
        className="bg-dark-400 rounded-2xl w-full max-w-[700px] max-h-full overflow-y-auto shadow-xl border border-dark-200 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-7 pt-6 pb-5 border-b border-dark-200">
          <div>
            <h2 id="export-dialog-title" className="text-xl font-semibold text-gray-100">{t('export.dialog.title')}</h2>
            <p className="mt-1.5 text-sm text-gray-400">{t('export.dialog.subtitle')}</p>
          </div>
          <button
            className="-mr-2.5 -mt-2 w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-dark-300"
            aria-label={t('common.close')}
            disabled={exporting}
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loadFailed && <p className="px-7 py-8 text-sm text-profit-negative">{t('export.dialog.load_error')}</p>}
        {!loadFailed && !buckets && (
          <div className="px-7 py-10 flex items-center gap-3 text-sm text-gray-400">
            <Loader className="w-4 h-4 animate-spin" /> {t('common.loading')}
          </div>
        )}
        {buckets && buckets.length === 0 && <p className="px-7 py-8 text-sm text-gray-400">{t('export.dialog.no_data')}</p>}

        {buckets && buckets.length > 0 && (
          <div className="flex flex-col gap-6 px-7 py-6">
            <section className="flex flex-col gap-3">
              <h3 className={SECTION_TITLE}>{t('export.dialog.period')}</h3>
              <div className="flex flex-wrap gap-2">
                {PERIODS.map((p) => (
                  <button key={p.id} aria-pressed={period === p.id} className={clsx(CHIP, period === p.id ? CHIP_ON : CHIP_OFF)} onClick={() => setPeriod(p.id)}>
                    {t(p.labelKey)}
                  </button>
                ))}
              </div>
              {period === 'custom' && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1.5 text-xs text-gray-400">
                    {t('common.from')}
                    <input type="date" className={DATE_INPUT} value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs text-gray-400">
                    {t('common.to')}
                    <input type="date" className={DATE_INPUT} value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
                  </label>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className={SECTION_TITLE}>{t('export.dialog.rooms')}</h3>
                <span className="text-xs text-gray-500">{t('export.dialog.rooms_hint')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {roomOptions.map((room) => {
                  const on = rooms.has(room)
                  return (
                    <button key={room} aria-pressed={on} className={clsx(CHIP, on ? CHIP_ON : CHIP_OFF)} onClick={() => toggle(rooms, room, setRooms)}>
                      <span className={clsx('w-[18px] h-[18px] rounded flex items-center justify-center', on ? 'bg-primary-500' : 'border-[1.5px] border-gray-500')}>
                        {on && <Check className="w-3 h-3 text-onprimary" strokeWidth={3.5} />}
                      </span>
                      {room}
                      <span className="font-mono text-xs text-gray-400">{formatNumber(roomCounts.get(room) ?? 0, { locale })}</span>
                    </button>
                  )
                })}
              </div>
            </section>

            {buyInOptions.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className={SECTION_TITLE}>{t('export.dialog.buy_ins')}</h3>
                <div className="flex flex-wrap gap-2">
                  {buyInOptions.map((buyIn) => (
                    <button key={buyIn} aria-pressed={buyIns.has(buyIn)} className={clsx(CHIP, buyIns.has(buyIn) ? CHIP_ON : CHIP_OFF)} onClick={() => toggle(buyIns, buyIn, setBuyIns)}>
                      {formatCurrency(buyIn)}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-3">
              <h3 className={SECTION_TITLE}>{t('export.dialog.grouping')}</h3>
              <div role="group" aria-label={t('export.dialog.grouping')} className="flex flex-wrap gap-1 p-1 rounded-xl bg-dark-500 border border-dark-200">
                {GROUPINGS.map((g) => (
                  <button
                    key={g}
                    aria-pressed={grouping === g}
                    className={clsx('flex-1 min-w-[150px] h-11 rounded-lg text-sm', grouping === g ? 'bg-dark-200 text-gray-100 font-semibold' : 'text-gray-400 hover:text-gray-200')}
                    onClick={() => setGrouping(g)}
                  >
                    {t(`export.dialog.grouping_${g}`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">{t(`export.dialog.grouping_${grouping}_hint`)}</p>
            </section>
          </div>
        )}

        {buckets && buckets.length > 0 && summary && (
          <div className="flex flex-wrap items-center justify-between gap-4 px-7 py-5 border-t border-dark-200 bg-dark-600 rounded-b-2xl">
            <div className="flex gap-7">
              <Stat value={formatNumber(summary.hands, { locale })} label={t('export.dialog.stat_hands')} />
              <Stat value={formatNumber(summary.files, { locale })} label={t('export.dialog.stat_files')} />
              <Stat value={formatBytes(summary.bytes, locale)} label={t('export.dialog.stat_size')} />
            </div>
            <div className="flex gap-2.5">
              <button className="btn-secondary h-11" onClick={onClose} disabled={exporting}>{t('common.cancel')}</button>
              <button className="btn-primary h-11 flex items-center gap-2" disabled={!canExport} onClick={() => void handleExport()}>
                {exporting ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {hands > 0 ? t('export.dialog.export_button', { amount: formatNumber(hands, { locale }) }) : t('export.dialog.export_none')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xl font-medium text-gray-100">{value}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  )
}
