import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { exportProfiles } from '../hudProfile'

const action = 'rounded px-2 py-1.5 text-left text-xs text-gray-200 hover:bg-dark-200 disabled:opacity-40 disabled:hover:bg-transparent'

/** The profiles: switch, rename, create, duplicate, delete, and share them as a file. */
export default function ProfileMenu({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { settings, setActiveProfile, updateProfile, addProfile, duplicateProfile, removeProfile, importProfilesFile } = useLiveHudStore()
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const fileInput = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const url = URL.createObjectURL(new Blob([exportProfiles(settings.profiles)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'spintracker-hud-profiles.json'
    link.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    const ok = importProfilesFile(await file.text())
    notify.addNotification(
      ok ? { type: 'success', message: t('liveHud.profiles.import_ok') } : { type: 'error', title: t('common.error'), message: t('liveHud.profiles.import_invalid') },
    )
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <div className="w-[300px] rounded-lg border border-dark-100 bg-dark-300 shadow-xl shadow-black/50">
      <div className="max-h-56 overflow-y-auto p-1.5">
        {settings.profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveProfile(p.id)}
            className={clsx('flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[13px]', p.id === profile.id ? 'bg-dark-200 font-semibold text-gray-100' : 'text-gray-300 hover:bg-dark-200')}
          >
            <span className="truncate">{p.name}</span>
            {p.id === profile.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary-400" />}
          </button>
        ))}
      </div>
      <div className="border-t border-dark-100 px-2.5 py-2">
        <label className="block text-xs text-gray-400">
          {t('liveHud.profiles.name')}
          <input
            value={profile.name}
            maxLength={40}
            onChange={(e) => updateProfile(profile.id, (p) => ({ ...p, name: e.target.value }))}
            className="mt-1 block w-full rounded border border-dark-100 bg-dark-500 px-2 py-1 text-[13px] text-gray-200 focus:border-primary-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-0.5 border-t border-dark-100 p-1.5">
        <button type="button" className={action} onClick={() => addProfile(t('liveHud.profiles.new_name'))}>{t('liveHud.profiles.new')}</button>
        <button type="button" className={action} onClick={() => addProfile(t('liveHud.profiles.new_name'), true)}>{t('liveHud.profiles.new_empty')}</button>
        <button type="button" className={action} onClick={() => duplicateProfile(profile.id, `${profile.name} (2)`)}>{t('liveHud.profiles.duplicate')}</button>
        <button type="button" className={clsx(action, 'text-red-300')} disabled={settings.profiles.length <= 1} onClick={() => removeProfile(profile.id)}>{t('common.delete')}</button>
        <button type="button" className={action} onClick={() => fileInput.current?.click()}>{t('liveHud.ws.import_file')}</button>
        <button type="button" className={action} onClick={handleExport}>{t('liveHud.profiles.export')}</button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void handleImport(e.target.files?.[0])} />
      </div>
      <p className="border-t border-dark-100 px-2.5 py-2 text-[11px] text-gray-400">{t('liveHud.profiles.export_note')}</p>
    </div>
  )
}
