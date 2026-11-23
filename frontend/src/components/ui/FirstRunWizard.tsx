import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/ui/Modal'
import RoomLogo from '@/components/common/RoomLogo'
import { ipcService } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { useAutoImportStore } from '@/stores/autoImportStore'
import { runImport } from '@/utils/runImport'
import { logError } from '@/utils/log'

const DONE_KEY = 'spintracker-first-run-done'

const wasDone = (): boolean => {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return false
  }
}

const markDone = () => {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    // The wizard may come back next time; nothing else depends on it.
  }
}

/** The first launch: finds where Winamax, Unibet and Betclic keep their histories and imports them. */
export default function FirstRunWizard() {
  const { t } = useTranslation()
  const isInitialized = useAppStore((s) => s.isInitialized)
  const { historyFolders, folders, load, save } = useAutoImportStore()
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [watch, setWatch] = useState(true)

  // The wizard shows once, on a database that holds no hand yet.
  useEffect(() => {
    if (!isInitialized || wasDone()) return
    void (async () => {
      // Only an empty database gets the wizard: a player with hands has been through this.
      const active = await ipcService.getActiveDatabase()
      if (active.success && (active.data?.handsCount ?? 0) === 0 && !wasDone()) {
        await load()
        setOpen(true)
      }
    })()
  }, [isInitialized, load])

  useEffect(() => {
    setChecked(new Set(historyFolders.map((f) => f.path)))
  }, [historyFolders])

  if (!open) return null

  const close = () => {
    markDone()
    setOpen(false)
  }

  const start = async () => {
    const picked = historyFolders.filter((f) => checked.has(f.path))
    try {
      if (watch) {
        const watched = picked.filter((f) => f.watchable).map((f) => ({ room: f.room, path: f.path }))
        const merged = [...folders, ...watched.filter((w) => !folders.some((f) => f.room === w.room && f.path === w.path))]
        if (watched.length > 0) await save(true, merged)
      }
      markDone()
      setOpen(false)
      if (picked.length > 0) await runImport(() => ipcService.importDetectedFolders(picked.map((f) => f.path)), t)
    } catch (error) {
      logError('The first-run import failed:', error)
    }
  }

  const toggle = (path: string) =>
    setChecked((current) => {
      const next = new Set(current)
      if (!next.delete(path)) next.add(path)
      return next
    })

  return (
    <Modal open title={t('wizard.title')} onClose={close} width={560}>
      <div className="space-y-4 text-sm text-gray-200">
        <p className="text-gray-400">{historyFolders.length > 0 ? t('wizard.found') : t('wizard.none')}</p>
        {historyFolders.length > 0 && (
          <ul className="space-y-1.5">
            {historyFolders.map((folder) => (
              <li key={folder.path}>
                <label className="flex items-center gap-3 rounded-lg border border-dark-200 bg-dark-300 px-3 py-2">
                  <input type="checkbox" checked={checked.has(folder.path)} onChange={() => toggle(folder.path)} />
                  <RoomLogo room={folder.room} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{folder.room}</span>
                    <span className="block truncate font-mono text-[11px] text-gray-500">{folder.path}</span>
                  </span>
                  {!folder.watchable && <span className="text-[11px] text-gray-500">{t('wizard.manual')}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {historyFolders.some((f) => f.watchable) && (
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} />
            {t('wizard.watch')}
          </label>
        )}
        <p className="text-xs text-gray-500">{t('wizard.later')}</p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={close}>{t('wizard.skip')}</button>
          {historyFolders.length > 0 && (
            <button className="btn-primary" disabled={checked.size === 0} onClick={() => void start()}>
              {t('wizard.import')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
