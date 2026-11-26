import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'

/** Writes a copy of a hand-history file without the player names, to attach to a public issue. */
export default function AnonymizeSettings() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await ipcService.anonymizeHistory(t('settings.anonymize.pick'), t('settings.anonymize.save_dialog'))
      if (result.cancelled) return
      setMessage(result.success ? { ok: true, text: t('settings.anonymize.done', { count: result.names }) } : { ok: false, text: result.message ?? t('settings.anonymize.failed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('settings.anonymize.title')} subtitle={t('settings.anonymize.subtitle')}>
      <button className="btn-secondary" disabled={busy} onClick={() => void run()}>
        {t('settings.anonymize.button')}
      </button>
      {message && <p className={`mt-3 text-xs ${message.ok ? 'text-profit-positive' : 'text-profit-negative'}`}>{message.text}</p>}
      <p className="mt-3 text-xs text-gray-500">{t('settings.anonymize.hint')}</p>
    </Card>
  )
}
