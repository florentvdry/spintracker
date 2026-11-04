import { useTranslation } from 'react-i18next'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useCustomStatsStore } from '@/stores/customStatsStore'
import { LOW_SAMPLE, type CustomStat } from './customStatModel'

/** One row of the `customStats` list of the detailed statistics. */
export interface CustomStatFigure {
  id: number
  name: string
  ready: boolean
  num: number | null
  den: number | null
  pct: number | null
}

interface Props {
  figures: CustomStatFigure[]
  onCreate: () => void
  onEdit: (stat: CustomStat) => void
  onDuplicate: (stat: CustomStat) => void
}

const lowSample = (figure: CustomStatFigure) => figure.ready && (figure.den ?? 0) < LOW_SAMPLE

const iconButton = 'text-gray-500 hover:text-white'

/** The user's own stats over the hands the Statistics page currently selects. */
export default function CustomStatsPanel({ figures, onCreate, onEdit, onDuplicate }: Props) {
  const { t } = useTranslation()
  const stats = useCustomStatsStore((s) => s.stats)
  const computing = useCustomStatsStore((s) => s.computing)
  const progress = useCustomStatsStore((s) => s.progress)
  const remove = useCustomStatsStore((s) => s.remove)

  return (
    <section className="mt-4 rounded-lg border border-dark-100 bg-dark-400 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">{t('customStats.table_title')}</h2>
          {computing && (
            <p className="text-xs text-gray-400">
              {progress ? t('customStats.computing_progress', { done: progress.done, total: progress.total }) : t('customStats.computing')}
            </p>
          )}
        </div>
        <button type="button" className="inline-flex items-center gap-1 rounded border border-dark-100 bg-dark-300 px-2 py-1 text-xs text-gray-200 hover:border-primary-500" onClick={onCreate}>
          <Plus className="h-3 w-3" /> {t('customStats.new')}
        </button>
      </div>

      {figures.length === 0 ? (
        <p className="text-xs text-gray-500">{t('customStats.empty')}</p>
      ) : (
        <table className="w-full text-left text-xs text-gray-200">
          <thead className="text-gray-500">
            <tr>
              <th className="py-1 font-medium">{t('customStats.name')}</th>
              <th className="py-1 text-right font-medium">%</th>
              <th className="py-1 text-right font-medium">{t('customStats.sample')}</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {figures.map((figure) => {
              const stat = stats.find((s) => s.id === figure.id)
              return (
                <tr key={figure.id} className={clsx('border-t border-dark-100', lowSample(figure) && 'opacity-60')} title={lowSample(figure) ? t('customStats.low_sample', { count: LOW_SAMPLE }) : undefined}>
                  <td className="py-1.5">{figure.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{figure.ready && figure.pct !== null ? `${figure.pct.toFixed(1)}%` : t('customStats.pending')}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-400">{figure.ready ? `${figure.num ?? 0} / ${figure.den ?? 0}` : ''}</td>
                  <td className="py-1.5 text-right">
                    <span className="inline-flex gap-2">
                      <button type="button" className={iconButton} aria-label={t('customStats.duplicate')} disabled={!stat} onClick={() => stat && onDuplicate(stat)}>
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className={iconButton} aria-label={t('customStats.edit')} disabled={!stat} onClick={() => stat && onEdit(stat)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-gray-500 hover:text-red-400"
                        aria-label={t('customStats.delete')}
                        onClick={() => {
                          if (window.confirm(t('customStats.delete_confirm'))) void remove(figure.id)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
