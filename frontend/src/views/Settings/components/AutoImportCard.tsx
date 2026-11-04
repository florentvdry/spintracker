import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Info, Trash2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import { ipcService, type AutoImportFolder } from '@/services/ipcService'
import { useAutoImportStore } from '@/stores/autoImportStore'
import { useNotificationStore } from '@/stores/notificationStore'

const WATCHABLE_ROOMS = ['Winamax'] as const

export default function AutoImportCard() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { enabled, folders, detected, status, loaded, load, save } = useAutoImportStore()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  const persist = async (nextEnabled: boolean, nextFolders: AutoImportFolder[]) => {
    setBusy(true)
    try {
      const error = await save(nextEnabled, nextFolders)
      if (error) notify.addNotification({ type: 'error', title: t('common.error'), message: error })
    } finally {
      setBusy(false)
    }
  }

  const addFolder = async (room: string) => {
    const path = await ipcService.pickAutoImportFolder()
    if (path) await persist(enabled, [...folders.filter((f) => !(f.room === room && f.path === path)), { room, path }])
  }

  const removeFolder = (folder: AutoImportFolder) =>
    persist(enabled, folders.filter((f) => !(f.room === folder.room && f.path === folder.path)))

  const suggestions = detected.filter((d) => !folders.some((f) => f.room === d.room && f.path === d.path))

  return (
    <Card title={t('auto_import.title')} subtitle={t('auto_import.subtitle')}>
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-4 py-2">
          <span className="text-white font-medium">{t('auto_import.enable')}</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={enabled}
            disabled={!loaded || busy}
            onChange={(e) => void persist(e.target.checked, folders)}
          />
        </label>

        {WATCHABLE_ROOMS.map((room) => (
          <div key={room} className="border-t border-dark-100/30 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-200">{room}</p>
              <button className="btn-secondary flex items-center gap-2" disabled={busy} onClick={() => void addFolder(room)}>
                <FolderOpen className="w-4 h-4" />
                {t('auto_import.choose_folder')}
              </button>
            </div>
            {folders.filter((f) => f.room === room).map((folder) => (
              <div key={folder.path} className="mt-2 flex items-center gap-2 text-sm text-gray-300">
                <span className="flex-1 truncate font-mono text-xs" title={folder.path}>{folder.path}</span>
                <button className="p-1 text-gray-400 hover:text-profit-negative" title={t('common.delete')} onClick={() => void removeFolder(folder)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {suggestions.filter((s) => s.room === room).map((folder) => (
              <div key={folder.path} className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                <span className="flex-1 truncate font-mono text-xs" title={folder.path}>{folder.path}</span>
                <button className="text-xs text-primary-400 hover:text-primary-300" disabled={busy} onClick={() => void persist(enabled, [...folders, folder])}>
                  {t('auto_import.use_detected')}
                </button>
              </div>
            ))}
          </div>
        ))}

        <div className="flex gap-3 rounded-lg bg-dark-200 p-3 text-sm text-gray-400">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{t('auto_import.manual_rooms')}</p>
        </div>

        {status.state === 'error' && status.message && <p className="text-sm text-red-400">{status.message}</p>}
      </div>
    </Card>
  )
}
