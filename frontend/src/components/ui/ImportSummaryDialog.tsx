import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'
import { ipcService } from '@/services/ipcService'
import { formatCurrency, formatNumber } from '@/utils/formatters'
import Modal from './Modal'

interface ImportSummaryResult {
  handsImported: number
  handsSkipped: number
  filesProcessed: number
  errors: Array<{ file: string; error: string }>
}

interface ImportSummaryDialogProps {
  open: boolean
  onClose: () => void
  result: ImportSummaryResult
}

/** Result of a manual hand history import: imported/skipped hands, files processed, errors,
 * and the current database totals (hands, profit, CEV, tournaments) when available. */
export default function ImportSummaryDialog({ open, onClose, result }: ImportSummaryDialogProps) {
  const { t } = useTranslation()
  const dashboardStats = useAppStore((s) => s.dashboardStats)
  const [totalTournaments, setTotalTournaments] = useState(0)

  // Tournaments are not part of dashboard stats: fetch them separately as optional context.
  useEffect(() => {
    if (!open) return
    let stale = false
    ipcService
      .getTournaments({})
      .then((res) => {
        if (!stale && res.success) setTotalTournaments(Number(res.data?.total ?? 0))
      })
      .catch(() => {
        // Tournaments are optional context; skip silently.
      })
    return () => {
      stale = true
    }
  }, [open])

  const hasErrors = result.errors.length > 0
  const totalHands = dashboardStats?.total_hands ?? null
  const totalProfit = dashboardStats?.total_profit ?? null
  const cev = dashboardStats?.total_ev ?? null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('header.import_summary.title')}
      width={560}
      footer={
        <button className="btn-primary" autoFocus onClick={onClose}>
          {t('common.close')}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Stat label={t('header.import_summary.hands_imported')} value={formatNumber(result.handsImported)} />
          <Stat label={t('header.import_summary.hands_skipped')} value={formatNumber(result.handsSkipped ?? 0)} />
          <Stat label={t('header.import_summary.files_processed')} value={formatNumber(result.filesProcessed)} />
          <Stat
            label={t('header.import_summary.errors')}
            value={hasErrors ? String(result.errors.length) : t('header.import_summary.no_errors')}
          />
        </div>

        {hasErrors && (
          <section className="border border-profit-negative/20 rounded-lg p-3 bg-profit-negative/5">
            <h3 className="text-xs font-semibold text-profit-negative mb-2">
              {t('header.import_summary.errors')}
            </h3>
            <ul className="text-xs text-gray-300 space-y-1 leading-relaxed">
              {result.errors.map((err) => (
                <li key={err.file} className="break-words">
                  {err.file}: {err.error}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(totalHands != null || totalProfit != null || cev != null || totalTournaments > 0) && (
          <section className="pt-2 border-t border-dark-200">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              {t('header.import_summary.totals')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Stat label={t('header.import_summary.total_hands')} value={formatNumber(totalHands)} />
              <Stat label={t('header.import_summary.total_profit')} value={formatCurrency(totalProfit)} />
              <Stat label={t('header.import_summary.cev')} value={formatNumber(cev)} />
              <Stat label={t('header.import_summary.tournaments')} value={formatNumber(totalTournaments)} />
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="font-mono text-sm font-medium text-gray-100">{value}</span>
    </div>
  )
}
