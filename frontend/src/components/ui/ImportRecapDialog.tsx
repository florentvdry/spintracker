import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ArrowRight, Calendar, Clock, TrendingDown, TrendingUp } from 'lucide-react'
import type { Json } from '@/services/ipcService'
import { formatCurrency, formatDate, formatNumber, formatProfit } from '@/utils/formatters'

interface ImportRecapData {
  handsImported: number
  handsSkipped: number
  filesProcessed: number
  sessions: Json[]
  dashboardStats: Json | null
}

interface ImportRecapDialogProps {
  open: boolean
  onClose: () => void
  data: ImportRecapData
}

/** Pop-up shown after a successful hand import: import counts, the new sessions, and overall stats. */
export default function ImportRecapDialog({ open, onClose, data }: ImportRecapDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  const sessions = data.sessions ?? []
  const stats = data.dashboardStats ?? {}
  const totalProfit = Number(stats.total_profit) || 0
  const totalHands = Number(stats.total_hands) || 0
  const totalEV = Number(stats.total_ev) || 0

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t('import.title')}
        className="max-w-full max-h-[90vh] flex flex-col rounded-[14px] border border-dark-200 bg-dark-400 shadow-xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h3 className="text-lg font-semibold text-gray-100">{t('import.title')}</h3>
        </div>

        <div className="px-6 pb-4 overflow-y-auto">
          {/* Import summary */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-dark-200 bg-dark-300/50">
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <ArrowRight className="w-4 h-4 text-primary-400" />
                <span>{t('import.files_processed', { count: data.filesProcessed })}</span>
              </div>
              <span className="text-sm font-mono font-medium text-gray-200">
                {data.filesProcessed}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-dark-200 bg-dark-300/50">
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <span className="text-profit-positive">{data.handsImported}</span> {t('import.hands_imported')}
              </div>
              <span className="text-sm font-mono font-medium text-gray-200">
                {data.handsImported}
              </span>
            </div>
            {data.handsSkipped > 0 && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-dark-200 bg-dark-300/50">
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <span className="text-gray-500">{data.handsSkipped}</span> {t('import.hands_skipped', { count: data.handsSkipped })}
                </div>
                <span className="text-sm font-mono font-medium text-gray-400">{data.handsSkipped}</span>
              </div>
            )}
          </div>

          {/* Sessions */}
          <div className="mt-6 mb-2 flex items-center gap-2 border-b border-dark-200 pb-1">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-200 uppercase tracking-wider">{t('import.sessions')}</span>
          </div>
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <div className="px-3 py-2 text-center text-gray-500 text-sm">{t('import.no_sessions')}</div>
            ) : (
              sessions.slice(0, 5).map((session) => (
                <div
                  key={session.session_date}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-dark-200 bg-dark-300/50"
                >
                  <div className="flex items-center gap-2 text-sm text-gray-300 min-w-0">
                    <span className="text-gray-400">{formatDate(session.session_date)}</span>
                    <span className="ml-2 text-xs text-gray-500">→</span>
                    <span className="text-gray-400">{formatDate(session.session_end)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono text-gray-200">
                    <div className="flex items-center gap-1">
                      <span className={session.profit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}>
                        {session.profit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      </span>
                      {formatCurrency(session.profit)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-500" />
                      <span>{session.tournaments ?? 0} {t('common.tournaments')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>{session.hands_played ?? 0} {t('common.hands')}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Overall stats */}
          <div className="mt-6 mb-2 flex items-center gap-2 border-b border-dark-200 pb-1">
            <span className="text-sm font-semibold text-gray-200 uppercase tracking-wider">{t('import.stats')}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatValue label={t('import.total_profit')} value={formatProfit(totalProfit)} classProfit={totalProfit} />
            <StatValue label={t('import.total_hands')} value={formatNumber(totalHands)} />
            <StatValue label={t('import.total_ev')} value={formatProfit(totalEV)} classProfit={totalEV} />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-200">
          <button
            className="btn-secondary"
            autoFocus
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function StatValue({
  label,
  value,
  classProfit,
}: {
  label: string
  value: string
  classProfit?: number
}) {
  return (
    <div className="px-3 py-2 rounded-lg border border-dark-200 bg-dark-300/50">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p
        className={clsx('text-sm font-mono font-medium', classProfit !== undefined &&
          (classProfit > 0 ? 'text-profit-positive' : classProfit < 0 ? 'text-profit-negative' : 'text-gray-200'))}
      >
        {value}
      </p>
    </div>
  )
}
