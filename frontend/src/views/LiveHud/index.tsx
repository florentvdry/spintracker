import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useLiveHudStore } from '@/stores/liveHudStore'
import LiveTab from './LiveTab'
import PlacementTab from './PlacementTab'
import ProfilesTab from './ProfilesTab'

type TabId = 'live' | 'profiles' | 'placement'
const TABS: TabId[] = ['live', 'profiles', 'placement']

/** The HUD page: live state, profiles and panel positions. */
export default function LiveHud() {
  const { t } = useTranslation()
  const load = useLiveHudStore((s) => s.load)
  const loaded = useLiveHudStore((s) => s.loaded)
  const [tab, setTab] = useState<TabId>('live')

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-dark-200">
        {TABS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === id ? 'border-primary-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200',
            )}
          >
            {t(`liveHud.tabs.${id}`)}
          </button>
        ))}
      </div>
      {!loaded ? (
        <div className="spinner mx-auto mt-16" />
      ) : (
        <>
          {tab === 'live' && <LiveTab />}
          {tab === 'profiles' && <ProfilesTab />}
          {tab === 'placement' && <PlacementTab />}
        </>
      )}
    </div>
  )
}
