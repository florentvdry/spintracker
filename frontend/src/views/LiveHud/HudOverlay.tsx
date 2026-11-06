import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import HudGridView from '@/components/livehud/HudGridView'
import HandsPopup, { type HandsPopupState } from '@/components/livehud/HandsPopup'
import { ipcService, type Json } from '@/services/ipcService'
import { useTranslation } from 'react-i18next'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { logError } from '@/utils/log'
import { figureKey, requestsOf, type CellView, type GridPosition, type HudFigure, type HudFigures, type HudGrid } from './hudGrid'
import { dragTo, type Rect } from './hudEditor'
import { GRID_STEP, seatPositions, SEATS_BY_FORMAT, type HudFormat, type HudRoom, type SeatPlacements } from './hudProfile'
import { figureHandsBody, HOVER_CLOSE_DELAY_MS, HOVER_DELAY_MS, parseFigureHands, prettyLabel, type FigureRef, type HandsOf } from './figureHands'
import { placePopup } from './hudPopup'
import { previewFigures } from './previewData'

/** One opponent's figures. */
export interface LivePanel {
  /** Seat relative to the hero: `+1`, `+2`. */
  seat: string
  name: string
  figures: HudFigures
  tag?: string
  /** The last refresh failed: the figures are the previous ones, shown greyed out. */
  stale?: boolean
}

/** What the shell tells a HUD window about its table. `demo` fills it with example panels (development aid). */
export interface HudPayload {
  demo?: boolean
  room?: HudRoom
  format?: HudFormat
  hero?: string
  players?: { seat: string; name: string }[]
  /** Changes with every hand of the table. */
  lastHandAt?: string
}

const DEMO_FORMAT: HudFormat = 'threeMax'

/** Figures of every player of a table, read from the backend. */
function useLivePanels(payload: HudPayload | null, layoutKey: string, requests: ReturnType<typeof requestsOf>): LivePanel[] {
  const [panels, setPanels] = useState<LivePanel[]>([])
  const seats = payload?.players
  const room = payload?.room
  const hero = payload?.hero
  const lastHandAt = payload?.lastHandAt

  useEffect(() => {
    if (!seats || !room || !hero) {
      setPanels([])
      return
    }
    let cancelled = false
    const markStale = (reason: unknown) => {
      logError('Could not read the HUD figures:', reason)
      setPanels((previous) => previous.map((panel) => ({ ...panel, stale: true })))
    }
    void ipcService
      .getHudPlayers({ room, heroName: hero, players: seats.map((p) => p.name), stats: requests })
      .then((result) => {
        if (cancelled) return
        if (!result.success) {
          markStale(result.message)
          return
        }
        const answers: Json[] = result.data?.players ?? []
        setPanels(
          seats.map((seat) => {
            const answer = answers.find((a) => a.name === seat.name)
            const figures: HudFigures = {}
            for (const stat of (answer?.stats ?? []) as Json[]) {
              // A figure the backend did not count stays absent (no data), it is not a zero.
              if (typeof stat.num !== 'number' || typeof stat.den !== 'number') continue
              const figure: HudFigure = { pct: stat.pct ?? null, num: stat.num, den: stat.den }
              figures[figureKey(stat.section, stat.label, stat.column ?? null, stat.bucket ?? null)] = figure
            }
            return { seat: seat.seat, name: seat.name, figures, tag: answer?.tag || undefined }
          }),
        )
      })
      .catch((error: unknown) => {
        if (!cancelled) markStale(error)
      })
    return () => {
      cancelled = true
    }
    // The figures are read again with each hand and when the layout changes.
  }, [seats, room, hero, lastHandAt, layoutKey, requests])

  return panels
}

interface OpenPopup {
  /** The cell that opened it, so that a second click on the same cell closes it. */
  key: string
  seat: string
  popupId: string
  /** The clicked cell's rectangle, in window pixels. */
  anchor: { left: number; top: number; width: number; height: number }
}

/** The list of hands behind a stat that has been held under the pointer. */
interface OpenHands {
  /** The cell it belongs to, so that staying on the same cell does not open it again. */
  key: string
  seat: string
  figure: FigureRef
  which: HandsOf
  anchor: { left: number; top: number; width: number; height: number }
  state: HandsPopupState
}

/** Margin kept between a popup and the border of the window, in pixels. */
const WINDOW_MARGIN_PX = 8
const HANDS_POPUP_MAX_HEIGHT_PX = 590
const HANDS_POPUP_WIDTH_PX = 504

/** The page of a HUD window: the grids of one table, at their saved positions. */
export default function HudOverlay() {
  const { t } = useTranslation()
  const settings = useLiveHudStore((s) => s.settings)
  const load = useLiveHudStore((s) => s.load)
  const loaded = useLiveHudStore((s) => s.loaded)
  const [payload, setPayload] = useState<HudPayload | null>(null)
  const [popup, setPopup] = useState<OpenPopup | null>(null)
  const [hands, setHands] = useState<OpenHands | null>(null)
  const handsRef = useRef<OpenHands | null>(null)
  handsRef.current = hands
  const hoverTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  /** Answers of earlier requests are ignored once a newer one was sent. */
  const handsRequest = useRef(0)
  const [moving, setMoving] = useState<{ key: string; position: GridPosition } | null>(null)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    void load()
    let cancelled = false
    void ipcService.getHudState().then((state) => {
      if (!cancelled && state) setPayload(state)
    })
    const stop = ipcService.onHudState((state) => setPayload(state))
    // The window stays open while the user edits the profile in the main window.
    const stopSettings = ipcService.onHudSettingsChanged(() => void load())
    return () => {
      cancelled = true
      stop()
      stopSettings()
    }
  }, [load])

  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  // The grids follow the table's size: a table of two players shows the heads-up layout.
  const format = payload?.format ?? DEMO_FORMAT
  const layout = profile.layouts[format]
  const requests = useMemo(() => requestsOf(layout), [layout])
  const live = useLivePanels(payload, `${profile.id}:${format}`, requests)

  const panels = useMemo<LivePanel[]>(() => {
    if (payload?.demo) {
      const figures = previewFigures(layout)
      return SEATS_BY_FORMAT[format].map((seat, i) => ({ seat, name: t('liveHud.live.demo_player', { n: i + 1 }), figures }))
    }
    return live
  }, [payload, layout, format, live, t])

  const positions = useMemo(
    () => Object.fromEntries(SEATS_BY_FORMAT[format].map((seat) => [seat, seatPositions(settings.placements, format, seat, layout.grids)])),
    [settings.placements, format, layout.grids],
  )

  // A popup belongs to one hand's figures: the next hand closes it. The window never has the
  // keyboard focus (it must not take it from the poker client), so there is no key to close it.
  useEffect(() => setPopup(null), [payload?.lastHandAt, profile.id, format])

  const stopTimers = useCallback(() => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    hoverTimer.current = null
    closeTimer.current = null
  }, [])

  // The next hand, another layout or leaving the page ends any wait and closes the list.
  useEffect(() => {
    stopTimers()
    handsRequest.current += 1
    setHands(null)
    return stopTimers
  }, [payload?.lastHandAt, profile.id, format, stopTimers])

  const loadHands = useCallback(
    (seat: string, figure: FigureRef, which: HandsOf) => {
      const room = payload?.room
      const hero = payload?.hero
      const player = panels.find((p) => p.seat === seat)?.name
      if (payload?.demo || !room || !hero || !player) return
      const request = ++handsRequest.current
      const settle = (state: HandsPopupState) => {
        if (request === handsRequest.current) setHands((current) => (current ? { ...current, state } : current))
      }
      ipcService
        .getHudFigureHands(figureHandsBody(room, hero, player, figure, which))
        .then((result) => {
          const data = result.success ? parseFigureHands(result.data) : null
          if (!data) logError('Could not read the hands behind a figure:', result.success ? 'unexpected answer' : result.message)
          settle(data ? { status: 'ready', data } : { status: 'error' })
        })
        .catch((error: unknown) => {
          logError('Could not read the hands behind a figure:', error)
          settle({ status: 'error' })
        })
    },
    [payload?.room, payload?.hero, payload?.demo, panels],
  )

  // A stat held under the pointer opens its hands after a pause; leaving it closes them, unless the
  // pointer goes onto the list itself.
  const scheduleClose = useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      handsRequest.current += 1
      setHands(null)
    }, HOVER_CLOSE_DELAY_MS)
  }, [])

  const hoverFigure = useCallback(
    (seat: string, cell: CellView, event: ReactMouseEvent<HTMLElement>) => {
      const figure = cell.figure
      if (!figure || moving) return
      const target = event.currentTarget
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      closeTimer.current = null
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
      const key = `${seat}:${cell.id}`
      if (handsRef.current?.key === key) return
      hoverTimer.current = window.setTimeout(() => {
        hoverTimer.current = null
        const rect = target.getBoundingClientRect()
        setPopup(null)
        setHands({ key, seat, figure, which: 'done', anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, state: { status: 'loading' } })
        loadHands(seat, figure, 'done')
      }, HOVER_DELAY_MS)
    },
    [moving, loadHands],
  )

  const leaveFigure = useCallback(() => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    if (handsRef.current) scheduleClose()
  }, [scheduleClose])

  const chooseHands = (which: HandsOf) => {
    const current = handsRef.current
    if (!current || current.which === which) return
    setHands({ ...current, which, state: { status: 'loading' } })
    loadHands(current.seat, current.figure, which)
  }

  const openPopup = useCallback((seat: string, grid: string, cell: CellView, event: ReactMouseEvent<HTMLElement>) => {
    if (!cell.popupId) return
    stopTimers()
    setHands(null)
    const rect = event.currentTarget.getBoundingClientRect()
    const key = `${seat}:${grid}:${cell.id}`
    setPopup((current) => (current?.key === key ? null : { key, seat, popupId: cell.popupId as string, anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }))
  }, [])

  // Dragging a grid by its bar: it follows the pointer, and is saved where it is dropped.
  const startMove = (seat: string, grid: HudGrid, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const key = `${seat}:${grid.id}`
    const box = refs.current[key]?.getBoundingClientRect()
    const start = positions[seat]?.[grid.id]
    if (!box || !start) return
    const screen = { width: window.innerWidth, height: window.innerHeight }
    const size = { w: box.width / screen.width, h: box.height / screen.height }
    const others: Rect[] = []
    for (const other of layout.grids) {
      const r = refs.current[`${seat}:${other.id}`]?.getBoundingClientRect()
      const at = positions[seat]?.[other.id]
      if (other.id !== grid.id && r && at) others.push({ ...at, w: r.width / screen.width, h: r.height / screen.height })
    }
    const origin = { x: event.clientX, y: event.clientY }
    // Alt: free placement, no magnetism.
    const compute = (e: PointerEvent) =>
      dragTo(start, { x: e.clientX - origin.x, y: e.clientY - origin.y }, screen, size, others, settings.snapToGrid && !e.altKey ? GRID_STEP : null, !e.altKey)
    setMoving({ key, position: start })
    const move = (e: PointerEvent) => setMoving({ key, position: compute(e) })
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setMoving(null)
      const end = compute(e)
      if (end.x === start.x && end.y === start.y) return
      const seats: Record<string, SeatPlacements> = {}
      for (const s of SEATS_BY_FORMAT[format]) seats[s] = { ...positions[s] }
      seats[seat][grid.id] = end
      useLiveHudStore.getState().setEditorDoc(profile.id, format, layout, seats)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // The shell lets clicks through everywhere except on the grids, so it needs their rectangles.
  const popupGrid = popup ? layout.popups.find((p) => p.id === popup.popupId) : undefined
  useLayoutEffect(() => {
    const report = () => {
      // While a grid is dragged the whole window takes the mouse, so that the pointer never slips off it.
      const rects = moving
        ? [{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }]
        : Object.values(refs.current)
            .filter((el): el is HTMLDivElement => el !== null)
            .map((el) => el.getBoundingClientRect())
            .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }))
      void ipcService.setHudPanelRects(rects)
    }
    report()
    window.addEventListener('resize', report)
    return () => window.removeEventListener('resize', report)
  }, [panels, positions, profile.size, loaded, popup, hands, layout, moving])

  // Escape and a click outside also close it, for the day the window can have the focus.
  useEffect(() => {
    if (!popup) return
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(event.target as HTMLElement).closest('[data-popup]')) setPopup(null)
    }
    window.addEventListener('keydown', close)
    window.addEventListener('pointerdown', close)
    return () => {
      window.removeEventListener('keydown', close)
      window.removeEventListener('pointerdown', close)
    }
  }, [popup])

  // A click anywhere else closes the list of hands too.
  useEffect(() => {
    if (!hands) return
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('[data-hands-popup]')) setHands(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [hands])

  if (!loaded) return null
  const popupPlayer = popup ? panels.find((p) => p.seat === popup.seat) : undefined
  const handsPlayer = hands ? panels.find((p) => p.seat === hands.seat) : undefined
  const handsTitle = (figure: FigureRef) => (figure.section === 'custom' ? t('liveHud.hands.custom_stat') : figure.section === 'meta' ? t('liveHud.hands.all_hands') : prettyLabel(figure.label))
  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {panels.flatMap((panel) =>
        layout.grids.map((grid) => {
          const saved = positions[panel.seat]?.[grid.id]
          if (!saved) return null
          const key = `${panel.seat}:${grid.id}`
          const position = moving?.key === key ? moving.position : saved
          return (
            <div
              key={key}
              ref={(el) => {
                refs.current[key] = el
              }}
              className={`group absolute origin-top-left ${panel.stale ? 'opacity-40 grayscale' : ''}`}
              title={panel.stale ? t('liveHud.live.figures_error') : undefined}
              style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, transform: `scale(${profile.size})` }}
            >
              <HudGridView
                grid={grid}
                figures={panel.figures}
                player={{ name: panel.name, tag: panel.tag }}
                opacity={profile.opacity}
                onPopup={(cell, event) => openPopup(panel.seat, grid.id, cell, event)}
                onFigureEnter={(cell, event) => hoverFigure(panel.seat, cell, event)}
                onFigureLeave={leaveFigure}
              />
              {!grid.locked && (
                <div
                  className="absolute inset-x-0 top-0 h-[7px] cursor-move touch-none rounded-t-[4px] bg-[#6c9fff]/70 opacity-0 transition-opacity group-hover:opacity-100"
                  onPointerDown={(e) => startMove(panel.seat, grid, e)}
                />
              )}
            </div>
          )
        }),
      )}
      {popup && popupGrid && popupPlayer && (
        <div
          data-popup
          ref={(el) => {
            refs.current.popup = el
            // Kept inside the window, whatever the scale.
            if (el) {
              const box = el.getBoundingClientRect()
              const spot = placePopup(popup.anchor, { width: box.width, height: box.height }, { width: window.innerWidth, height: window.innerHeight })
              el.style.left = `${spot.left}px`
              el.style.top = `${spot.top}px`
            }
          }}
          className="absolute origin-top-left"
          style={{ left: popup.anchor.left, top: popup.anchor.top + popup.anchor.height, transform: `scale(${profile.size})` }}
        >
          <HudGridView grid={popupGrid} figures={popupPlayer.figures} player={{ name: popupPlayer.name, tag: popupPlayer.tag }} opacity={1} />
          <button
            type="button"
            aria-label="×"
            className="absolute -right-2 -top-2 h-4 w-4 rounded-full bg-[#2f3646] text-[10px] leading-4 text-[#e6e9ef]"
            onClick={() => setPopup(null)}
          >
            ×
          </button>
        </div>
      )}
      {hands && handsPlayer && (
        <div
          data-hands-popup
          ref={(el) => {
            refs.current.handsPopup = el
            // Kept inside the window, whatever the scale and the size of the list.
            if (el) {
              const box = el.getBoundingClientRect()
              const spot = placePopup(hands.anchor, { width: box.width, height: box.height }, { width: window.innerWidth, height: window.innerHeight })
              el.style.left = `${spot.left}px`
              el.style.top = `${spot.top}px`
            }
          }}
          className="absolute origin-top-left"
          style={{
            left: hands.anchor.left,
            top: hands.anchor.top + hands.anchor.height,
            transform: `scale(${profile.size})`,
            width: HANDS_POPUP_WIDTH_PX,
            maxWidth: Math.floor((window.innerWidth - WINDOW_MARGIN_PX) / profile.size),
            maxHeight: Math.min(HANDS_POPUP_MAX_HEIGHT_PX, Math.floor((window.innerHeight - WINDOW_MARGIN_PX) / profile.size)),
          }}
          onPointerEnter={() => {
            if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
            closeTimer.current = null
          }}
          onPointerLeave={scheduleClose}
        >
          <HandsPopup title={handsTitle(hands.figure)} player={handsPlayer.name} which={hands.which} onWhich={chooseHands} state={hands.state} />
        </div>
      )}
    </div>
  )
}
