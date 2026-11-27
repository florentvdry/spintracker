import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/ui/Modal'
import { useAutoImportStore } from '@/stores/autoImportStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { FIRST_LAUNCH_KEY, shouldOfferSetup } from '@/utils/firstLaunch'
import { logError } from '@/utils/log'

/** Offers to watch the history folders found in the default locations, the first time the app opens. */
export default function FirstLaunchWizard() {
  const { t } = useTranslation()
  const { enabled, folders, detected, loaded, load, save } = useAutoImportStore()
  const notify = useNotificationStore()
  const [dismissed, setDismissed] = useState(() => readDismissed())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    if (loaded) setOpen(shouldOfferSetup({ enabled, folders, detected, dismissed }))
  }, [loaded, enabled, folders, detected, dismissed])

  const finish = () => {
    writeDismissed()
    setDismissed(true)
    setOpen(false)
  }

  const watch = async () => {
    setBusy(true)
    try {
      const error = await save(true, detected)
      if (error) notify.error(t('first_launch.failed'))
      else notify.success(t('first_launch.watching'))
      finish()
    } catch (error: unknown) {
      logError('first launch setup failed', error)
      notify.error(t('first_launch.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('first_launch.title')}
      onClose={finish}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded bg-dark-300 px-3 py-1.5 text-sm text-gray-200" onClick={finish}>
            {t('first_launch.not_now')}
          </button>
          <button type="button" disabled={busy} className="rounded bg-primary-500 px-3 py-1.5 text-sm font-medium text-onprimary disabled:opacity-60" onClick={() => void watch()}>
            {t('first_launch.watch')}
          </button>
        </div>
      }
    >
      <p className="text-sm text-gray-300">{t('first_launch.intro')}</p>
      <ul className="mt-3 space-y-2">
        {detected.map((folder) => (
          <li key={`${folder.room}-${folder.path}`} className="rounded-lg border border-dark-200 bg-dark-300 p-2">
            <div className="text-sm font-medium text-gray-100">{folder.room}</div>
            <div className="truncate font-mono text-xs text-gray-500">{folder.path}</div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-500">{t('first_launch.manual_note')}</p>
    </Modal>
  )
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(FIRST_LAUNCH_KEY) === '1'
  } catch {
    // Storage can be blocked: the assistant may be offered again on the next launch.
    return false
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(FIRST_LAUNCH_KEY, '1')
  } catch {
    // Same as above: the answer is then not remembered across launches.
  }
}
