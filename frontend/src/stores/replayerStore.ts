import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ipcService, type Json } from '@/services/ipcService'
import { logError } from '@/utils/log'

/** Blinds only set up the table; they are replayed instantly, not stepped through. */
const BLIND_ACTION_TYPES = ['PostSB', 'PostBB']

export type ReplayerViewMode = 'chips' | 'bb'

export interface TableSnapshot {
  players: Json[]
  pot: number
  board: string[]
  street: string
  actionLog: Json[]
}

/** Blinds and the hole-card deal: the table is already in that state when the replay starts. */
const isSetupAction = (action: Json): boolean =>
  BLIND_ACTION_TYPES.includes(action.type) || (action.type === 'DealCards' && action.street === 'Preflop')

export const isRealAction = (action: Json): boolean => !isSetupAction(action)

/** Chips the action moved in front of its player. The backend reports "raise to" and "call" amounts
 * differently, but the pot always grows by exactly what the player put in. */
function chipsAdded(action: Json): number {
  const added = Number(action.potAfter) - Number(action.potBefore)
  return Number.isFinite(added) && added > 0 ? added : Number(action.amount) || 0
}

function handActions(handData: Json | null): Json[] {
  return handData?.actions || handData?.Actions || []
}

function handPlayers(handData: Json | null): Json[] {
  return handData?.players || handData?.Players || []
}

function emptySnapshot(handData: Json): TableSnapshot {
  return {
    players: handPlayers(handData).map((p) => ({
      ...p,
      currentStack: p.initialStack || p.InitialStack || 0,
      bet: 0,
      isFolded: false,
      isAllIn: false,
      isActive: false,
      showCards: false,
    })),
    pot: 0,
    board: [],
    street: 'Preflop',
    actionLog: [],
  }
}

function splitCards(text: string): string[] {
  return text.match(/.{1,2}/g) || []
}

/** Applies one action to a snapshot in place. */
function applyAction(snap: TableSnapshot, action: Json): void {
  snap.street = action.street
  snap.actionLog.push(action)
  const player = snap.players.find((p) => p.name === action.playerName)

  switch (action.type) {
    case 'PostSB':
    case 'PostBB':
    case 'Bet':
    case 'Raise':
    case 'Call':
    case 'AllIn':
      if (player) {
        const added = chipsAdded(action)
        player.bet += added
        player.currentStack = action.type === 'AllIn' ? 0 : Math.max(0, player.currentStack - added)
        if (action.type === 'AllIn') player.isAllIn = true
        if (action.potAfter) snap.pot = action.potAfter
      }
      break

    case 'Fold':
      if (player) {
        player.isFolded = true
        player.bet = 0
      }
      break

    case 'Check':
      if (player) player.bet = 0
      break

    case 'DealCards':
      // A new street clears the bets in front of the players.
      if (action.street !== 'Preflop') snap.players.forEach((p) => (p.bet = 0))
      if (action.cards) {
        snap.board = [...snap.board, ...splitCards(action.cards)]
      } else if (action.description?.includes(':')) {
        // Fallback: cards are only present in the description text.
        const cardText = action.description.split(':')[1].trim().replace(/\s+/g, '')
        snap.board = [...snap.board, ...splitCards(cardText)]
      }
      break

    case 'ShowCards':
      if (player) player.showCards = true
      break

    case 'CollectPot':
      snap.players.forEach((p) => (p.bet = 0))
      if (action.playerName) {
        const winner = snap.players.find((p) => p.name === action.playerName)
        if (winner) winner.currentStack += action.amount
      } else {
        const description = String(action.description).toLowerCase()
        snap.players.forEach((p) => {
          if (description.includes(p.name.toLowerCase()) && description.includes('wins')) p.currentStack += action.amount
        })
      }
      snap.pot = 0
      break
  }

  snap.players.forEach((p) => (p.isActive = p.name === action.playerName))
}

function findNextRealActionIndex(actions: Json[], fromIndex: number): number {
  for (let i = fromIndex; i < actions.length; i++) if (isRealAction(actions[i])) return i
  return actions.length
}

function countRealActions(actions: Json[], endIndex = actions.length): number {
  let count = 0
  for (let i = 0; i < endIndex && i < actions.length; i++) if (isRealAction(actions[i])) count++
  return count
}

/** The last action applied to the table (`currentIndex` is the number of actions applied). */
export const selectCurrentAction = (s: Pick<ReplayerState, 'handData' | 'currentIndex'>): Json | null =>
  handActions(s.handData)[s.currentIndex - 1] ?? null

/** Selectors for components: derived values without calling store methods in render. */
export const selectTotalActions = (s: Pick<ReplayerState, 'handData'>): number => countRealActions(handActions(s.handData))

/** Playback progress: how many of the steppable actions are applied. */
export const selectDoneActions = (s: Pick<ReplayerState, 'handData' | 'currentIndex'>): number =>
  countRealActions(handActions(s.handData), s.currentIndex)

interface ReplayerState extends TableSnapshot {
  handId: string | number | null
  handData: Json | null
  loading: boolean
  error: string | null
  currentIndex: number
  isPlaying: boolean
  playbackSpeed: number
  handQueue: (string | number)[]
  queueIndex: number
  heroName: string | null
  viewMode: ReplayerViewMode
  showFoldedPlayers: boolean

  totalActions: () => number
  currentAction: () => Json | null
  loadHand: (handId: string | number, heroName?: string | null) => Promise<void>
  setHand: (handData: Json) => void
  initFromWindowData: (data: Json) => void
  resetTable: () => void
  nextStep: () => void
  prevStep: () => void
  /** Shows the table after `count` steppable actions (0 = start of the hand). */
  jumpToProgress: (count: number) => void
  /** Shows the table right after the action at `index` of the action list. */
  jumpToAction: (index: number) => void
  getTotalRealActions: () => number
  play: () => void
  stop: () => void
  setSpeed: (ms: number) => void
  setViewMode: (mode: ReplayerViewMode) => void
  setShowFoldedPlayers: (show: boolean) => void
  nextHand: () => Promise<void>
  prevHand: () => Promise<void>
  openReplayerWindowForQueue: (handIds: (string | number)[], startIndex: number, heroName: string | null) => Promise<void>
  openSingleHandReplayer: (handId: string | number, heroName?: string | null) => Promise<void>
}

let playbackTimer: ReturnType<typeof setInterval> | null = null

export const useReplayerStore = create<ReplayerState>()(
  persist(
    (set, get) => {
      /** Rebuilds the table from scratch up to (excluding) `targetIndex`. */
      const rebuildTo = (targetIndex: number) => {
        const { handData } = get()
        if (!handData) return
        const actions = handActions(handData)
        const snap = emptySnapshot(handData)
        for (let i = 0; i < targetIndex; i++) applyAction(snap, actions[i])
        set({ ...snap, currentIndex: targetIndex })
      }

      return {
        handId: null,
        handData: null,
        loading: false,
        error: null,
        currentIndex: 0,
        isPlaying: false,
        playbackSpeed: 1000,
        handQueue: [],
        queueIndex: 0,
        heroName: null,
        players: [],
        pot: 0,
        board: [],
        street: 'Preflop',
        actionLog: [],
        viewMode: 'chips',
        showFoldedPlayers: true,

        totalActions: () => countRealActions(handActions(get().handData)),
        currentAction: () => handActions(get().handData)[get().currentIndex - 1] ?? null,
        getTotalRealActions: () => countRealActions(handActions(get().handData)),

        loadHand: async (handId, heroName = null) => {
          get().stop()
          set({ loading: true, error: null, currentIndex: 0 })
          try {
            const response = await ipcService.getHandReplay(handId, heroName)
            if (response.success) {
              set({ handData: response.data, handId })
              get().resetTable()
            } else {
              set({ error: response.error || 'Failed to load hand' })
            }
          } catch (err) {
            set({ error: err instanceof Error ? err.message : String(err) })
          } finally {
            set({ loading: false })
          }
        },

        setHand: (handData) => {
          get().stop()
          set({
            error: null,
            loading: false,
            handData: { ...handData, players: handPlayers(handData), actions: handActions(handData) },
            handId: handData.id || handData.handId || handData.HandId,
          })
          get().resetTable()
        },

        /** Initializes the replayer window from the payload given by the main window. */
        initFromWindowData: (data) => {
          get().setHand(data)
          if (data.handIds) {
            set({ handQueue: data.handIds, queueIndex: data.startIndex || 0, heroName: data.heroName })
          }
        },

        resetTable: () => {
          const { handData } = get()
          if (!handData) return
          const actions = handActions(handData)
          const snap = emptySnapshot(handData)

          // Replay the setup actions (blinds, hole-card deal) instantly, whatever order the room lists them in.
          const firstReal = findNextRealActionIndex(actions, 0)
          for (let i = 0; i < firstReal; i++) applyAction(snap, actions[i])
          set({ ...snap, currentIndex: firstReal })
        },

        nextStep: () => {
          const { handData, currentIndex } = get()
          if (!handData) return
          const actions = handActions(handData)
          const nextReal = findNextRealActionIndex(actions, currentIndex)
          if (nextReal >= actions.length) return get().stop()

          const { players, pot, board, street, actionLog } = get()
          const snap: TableSnapshot = {
            players: players.map((p) => ({ ...p })),
            pot,
            board: [...board],
            street,
            actionLog: [...actionLog],
          }
          // Setup actions skipped on the way (a blind listed after the deal) still reach the table.
          for (let i = currentIndex; i <= nextReal; i++) applyAction(snap, actions[i])
          set({ ...snap, currentIndex: nextReal + 1 })
        },

        prevStep: () => {
          const { handData, currentIndex } = get()
          if (!handData) return
          const actions = handActions(handData)
          let lastReal = currentIndex - 1
          while (lastReal >= 0 && !isRealAction(actions[lastReal])) lastReal--
          if (lastReal < 0) return get().resetTable()
          // Rebuilding up to (excluding) the last real action undoes exactly that step.
          if (countRealActions(actions, lastReal) === 0) return get().resetTable()
          rebuildTo(lastReal)
        },

        jumpToProgress: (count) => {
          const actions = handActions(get().handData)
          if (count <= 0) return get().resetTable()
          let seen = 0
          for (let i = 0; i < actions.length; i++) {
            if (isRealAction(actions[i]) && ++seen === count) return rebuildTo(i + 1)
          }
          rebuildTo(actions.length)
        },

        jumpToAction: (index) => rebuildTo(index + 1),

        play: () => {
          if (get().isPlaying) return
          // Playing from the end starts the hand over.
          const { handData, currentIndex } = get()
          const actions = handActions(handData)
          if (handData && findNextRealActionIndex(actions, currentIndex) >= actions.length) get().resetTable()
          set({ isPlaying: true })
          playbackTimer = setInterval(() => get().nextStep(), get().playbackSpeed)
        },

        stop: () => {
          set({ isPlaying: false })
          if (playbackTimer) {
            clearInterval(playbackTimer)
            playbackTimer = null
          }
        },

        setSpeed: (ms) => {
          const wasPlaying = get().isPlaying
          set({ playbackSpeed: ms })
          if (wasPlaying) {
            get().stop()
            get().play()
          }
        },

        setViewMode: (viewMode) => set({ viewMode }),
        setShowFoldedPlayers: (showFoldedPlayers) => set({ showFoldedPlayers }),

        nextHand: async () => {
          const { queueIndex, handQueue, heroName } = get()
          if (queueIndex < handQueue.length - 1) {
            set({ queueIndex: queueIndex + 1 })
            await get().loadHand(handQueue[queueIndex + 1], heroName)
          }
        },

        prevHand: async () => {
          const { queueIndex, handQueue, heroName } = get()
          if (queueIndex > 0) {
            set({ queueIndex: queueIndex - 1 })
            await get().loadHand(handQueue[queueIndex - 1], heroName)
          }
        },

        openReplayerWindowForQueue: async (handIds, startIndex, heroName) => {
          const firstHandId = handIds[startIndex] ?? handIds[0]
          if (!firstHandId) return
          try {
            const response = await ipcService.getHandReplay(firstHandId, heroName)
            // Send the queue together with the first hand so the window renders immediately.
            await ipcService.openReplayer(
              response.success ? { handIds, startIndex, heroName, ...response.data } : { handIds, startIndex, heroName },
            )
          } catch (err) {
            logError('Failed to load first hand for queue:', err)
            await ipcService.openReplayer({ handIds, startIndex, heroName })
          }
        },

        openSingleHandReplayer: async (handId, heroName = null) => {
          set({ loading: true })
          try {
            const response = await ipcService.getHandReplay(handId, heroName || get().heroName)
            if (response.success) await ipcService.openReplayer(response.data)
            else set({ error: response.error || 'Failed to get hand details for replayer' })
          } catch (err) {
            set({ error: err instanceof Error ? err.message : String(err) })
          } finally {
            set({ loading: false })
          }
        },
      }
    },
    {
      name: 'replayer-storage',
      partialize: (state) => ({ viewMode: state.viewMode, showFoldedPlayers: state.showFoldedPlayers }),
    },
  ),
)
