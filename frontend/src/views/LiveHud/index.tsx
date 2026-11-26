import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ipcService } from '@/services/ipcService'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { useTranslation } from 'react-i18next'
import { hudSupported } from '@/utils/platform'
import EditorTab from './editor/EditorTab'

const MIN_HEIGHT_PX = 640

/** The HUD page: one workbench that fills the window below the app's header. */
export default function LiveHud() {
  const { t } = useTranslation()
  if (!hudSupported()) {
    // The table HUD reads the windows of a Windows poker client: nothing to set up on a Mac.
    return (
      <div className="card mx-auto mt-10 max-w-xl p-8 text-center">
        <h1 className="page-title">{t('hud_unavailable.title')}</h1>
        <p className="mt-2 text-sm text-gray-400">{t('hud_unavailable.text')}</p>
      </div>
    )
  }
  return <LiveHudWorkbench />
}

function LiveHudWorkbench() {
  const load = useLiveHudStore((s) => s.load)
  const loaded = useLiveHudStore((s) => s.loaded)
  const root = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(MIN_HEIGHT_PX)

  useEffect(() => {
    void load()
    // The HUD window saves the positions the user sets on the table.
    return ipcService.onHudSettingsChanged(() => void load())
  }, [load])

  // The page scrolls inside the layout, so the workbench is sized from where it starts to the bottom of the window.
  useLayoutEffect(() => {
    const fit = () => {
      if (root.current) setHeight(Math.max(MIN_HEIGHT_PX, window.innerHeight - root.current.getBoundingClientRect().top))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [loaded])

  if (!loaded) return <div className="spinner mx-auto mt-16" />
  return (
    <div ref={root} className="-mx-5 -mt-5 -mb-10 overflow-hidden" style={{ height }}>
      <EditorTab />
    </div>
  )
}
