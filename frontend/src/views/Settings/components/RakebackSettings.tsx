import { useEffect, useState } from 'react'
import { Percent } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'
import { logError } from '@/utils/log'
import { RAKEBACK_ROOMS, parseRakebackPercent, type RoomRakeback } from '@/utils/rakeback'
import SettingRow from './SettingRow'

/** Rakeback percentage per room. Saved one room at a time, only when the value is valid. */
export default function RakebackSettings() {
  const { t } = useTranslation()
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    ipcService
      .getRakeback()
      .then((result) => {
        if (!active || !result.success) return
        const rows = result.data as RoomRakeback[]
        setInputs(Object.fromEntries(RAKEBACK_ROOMS.map((room) => [room, String(rows.find((r) => r.room === room)?.percent ?? 0)])))
      })
      .catch((error: unknown) => logError('rakeback load failed', error))
    return () => {
      active = false
    }
  }, [])

  const save = async (room: string) => {
    const percent = parseRakebackPercent(inputs[room] ?? '')
    if (percent === null) {
      setFailed(true)
      return
    }
    setFailed(false)
    try {
      const result = await ipcService.setRakebackPercent(room, percent)
      setSaved(result.success ? room : null)
      setFailed(!result.success)
    } catch (error: unknown) {
      logError('rakeback save failed', error)
      setFailed(true)
    }
  }

  return (
    <Card title={t('rakeback.settings.title')} subtitle={t('rakeback.settings.desc')}>
      {RAKEBACK_ROOMS.map((room) => (
        <SettingRow key={room} icon={Percent} title={room} description={t('rakeback.settings.percent')}>
          <div className="flex items-center gap-2">
            <input
              className="w-20 rounded bg-dark-300 px-2 py-1 text-right font-mono text-gray-100"
              inputMode="decimal"
              aria-label={`${room} ${t('rakeback.settings.percent')}`}
              value={inputs[room] ?? ''}
              onChange={(event) => setInputs((current) => ({ ...current, [room]: event.target.value }))}
            />
            <span className="text-gray-400">%</span>
            <button type="button" className="rounded bg-primary-500 px-3 py-1 text-sm font-medium text-onprimary" onClick={() => void save(room)}>
              {t('rakeback.settings.save')}
            </button>
            {saved === room && <span className="text-xs text-gray-400">{t('rakeback.settings.saved')}</span>}
          </div>
        </SettingRow>
      ))}
      {failed && <p className="pt-2 text-sm text-profit-negative">{t('rakeback.settings.invalid')}</p>}
    </Card>
  )
}
