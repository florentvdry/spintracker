/** Remembers that the player has answered the first-launch assistant, on this machine. */
export const FIRST_LAUNCH_KEY = 'spintracker.firstLaunchDone'

interface SetupState {
  /** Auto-import is already turned on. */
  enabled: boolean
  /** Folders already chosen by the player. */
  folders: unknown[]
  /** Folders the app found in the default locations. */
  detected: unknown[]
  /** The player chose "not now" or finished the assistant before. */
  dismissed: boolean
}

/** The assistant is offered only once: when nothing is set up yet and a folder was found. */
export function shouldOfferSetup(state: SetupState): boolean {
  return !state.dismissed && !state.enabled && state.folders.length === 0 && state.detected.length > 0
}
