import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'
import { logError } from '@/utils/log'

type Outcome = { kind: 'backup' | 'restore'; ok: boolean; text: string } | null

/** One-file backup of the active database, and a restore that adds the file as a new database. */
export default function BackupSettings({ onRestored }: { onRestored?: () => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(null)

  const run = async (kind: 'backup' | 'restore') => {
    setBusy(true)
    setOutcome(null)
    try {
      const result = kind === 'backup' ? await ipcService.backupDatabase(t('settings.backup.dialog_backup')) : await ipcService.restoreDatabase(t('settings.backup.dialog_restore'))
      if (result.cancelled) return
      if (result.success) {
        setOutcome({ kind, ok: true, text: kind === 'backup' ? t('settings.backup.backup_done', { hands: result.hands }) : t('settings.backup.restore_done', { name: result.name, hands: result.hands }) })
        if (kind === 'restore') onRestored?.()
      } else {
        setOutcome({ kind, ok: false, text: result.message ?? t('settings.backup.failed') })
      }
    } catch (error) {
      logError('Backup or restore failed:', error)
      setOutcome({ kind, ok: false, text: t('settings.backup.failed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('settings.backup.title')} subtitle={t('settings.backup.subtitle')}>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy} onClick={() => void run('backup')}>{t('settings.backup.backup')}</button>
        <button className="btn-secondary" disabled={busy} onClick={() => void run('restore')}>{t('settings.backup.restore')}</button>
      </div>
      {outcome && <p className={`mt-3 text-xs ${outcome.ok ? 'text-profit-positive' : 'text-profit-negative'}`}>{outcome.text}</p>}
      <p className="mt-3 text-xs text-gray-500">{t('settings.backup.hint')}</p>
    </Card>
  )
}
