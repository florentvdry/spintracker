import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader } from 'lucide-react'
import Card from '@/components/ui/Card'
import { useNotificationStore } from '@/stores/notificationStore'
import { useOnboardingStore } from '@/stores/onboardingStore'

export default function OnboardingWizard() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { rooms, loading, load, select, finish } = useOnboardingStore()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  const toggleAll = (checked: boolean) => {
    for (const room of rooms) void select(room.room, checked)
  }

  const handleFinish = async () => {
    setBusy(true)
    try {
      await finish()
    } catch {
      notify.addNotification({ type: 'error', title: t('common.error'), message: t('common.error') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('onboarding.title')} subtitle={t('onboarding.subtitle')}>
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <Loader className="w-6 h-6 animate-spin mb-2" />
            <p>{t('onboarding.detecting')}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400">{t('onboarding.note')}</p>
            <label className="flex items-center justify-between gap-4 py-2 border-b border-dark-200 pb-2">
              <span className="text-gray-100 font-medium">{t('onboarding.select_all')}</span>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={rooms.length > 0 && rooms.every((r) => r.selected)}
                onChange={(e) => void toggleAll(e.target.checked)}
                disabled={rooms.length === 0}
              />
            </label>
            <div className="overflow-x-auto border border-dark-200 rounded-lg">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-gray-500 border-b border-dark-200">
                    <th className="w-12 p-3"></th>
                    <th className="p-3">{t('onboarding.room')}</th>
                    <th className="p-3">{t('onboarding.path')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.path} className="border-b border-dark-200 last:border-b-0">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={room.selected}
                          onChange={(e) => void select(room.room, e.target.checked)}
                        />
                      </td>
                      <td className="p-3 text-gray-200 font-medium truncate">{room.room}</td>
                      <td className="p-3 text-gray-400 font-mono text-xs truncate" title={room.path}>
                        {room.path}
                      </td>
                    </tr>
                  ))}
                  {rooms.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-gray-500">
                        {t('onboarding.detecting')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button
              disabled={busy || rooms.length === 0}
              onClick={() => void handleFinish()}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t('onboarding.finish')}
            </button>
          </>
        )}
      </div>
    </Card>
  )
}
