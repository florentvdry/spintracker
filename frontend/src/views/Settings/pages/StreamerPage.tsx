import { useEffect } from 'react'
import { Monitor, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useStreamerStore, STREAMER_STATS, type StreamerRange } from '@/stores/streamerStore'
import { ipcService } from '@/services/ipcService'
import { useNotificationStore } from '@/stores/notificationStore'
import Card from '@/components/ui/Card'

export default function StreamerPage() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const {
    settings,
    loaded,
    load,
    setRange,
    setStatEnabled,
    setRefreshMs,
    save,
    isStatEnabled,
  } = useStreamerStore()

  // Load the stored overlay settings when the page opens.
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const handleSave = async () => {
    await save()
    notify.success(t('settings.streamer.saved'), t('common.success'))
  }

  const handleOpenOverlay = async () => {
    const result = await ipcService.openOverlay()
    if (!(result as { success?: boolean }).success) {
      notify.addNotification({
        type: 'error',
        title: t('common.error'),
        message: t('settings.messages.error_server'),
      })
    }
  }

  const rangeOption = (id: StreamerRange, label: string) => (
    <button
      key={id}
      onClick={() => setRange(id)}
      className={clsx('segmented-item', settings.range === id && 'active')}
    >
      {label}
    </button>
  )

  return (
    <div className="space-y-4">
      <Card title={t('settings.streamer.title')} subtitle={t('settings.streamer.subtitle')}>
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-medium text-gray-200 mb-2">{t('settings.streamer.rangeTitle')}</h3>
            <p className="text-xs text-gray-500 mb-3">{t('settings.streamer.rangeHelp')}</p>
            <div className="segmented flex gap-1">
              {rangeOption('session', t('settings.streamer.range.session'))}
              {rangeOption('month', t('settings.streamer.range.month'))}
              {rangeOption('all', t('settings.streamer.range.all'))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-200 mb-2">{t('settings.streamer.statsTitle')}</h3>
            <p className="text-xs text-gray-500 mb-3">{t('settings.streamer.statsHelp')}</p>
            <ul className="divide-y divide-dark-200">
              {STREAMER_STATS.map((stat) => (
                <li key={stat.id} className="py-3">
                  <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
                    <span className="text-gray-100 text-sm font-medium">{t(`settings.streamer.stat.${stat.id}`)}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded bg-dark-500 border border-dark-200 text-primary-500 focus:ring-0"
                      checked={isStatEnabled(stat.id)}
                      onChange={(e) => void setStatEnabled(stat.id, e.target.checked)}
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-0.5">{stat.unit ? stat.unit : '—'}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-100">{t('settings.streamer.refresh')}</span>
            <input
              type="number"
              min={1000}
              max={3600000}
              step={1000}
              value={settings.refreshMs}
              onChange={(e) => {
                const ms = Number(e.target.value)
                if (Number.isFinite(ms)) void setRefreshMs(ms)
              }}
              className="input w-32 font-mono text-right"
            />
            <span className="text-xs text-gray-500">{t('settings.streamer.refreshMs')}</span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => void handleSave()} className="btn-primary flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              {t('common.save')}
            </button>
            <button onClick={() => void handleOpenOverlay()} className="btn-secondary flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              {t('settings.streamer.openOverlay')}
            </button>
          </div>
        </div>
      </Card>

      <p className="text-xs text-gray-500">{t('settings.streamer.openOverlayDesc')}</p>
    </div>
  )
}
