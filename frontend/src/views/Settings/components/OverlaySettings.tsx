import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'
import { logError } from '@/utils/log'

const FIGURES = ['tournaments', 'profit', 'cev', 'winRate', 'multipliers'] as const
const DEFAULT_PORT = 38417
const MIN_FONT = 12
const MAX_FONT = 72

interface Settings {
  enabled: boolean
  port: number
  heroName: string | null
  theme: { background: string; text: string; accent: string; fontSize: number; show: string[] }
}

const DEFAULTS: Settings = {
  enabled: false,
  port: DEFAULT_PORT,
  heroName: null,
  theme: { background: 'transparent', text: '#e6e9ef', accent: '#34c27a', fontSize: 28, show: ['tournaments', 'profit', 'cev', 'multipliers'] },
}

/** The streaming overlay: a local page for an OBS browser source, off until the user turns it on. */
export default function OverlaySettings() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [url, setUrl] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void ipcService.getOverlaySettings().then((r) => r.success && setSettings({ ...DEFAULTS, ...(r.data as Settings) }))
    void ipcService.getOverlayStatus().then((r) => r.success && setUrl(r.data?.url ?? null))
  }, [])

  const setTheme = (patch: Partial<Settings['theme']>) => setSettings((s) => ({ ...s, theme: { ...s.theme, ...patch } }))
  const toggleFigure = (figure: string) => setTheme({ show: settings.theme.show.includes(figure) ? settings.theme.show.filter((f) => f !== figure) : [...settings.theme.show, figure] })

  const save = async () => {
    try {
      const result = await ipcService.saveOverlaySettings(settings)
      setMessage(result.success ? t('settings.overlay.saved') : (result.message ?? t('settings.overlay.error')))
      const status = await ipcService.getOverlayStatus()
      setUrl(status.success ? (status.data?.url ?? null) : null)
    } catch (error) {
      logError('Failed to save the overlay settings:', error)
      setMessage(t('settings.overlay.error'))
    }
  }

  return (
    <Card title={t('settings.overlay.title')} subtitle={t('settings.overlay.subtitle')}>
      <div className="space-y-3 text-sm text-gray-200">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
          {t('settings.overlay.enable')}
        </label>
        <div className="flex flex-wrap items-end gap-3 text-xs text-gray-400">
          <label className="flex flex-col gap-1">
            {t('settings.overlay.port')}
            <input className="input w-24 font-mono" inputMode="numeric" value={settings.port} onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) || 0 })} />
          </label>
          <label className="flex flex-col gap-1">
            {t('settings.overlay.font_size')}
            <input className="input w-20 font-mono" type="number" min={MIN_FONT} max={MAX_FONT} value={settings.theme.fontSize} onChange={(e) => setTheme({ fontSize: Number(e.target.value) || MIN_FONT })} />
          </label>
          <label className="flex flex-col gap-1">
            {t('settings.overlay.text')}
            <input className="h-8 w-14 rounded border border-dark-100 bg-dark-300" type="color" value={settings.theme.text} onChange={(e) => setTheme({ text: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            {t('settings.overlay.accent')}
            <input className="h-8 w-14 rounded border border-dark-100 bg-dark-300" type="color" value={settings.theme.accent} onChange={(e) => setTheme({ accent: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            {t('settings.overlay.background')}
            <select className="select w-36" value={settings.theme.background === 'transparent' ? 'transparent' : 'dark'} onChange={(e) => setTheme({ background: e.target.value === 'transparent' ? 'transparent' : '#101418' })}>
              <option value="transparent">{t('settings.overlay.transparent')}</option>
              <option value="dark">{t('settings.overlay.dark')}</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {FIGURES.map((figure) => (
            <label key={figure} className="flex items-center gap-1.5">
              <input type="checkbox" checked={settings.theme.show.includes(figure)} onChange={() => toggleFigure(figure)} />
              {t(`settings.overlay.figure_${figure}`)}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={() => void save()}>{t('settings.overlay.save')}</button>
          {url && (
            <span className="min-w-0 truncate font-mono text-xs text-gray-400">
              {t('settings.overlay.url')}: <span className="text-gray-100">{url}</span>
            </span>
          )}
        </div>
        {message && <p className="text-xs text-gray-400">{message}</p>}
        <p className="text-xs text-gray-500">{t('settings.overlay.privacy')}</p>
      </div>
    </Card>
  )
}
