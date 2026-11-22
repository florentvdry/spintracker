import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { useNotificationStore } from '@/stores/notificationStore'
import { usePoolEvStore } from '@/stores/poolEvStore'
import { defaultPoolEvTables, meanMultiplier, POOL_EV_ROOMS, type PoolEvRow, type PoolEvTables } from '@/utils/poolEv'

const ROOM_LABELS: Record<string, string> = { winamax: 'Winamax', betclic: 'Betclic', unibet: 'Unibet' }
const MEAN_DECIMALS = 3

/** Editable multiplier tables behind PoolEV and evROI, one per room. */
export default function PoolEvSettings() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { tables, loaded, load, save } = usePoolEvStore()
  const [draft, setDraft] = useState<PoolEvTables>(tables)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => setDraft(tables), [tables])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(tables), [draft, tables])

  const updateRows = (room: string, rows: PoolEvRow[]) => setDraft((d) => ({ ...d, [room]: rows }))
  const setCell = (room: string, index: number, field: keyof PoolEvRow, value: string) =>
    updateRows(room, (draft[room] ?? []).map((row, i) => (i === index ? { ...row, [field]: value } : row)))

  const handleSave = async () => {
    const ok = await save(draft)
    notify.addNotification(
      ok
        ? { type: 'success', title: t('settings.pool_ev.saved'), message: '' }
        : { type: 'error', title: t('common.error'), message: t('settings.pool_ev.save_failed') },
    )
  }

  return (
    <Card title={t('settings.pool_ev.title')} subtitle={t('settings.pool_ev.subtitle')}>
      <div className="space-y-5">
        {POOL_EV_ROOMS.map((room) => {
          const rows = draft[room] ?? []
          const mean = meanMultiplier(rows)
          return (
            <div key={room}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-gray-100">{ROOM_LABELS[room]}</span>
                <span className="text-xs text-gray-500">
                  {mean === null ? t('settings.pool_ev.empty') : `${t('settings.pool_ev.mean')}: x${mean.toFixed(MEAN_DECIMALS)}`}
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {rows.map((row, index) => (
                  // Rows have no id of their own: the list is only ever edited in place or from its end.
                  <div key={`${room}-${index}`} className="flex items-center gap-2">
                    <input
                      className="input w-28 font-mono"
                      inputMode="decimal"
                      aria-label={t('settings.pool_ev.multiplier')}
                      placeholder={t('settings.pool_ev.multiplier')}
                      value={row.multiplier}
                      onChange={(e) => setCell(room, index, 'multiplier', e.target.value)}
                    />
                    <input
                      className="input w-32 font-mono"
                      inputMode="decimal"
                      aria-label={t('settings.pool_ev.weight')}
                      placeholder={t('settings.pool_ev.weight')}
                      value={row.weight}
                      onChange={(e) => setCell(room, index, 'weight', e.target.value)}
                    />
                    <button className="btn-secondary p-1.5" onClick={() => updateRows(room, rows.filter((_, i) => i !== index))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button className="btn-secondary mt-2 flex items-center gap-1.5 text-xs" onClick={() => updateRows(room, [...rows, { multiplier: '', weight: '' }])}>
                <Plus className="h-3.5 w-3.5" />
                {t('settings.pool_ev.add_row')}
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-5 flex gap-2">
        <button className="btn-primary" disabled={!dirty} onClick={() => void handleSave()}>
          {t('settings.pool_ev.save')}
        </button>
        <button className="btn-secondary" onClick={() => setDraft(defaultPoolEvTables())}>
          {t('settings.pool_ev.reset')}
        </button>
      </div>
    </Card>
  )
}
