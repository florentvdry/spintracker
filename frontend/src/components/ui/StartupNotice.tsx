import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/stores/appStore'

/** Shown in place of the views while the backend opens the database (migration, statistics update). */
export default function StartupNotice() {
  const { t } = useTranslation()
  const backfill = useAppStore((s) => s.backfill)
  const error = useAppStore((s) => s.error)

  if (error) {
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md text-center">
        <h2 className="text-lg font-semibold text-gray-100">{t('startup.failed_title')}</h2>
        <p className="mt-2 text-sm text-gray-400">{error}</p>
      </div>
    )
  }

  const percent = backfill && backfill.total > 0 ? Math.min(100, Math.round((backfill.done * 100) / backfill.total)) : null

  return (
    <div role="status" className="mx-auto mt-24 max-w-md text-center">
      <div className="spinner mx-auto" />
      <h2 className="mt-4 text-lg font-semibold text-gray-100">{t('startup.title')}</h2>
      <p className="mt-2 text-sm text-gray-400">{t('startup.hint')}</p>
      {backfill && percent !== null && (
        <div className="mt-4">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-sm text-gray-400">
            {t('startup.statistics', { done: backfill.done.toLocaleString(), total: backfill.total.toLocaleString(), percent })}
          </p>
        </div>
      )}
    </div>
  )
}
