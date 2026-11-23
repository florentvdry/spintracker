import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { useNotificationStore } from '@/stores/notificationStore'
import { useRakebackStore } from '@/stores/rakebackStore'
import { POOL_EV_ROOMS } from '@/utils/poolEv'

const ROOM_LABELS: Record<string, string> = { winamax: 'Winamax', betclic: 'Betclic', unibet: 'Unibet' }

/** One rakeback percentage per room: the share of the rake the room gives back. */
export default function RakebackSettings() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { rates, loaded, load, save } = useRakebackStore()
  const [draft, setDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => setDraft(Object.fromEntries(Object.entries(rates).map(([room, pct]) => [room, String(pct)]))), [rates])

  const handleSave = async () => {
    const parsed = Object.fromEntries(POOL_EV_ROOMS.map((room) => [room, Number(draft[room] ?? 0) || 0]))
    const ok = await save(parsed)
    notify.addNotification(
      ok ? { type: 'success', title: t('settings.rakeback.saved'), message: '' } : { type: 'error', title: t('common.error'), message: t('settings.rakeback.save_failed') },
    )
  }

  return (
    <Card title={t('settings.rakeback.title')} subtitle={t('settings.rakeback.subtitle')}>
      <div className="space-y-2">
        {POOL_EV_ROOMS.map((room) => (
          <label key={room} className="flex items-center gap-3 text-sm text-gray-100">
            <span className="w-24">{ROOM_LABELS[room]}</span>
            <input
              className="input w-24 font-mono"
              inputMode="decimal"
              value={draft[room] ?? ''}
              placeholder="0"
              onChange={(e) => setDraft((d) => ({ ...d, [room]: e.target.value }))}
            />
            <span className="text-gray-500">%</span>
          </label>
        ))}
      </div>
      <button className="btn-primary mt-4" onClick={() => void handleSave()}>
        {t('settings.rakeback.save')}
      </button>
    </Card>
  )
}
