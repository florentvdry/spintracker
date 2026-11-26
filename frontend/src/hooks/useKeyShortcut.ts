import { useEffect, useRef } from 'react'

/** Whether a key is pressed where the user types: a shortcut must leave it alone. */
function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== 'string') return false
  return ['input', 'textarea', 'select'].includes(element.tagName.toLowerCase()) || element.isContentEditable === true
}

/** Runs `action` when `key` is pressed on its own, outside a text field. */
export function useKeyShortcut(key: string, action: () => void): void {
  const latest = useRef(action)
  latest.current = action
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key !== key || isTyping(event.target)) return
      latest.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key])
}
