import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { useSessionSummaryStore } from '@/stores/sessionSummaryStore'

/** How long the player must be idle before the summary of the last session pops up. */
export default function SessionSummarySettings() {
  const { t } = useTranslation()
  const minutes = useSessionSummaryStore((s) => s.inactivityMinutes)
  const setMinutes = useSessionSummaryStore((s) => s.setInactivityMinutes)

  return (
    <Card title={t('session_summary.settings_title')} subtitle={t('session_summary.settings_subtitle')}>
      <label className="flex items-center gap-3 text-sm text-gray-100">
        <input className="input w-24 font-mono" type="number" min={0} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        <span className="text-gray-400">{t('session_summary.minutes')}</span>
      </label>
    </Card>
  )
}
