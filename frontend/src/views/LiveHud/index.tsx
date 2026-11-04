import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Users } from 'lucide-react'
import { ipcService } from '@/services/ipcService'
import { useLiveHudStore } from '@/stores/liveHudStore'
import EditorTab from './editor/EditorTab'
import LiveStatus from './LiveStatus'
import ProfilesTab from './ProfilesTab'

/** The HUD page: the switch and tables on top, then the editor; profiles open on demand. */
export default function LiveHud() {
  const { t } = useTranslation()
  const load = useLiveHudStore((s) => s.load)
  const loaded = useLiveHudStore((s) => s.loaded)
  const [showProfiles, setShowProfiles] = useState(false)

  useEffect(() => {
    void load()
    // The HUD window saves the positions the user sets on the table.
    return ipcService.onHudSettingsChanged(() => void load())
  }, [load])

  if (!loaded) return <div className="spinner mx-auto mt-16" />
  return (
    <div className="space-y-4">
      <LiveStatus />
      <div>
        <button
          className={clsx('btn-secondary flex items-center gap-1.5 text-sm', showProfiles && 'border-primary-500')}
          onClick={() => setShowProfiles((v) => !v)}
        >
          <Users className="h-4 w-4" />
          {t('liveHud.tabs.profiles')}
        </button>
      </div>
      {showProfiles && <ProfilesTab />}
      <EditorTab />
    </div>
  )
}
