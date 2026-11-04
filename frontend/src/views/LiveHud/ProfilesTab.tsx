import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Copy, Download, FilePlus, Plus, Trash2, Upload } from 'lucide-react'
import HudGridView from '@/components/livehud/HudGridView'
import Card from '@/components/ui/Card'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { exportProfiles, HUD_FORMATS, MAX_OPACITY, MAX_SIZE, MIN_OPACITY, MIN_SIZE, type HudFormat } from './hudProfile'
import { previewFigures } from './previewData'

/** Profiles: which one is used, its name, opacity and size, and sharing them as files. The grids are edited in the editor tab. */
export default function ProfilesTab() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { settings, updateProfile, setActiveProfile, addProfile, duplicateProfile, removeProfile, importProfilesFile } = useLiveHudStore()
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const [format, setFormat] = useState<HudFormat>('threeMax')
  const fileInput = useRef<HTMLInputElement>(null)

  const layout = profile.layouts[format]
  const figures = useMemo(() => previewFigures(layout), [layout])

  const handleExport = () => {
    const url = URL.createObjectURL(new Blob([exportProfiles(settings.profiles)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'spintracker-hud-profiles.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    const ok = importProfilesFile(await file.text())
    notify.addNotification(
      ok
        ? { type: 'success', message: t('liveHud.profiles.import_ok') }
        : { type: 'error', title: t('common.error'), message: t('liveHud.profiles.import_invalid') },
    )
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <Card title={t('liveHud.profiles.mine')}>
        <div className="space-y-1">
          {settings.profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProfile(p.id)}
              className={clsx('w-full rounded-md border px-3 py-2 text-left text-sm', p.id === profile.id ? 'border-primary-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200')}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => addProfile(t('liveHud.profiles.new_name'))}>
            <Plus className="h-3.5 w-3.5" />
            {t('liveHud.profiles.new')}
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => addProfile(t('liveHud.profiles.new_name'), true)}>
            <FilePlus className="h-3.5 w-3.5" />
            {t('liveHud.profiles.new_empty')}
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            {t('common.import')}
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            {t('liveHud.profiles.export')}
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void handleImport(e.target.files?.[0])} />
        </div>
        <p className="mt-3 text-xs text-gray-500">{t('liveHud.profiles.export_note')}</p>
      </Card>

      <div className="space-y-4">
        <Card
          title={t('liveHud.profiles.presentation')}
          header={
            <div className="flex items-center gap-2">
              <input
                value={profile.name}
                maxLength={40}
                onChange={(e) => updateProfile(profile.id, (p) => ({ ...p, name: e.target.value }))}
                aria-label={t('liveHud.profiles.name')}
                className="w-44 rounded border border-dark-100 bg-dark-300 px-2 py-1 text-sm text-gray-200 focus:border-primary-500 focus:outline-none"
              />
              <button className="btn-icon" title={t('liveHud.profiles.duplicate')} onClick={() => duplicateProfile(profile.id, `${profile.name} (2)`)}>
                <Copy className="h-4 w-4" />
              </button>
              <button className="btn-icon" title={t('common.delete')} disabled={settings.profiles.length <= 1} onClick={() => removeProfile(profile.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          }
        >
          <div className="flex gap-2">
            {HUD_FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={clsx('rounded-md border px-3 py-1.5 text-sm', f === format ? 'border-primary-500 bg-primary-500 text-white' : 'border-dark-100 text-gray-300')}
              >
                {t(`liveHud.format.${f}`)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">{t('liveHud.profiles.layout_note')}</p>
        </Card>

        <Card title={t('liveHud.profiles.preview')}>
          <div className="flex min-h-[170px] flex-wrap items-start gap-2 overflow-auto rounded-md bg-dark-500 p-3">
            {layout.grids.length === 0 && <p className="text-sm text-gray-500">{t('liveHud.profiles.empty_layout')}</p>}
            {layout.grids.map((grid) => (
              <div key={grid.id} className="origin-top-left" style={{ zoom: profile.size }}>
                <HudGridView grid={grid} figures={figures} player={{ name: t('liveHud.preview.player', { n: 1 }) }} opacity={profile.opacity} />
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="block text-xs text-gray-400">
              {t('liveHud.profiles.opacity')} <span className="font-mono">{Math.round(profile.opacity * 100)}%</span>
              <input type="range" className="mt-1 w-full" min={MIN_OPACITY} max={MAX_OPACITY} step={0.02} value={profile.opacity} onChange={(e) => updateProfile(profile.id, (p) => ({ ...p, opacity: Number(e.target.value) }))} />
            </label>
            <label className="block text-xs text-gray-400">
              {t('liveHud.profiles.size')} <span className="font-mono">{Math.round(profile.size * 100)}%</span>
              <input type="range" className="mt-1 w-full" min={MIN_SIZE} max={MAX_SIZE} step={0.05} value={profile.size} onChange={(e) => updateProfile(profile.id, (p) => ({ ...p, size: Number(e.target.value) }))} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={profile.showHero} onChange={(e) => updateProfile(profile.id, (p) => ({ ...p, showHero: e.target.checked }))} />
              {t('liveHud.profiles.show_hero')}
            </label>
          </div>
        </Card>
      </div>
    </div>
  )
}
