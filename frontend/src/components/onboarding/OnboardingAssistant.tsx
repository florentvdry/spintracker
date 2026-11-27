import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import { ipcService, type AutoImportFolder } from '@/services/ipcService'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useNotificationStore } from '@/stores/notificationStore'

const WATCHABLE_ROOMS: readonly string[] = ['Winamax', 'Unibet']

export default function OnboardingAssistant() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { complete } = useOnboardingStore()
  const detected = useOnboardingStore((s) => s.detected)
  const [folders, setFolders] = useState<AutoImportFolder[]>([])
  const [busy, setBusy] = useState(false)

  // Start from the folders detected on this computer; the user can add or remove any of them.
  useEffect(() => {
    if (detected.length) setFolders(detected)
  }, [detected])

  const contains = (folder: AutoImportFolder) =>
    folders.some((f) => f.room === folder.room && f.path === folder.path)

  const toggleFolder = (folder: AutoImportFolder) =>
    setFolders((prev) => (contains(folder) ? prev.filter((f) => !(f.room === folder.room && f.path === folder.path)) : [...prev, folder]))

  const addFolder = async (room: string) => {
    const path = await ipcService.pickAutoImportFolder()
    if (!path) return
    setFolders((prev) => [...prev.filter((f) => f.path !== path), { room, path }])
  }

  const removeFolder = (folder: AutoImportFolder) =>
    setFolders((prev) => prev.filter((f) => !(f.room === folder.room && f.path === folder.path)))

  const finish = async () => {
    setBusy(true)
    try {
      const error = await complete(folders)
      if (error) {
        notify.addNotification({ type: 'error', title: t('common.error'), message: error })
      } else {
        notify.addNotification({ type: 'success', title: t('common.success'), message: t('onboarding.done') })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen py-12">
      <Card title={t('onboarding.title')} subtitle={t('onboarding.subtitle')} className="w-full max-w-2xl">
        <p className="text-sm text-gray-400 mb-6">{t('onboarding.intro')}</p>

        <div className="space-y-5">
          {WATCHABLE_ROOMS.map((room) => {
            const roomDetected = detected.filter((d) => d.room === room)
            return (
              <div key={room} className="border-t border-dark-200 pt-3 first:border-0">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <span className="text-sm font-medium text-gray-200">{room}</span>
                  <button
                    className="btn-secondary flex items-center gap-2"
                    disabled={busy}
                    onClick={() => void addFolder(room)}
                  >
                    <Plus className="w-4 h-4" />
                    {t('onboarding.addFolder')}
                  </button>
                </div>
                {roomDetected.map((folder) => (
                  <div key={folder.path} className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={contains(folder)}
                      disabled={busy}
                      onChange={() => void toggleFolder(folder)}
                    />
                    <span className="flex-1 truncate font-mono text-sm text-gray-300" title={folder.path}>{folder.path}</span>
                    <span className="text-xs text-gray-500">{t('onboarding.detected')}</span>
                    <button
                      className="p-1 text-gray-400 hover:text-profit-negative shrink-0"
                      title={t('common.delete')}
                      disabled={busy}
                      onClick={() => void removeFolder(folder)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {roomDetected.length === 0 && (
                  <p className="mt-2 text-xs text-gray-500">{t('onboarding.none', { room })}</p>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button className="btn-secondary" disabled={busy} onClick={() => setFolders(detected)}>
            {t('common.refresh')}
          </button>
          <button className="btn-primary" disabled={busy} onClick={finish}>
            {t('onboarding.finish')}
          </button>
        </div>
        {busy && <p className="mt-4 text-sm text-gray-400 text-center">{t('onboarding.saving')}</p>}
      </Card>
    </div>
  )
}
