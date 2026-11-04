import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import Card from '@/components/ui/Card'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { HUD_ROOMS } from '@/views/LiveHud/hudProfile'

/** The HUD is off for every room until the user accepts the warning for that room. */
export default function HudActivationCard() {
  const { t } = useTranslation()
  const { settings, setEnabled, setRoomEnabled, load } = useLiveHudStore()

  useEffect(() => {
    void load()
  }, [load])

  const enable = (room: (typeof HUD_ROOMS)[number]) => {
    setRoomEnabled(room, true)
    setEnabled(true)
  }

  return (
    <Card title={t('liveHud.activation.title')} subtitle={t('liveHud.activation.subtitle')}>
      <div className="space-y-4">
        {HUD_ROOMS.map((room) =>
          settings.rooms[room] ? (
            <div key={room} className="flex items-center justify-between gap-4 rounded-lg bg-dark-200 p-3">
              <p className="text-sm text-gray-200">{t('liveHud.activation.enabled_on', { room })}</p>
              <button className="btn-secondary" onClick={() => setRoomEnabled(room, false)}>
                {t('liveHud.activation.disable')}
              </button>
            </div>
          ) : (
            <div key={room} className="space-y-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
              <p className="text-sm font-medium text-gray-100">{t('liveHud.activation.enable_on', { room })}</p>
              <div className="flex gap-3 text-sm text-gray-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                <p>{t('liveHud.activation.warning', { room })}</p>
              </div>
              <button className="btn-primary" onClick={() => enable(room)}>
                {t('liveHud.activation.accept', { room })}
              </button>
            </div>
          ),
        )}
      </div>
    </Card>
  )
}
