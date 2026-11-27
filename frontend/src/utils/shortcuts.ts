/** A keyboard shortcut shown in the help screen. `keys` are shown as written; `labelKey` is translated. */
export interface Shortcut {
  keys: string
  labelKey: string
}

/** The shortcuts of the app, for the help screen. */
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: '?', labelKey: 'shortcuts.help' },
  { keys: 'Space', labelKey: 'shortcuts.play_pause' },
  { keys: '← / →', labelKey: 'shortcuts.step' },
  { keys: 'M', labelKey: 'shortcuts.mark' },
]

/** Keys typed into a field belong to the field: no shortcut must take them. */
export function isTypingTarget(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false
  const tag = (target.tagName ?? '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
}
