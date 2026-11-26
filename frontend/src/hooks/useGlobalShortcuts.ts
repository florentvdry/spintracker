import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isTypingTarget, SequenceMatcher } from '@/utils/shortcuts'

const ROUTES: Record<string, string> = {
  'nav.dashboard': '/',
  'nav.history': '/hands',
  'nav.analysis': '/analysis',
  'nav.ranges': '/ranges',
  'nav.players': '/players',
  'nav.hud': '/hud',
  'nav.settings': '/settings',
}

/** Navigation shortcuts of the main window; returns the state of the help screen. */
export function useGlobalShortcuts(): { helpOpen: boolean; setHelpOpen: (open: boolean) => void } {
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const matcher = new SequenceMatcher('app')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      // A dialog being open keeps its keys (Escape, arrows) for itself.
      const id = matcher.feed(event.key, Date.now())
      if (!id) return
      if (id === 'help') {
        event.preventDefault()
        setHelpOpen((open) => !open)
      } else if (ROUTES[id]) {
        navigate(ROUTES[id])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  return { helpOpen, setHelpOpen }
}
