import { useTranslation } from 'react-i18next'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { MAX_OPACITY, MAX_SIZE, MIN_OPACITY, MIN_SIZE } from '../hudProfile'

/** What the right-hand panel shows when nothing is selected: the profile itself. */
export default function ProfileInspector() {
  const { t } = useTranslation()
  const { settings, updateProfile, setSnapToGrid } = useLiveHudStore()
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]

  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="text-sm font-semibold text-white">{profile.name}</h2>
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        <span className="flex justify-between">
          {t('liveHud.profiles.opacity')}
          <span className="font-mono text-gray-200">{Math.round(profile.opacity * 100)} %</span>
        </span>
        <input type="range" min={MIN_OPACITY} max={MAX_OPACITY} step={0.02} value={profile.opacity} onChange={(e) => updateProfile(profile.id, (p) => ({ ...p, opacity: Number(e.target.value) }))} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-400">
        <span className="flex justify-between">
          {t('liveHud.profiles.size')}
          <span className="font-mono text-gray-200">{Math.round(profile.size * 100)} %</span>
        </span>
        <input type="range" min={MIN_SIZE} max={MAX_SIZE} step={0.05} value={profile.size} onChange={(e) => updateProfile(profile.id, (p) => ({ ...p, size: Number(e.target.value) }))} />
      </label>
      <label className="flex items-center gap-2 text-xs text-gray-200">
        <input type="checkbox" checked={profile.showHero} onChange={(e) => updateProfile(profile.id, (p) => ({ ...p, showHero: e.target.checked }))} />
        {t('liveHud.profiles.show_hero')}
      </label>
      <label className="flex items-center gap-2 text-xs text-gray-200" title={t('liveHud.placement.snap_hint')}>
        <input type="checkbox" checked={settings.snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
        {t('liveHud.placement.snap')}
      </label>
      <p className="border-t border-dark-200 pt-3 text-xs text-gray-400">{t('liveHud.ws.profile_help')}</p>
    </div>
  )
}
