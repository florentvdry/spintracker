import { useEffect, useState } from 'react'
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { OVERLAY_DEFAULT_PORT, OVERLAY_THEMES, overlayUrl, parseOverlayPort, type OverlayTheme } from '@/utils/overlay'
import { logError } from '@/utils/log'
import SettingRow from './SettingRow'

/** The live overlay for streaming: off by default, on the loopback address only. */
export default function OverlayCard() {
  const { t } = useTranslation()
  const heroName = useFilterStore((s) => s.heroName)
  const [running, setRunning] = useState(false)
  const [port, setPort] = useState(String(OVERLAY_DEFAULT_PORT))
  const [theme, setTheme] = useState<OverlayTheme>('dark')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ipcService
      .overlayStatus()
      .then((result) => {
        if (!active || !result.success) return
        const status = result.data as { running: boolean; port: number | null }
        setRunning(status.running)
        if (status.port) setPort(String(status.port))
      })
      .catch((err: unknown) => logError('overlay status failed', err))
    return () => {
      active = false
    }
  }, [])

  const toggle = async () => {
    setError(null)
    if (running) {
      await ipcService.overlayStop()
      setRunning(false)
      return
    }
    const value = parseOverlayPort(port)
    if (value === null) {
      setError(t('settings.overlay.invalid_port'))
      return
    }
    const result = await ipcService.overlayStart(value, theme, heroName)
    if (result.success) setRunning(true)
    else setError(t('settings.overlay.failed'))
  }

  return (
    <Card title={t('settings.overlay.title')} subtitle={t('settings.overlay.subtitle')}>
      <SettingRow icon={Monitor} title={t('settings.overlay.enable')} description={t('settings.overlay.enable_desc')}>
        <button type="button" className={clsx('segmented-item', running && 'active')} onClick={() => void toggle()}>
          {running ? t('settings.overlay.toggle_off') : t('settings.overlay.toggle_on')}
        </button>
      </SettingRow>
      <SettingRow icon={Monitor} title={t('settings.overlay.port')} description={t('settings.overlay.port_desc')}>
        <input
          className="w-24 rounded bg-dark-300 px-2 py-1 text-right font-mono text-gray-100 disabled:opacity-50"
          inputMode="numeric"
          disabled={running}
          value={port}
          onChange={(event) => setPort(event.target.value)}
        />
      </SettingRow>
      <SettingRow icon={Monitor} title={t('settings.overlay.theme')} description={t('settings.overlay.theme_desc')}>
        <div className="segmented">
          {OVERLAY_THEMES.map((name) => (
            <button key={name} type="button" disabled={running} className={clsx('segmented-item', theme === name && 'active')} onClick={() => setTheme(name)}>
              {t(`settings.overlay.theme_${name}`)}
            </button>
          ))}
        </div>
      </SettingRow>
      {running && (
        <p className="pt-2 text-sm text-gray-300">
          {t('settings.overlay.url')} <code className="font-mono">{overlayUrl(parseOverlayPort(port) ?? OVERLAY_DEFAULT_PORT)}</code>
        </p>
      )}
      {error && <p className="pt-2 text-sm text-profit-negative">{error}</p>}
    </Card>
  )
}
