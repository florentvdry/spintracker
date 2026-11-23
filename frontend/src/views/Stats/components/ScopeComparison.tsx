import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import { ipcService, type Json } from '@/services/ipcService'
import { logError } from '@/utils/log'
import { COMPARED_SCOPES, comparisonRows, type ComparedScope } from '../scopeComparison'

interface Props {
  heroName: string | null
  dateFrom: string | null
  dateTo: string | null
  buyIn: number | null
  /** Changes when the data it reads changes (a custom stat saved, an import). */
  reloadKey: unknown
}

const SCOPE_LABELS: Record<ComparedScope, string> = { me: 'stats.compare_me', reg: 'stats.scope_regs', fish: 'stats.scope_fishs' }

/** The preflop figures of the hero, of the regulars and of the fish, side by side. */
export default function ScopeComparison({ heroName, dateFrom, dateTo, buyIn, reloadKey }: Props) {
  const { t } = useTranslation()
  const [answers, setAnswers] = useState<Record<ComparedScope, Json | null> | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!heroName) {
      setAnswers(null)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const [me, reg, fish] = await Promise.all(COMPARED_SCOPES.map((scope) => ipcService.getDetailedStats(heroName, dateFrom, dateTo, buyIn, scope)))
        if (!cancelled) setAnswers({ me: me.success ? me.data : null, reg: reg.success ? reg.data : null, fish: fish.success ? fish.data : null })
      } catch (error) {
        logError('Failed to load the comparison:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [heroName, dateFrom, dateTo, buyIn, reloadKey])

  const rows = useMemo(() => (answers ? comparisonRows(answers) : []), [answers])

  return (
    <Card title={t('stats.compare_title')} subtitle={t('stats.compare_subtitle')}>
      <LoadingOverlay loading={loading}>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('common.no_data')}</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-dark-400 text-xs text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('stats.compare_stat')}</th>
                  {COMPARED_SCOPES.map((scope) => (
                    <th key={scope} className="px-3 py-2 text-right font-medium">{t(SCOPE_LABELS[scope])}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.stat} className="border-t border-[#1f242c]">
                    <td className="px-3 py-1.5 text-gray-100">{row.stat}</td>
                    {COMPARED_SCOPES.map((scope) => {
                      const figure = row.figures[scope]
                      return (
                        <td key={scope} className="px-3 py-1.5 text-right font-mono">
                          {figure.value === null ? <span className="text-gray-600">–</span> : <span className="text-gray-100">{figure.value}</span>}
                          <span className="ml-1.5 text-[10px] text-gray-500">n={figure.sample}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadingOverlay>
    </Card>
  )
}
