import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useLiveHudStore } from '@/stores/liveHudStore'

/** Turns the HUD on or off from any page, so it can be silenced at the table while the import goes on. */
export default function HudSwitch() {
  const { t } = useTranslation()
  const enabled = useLiveHudStore((s) => s.settings.enabled)
  const loaded = useLiveHudStore((s) => s.loaded)
  const load = useLiveHudStore((s) => s.load)
  const setEnabled = useLiveHudStore((s) => s.setEnabled)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={!loaded}
      onClick={() => setEnabled(!enabled)}
      className="flex h-8 items-center gap-2 rounded-lg border border-dark-200 px-2.5 text-[13px] text-gray-400 hover:border-dark-100 hover:text-gray-200 disabled:opacity-50"
    >
      <span className={clsx('relative h-4 w-7 rounded-full transition-colors', enabled ? 'bg-profit-positive' : 'bg-dark-50')}>
        <span className={clsx('absolute top-0.5 h-3 w-3 rounded-full bg-dark-500 transition-all', enabled ? 'left-3.5' : 'left-0.5')} />
      </span>
      <span>{enabled ? t('liveHud.live.on') : t('liveHud.live.off')}</span>
    </button>
  )
}
