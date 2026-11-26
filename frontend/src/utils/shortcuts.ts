/** Keyboard shortcuts of the app: one list, read by the handlers and by the help screen (`?`). */

export type ShortcutScope = 'app' | 'replayer'

export interface ShortcutDef {
  id: string
  /** The keys in order: one key, or a sequence such as `g` then `d`. */
  keys: string[]
  scope: ShortcutScope
  /** Key of the label in the locale files. */
  labelKey: string
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'nav.dashboard', keys: ['g', 'd'], scope: 'app', labelKey: 'shortcuts.nav_dashboard' },
  { id: 'nav.history', keys: ['g', 'h'], scope: 'app', labelKey: 'shortcuts.nav_history' },
  { id: 'nav.analysis', keys: ['g', 'a'], scope: 'app', labelKey: 'shortcuts.nav_analysis' },
  { id: 'nav.ranges', keys: ['g', 'r'], scope: 'app', labelKey: 'shortcuts.nav_ranges' },
  { id: 'nav.players', keys: ['g', 'p'], scope: 'app', labelKey: 'shortcuts.nav_players' },
  { id: 'nav.hud', keys: ['g', 'u'], scope: 'app', labelKey: 'shortcuts.nav_hud' },
  { id: 'nav.settings', keys: ['g', 's'], scope: 'app', labelKey: 'shortcuts.nav_settings' },
  { id: 'help', keys: ['?'], scope: 'app', labelKey: 'shortcuts.help' },
  { id: 'replayer.play', keys: [' '], scope: 'replayer', labelKey: 'shortcuts.replayer_play' },
  { id: 'replayer.next', keys: ['ArrowRight'], scope: 'replayer', labelKey: 'shortcuts.replayer_next' },
  { id: 'replayer.previous', keys: ['ArrowLeft'], scope: 'replayer', labelKey: 'shortcuts.replayer_previous' },
  { id: 'replayer.start', keys: ['Home'], scope: 'replayer', labelKey: 'shortcuts.replayer_start' },
  { id: 'replayer.end', keys: ['End'], scope: 'replayer', labelKey: 'shortcuts.replayer_end' },
  { id: 'replayer.units', keys: ['b'], scope: 'replayer', labelKey: 'shortcuts.replayer_units' },
  { id: 'replayer.log', keys: ['l'], scope: 'replayer', labelKey: 'shortcuts.replayer_log' },
  { id: 'help.replayer', keys: ['?'], scope: 'replayer', labelKey: 'shortcuts.help' },
]

/** Time a first key of a sequence waits for the next one. */
export const SEQUENCE_TIMEOUT_MS = 1000

/** Reads keys one at a time and says which shortcut of a scope they complete. */
export class SequenceMatcher {
  private pending: string[] = []
  private lastAt = 0

  constructor(
    private readonly scope: ShortcutScope,
    private readonly defs: ShortcutDef[] = SHORTCUTS,
  ) {}

  /** The id of the shortcut completed by `key`, or `null`. A key that continues no sequence starts a new one. */
  feed(key: string, now: number): string | null {
    if (now - this.lastAt > SEQUENCE_TIMEOUT_MS) this.pending = []
    this.lastAt = now
    const candidates = this.defs.filter((d) => d.scope === this.scope)
    const attempt = (typed: string[]): string | null | 'prefix' => {
      const exact = candidates.find((d) => d.keys.length === typed.length && d.keys.every((k, i) => k === typed[i]))
      if (exact) return exact.id
      return candidates.some((d) => d.keys.length > typed.length && typed.every((k, i) => d.keys[i] === k)) ? 'prefix' : null
    }
    let found = attempt([...this.pending, key])
    if (found === null && this.pending.length > 0) {
      // The pending keys lead nowhere with this one: it may start a shortcut of its own.
      this.pending = []
      found = attempt([key])
    }
    if (found === 'prefix') {
      this.pending = [...this.pending, key]
      return null
    }
    this.pending = []
    return found
  }
}

/** Whether a key event happens where the user types: shortcuts must leave it alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== 'string') return false
  const tag = element.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true
}
