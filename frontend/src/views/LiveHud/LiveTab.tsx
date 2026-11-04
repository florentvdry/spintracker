import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import Card from '@/components/ui/Card'
import { useLiveHudStore } from '@/stores/liveHudStore'

export default function LiveTab() {
  const { t } = useTranslation()
  const { settings, setEnabled, setActiveProfile } = useLiveHudStore()

  return (
    <div className="space-y-4">
      <Card title={t('liveHud.live.status')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium text-white">{settings.enabled ? t('liveHud.live.on') : t('liveHud.live.off')}</p>
            <p className="text-sm text-gray-400">{t('liveHud.live.off_by_default')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t('liveHud.live.enable')}
          </label>
        </div>
      </Card>

      <Card title={t('liveHud.live.active_profile')}>
        <div className="flex flex-wrap gap-2">
          {settings.profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProfile(p.id)}
              className={
                p.id === settings.activeProfileId
                  ? 'rounded-md border border-primary-500 bg-primary-500 px-3 py-1.5 text-sm text-white'
                  : 'rounded-md border border-dark-100 px-3 py-1.5 text-sm text-gray-300'
              }
            >
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      <Card title={t('liveHud.live.tables')}>
        <div className="flex gap-3 rounded-lg bg-dark-200 p-3 text-sm text-gray-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t('liveHud.live.no_detection')}</p>
        </div>
      </Card>
    </div>
  )
}
