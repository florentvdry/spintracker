import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import HudGridView from '@/components/livehud/HudGridView'
import { ipcService, type Json } from '@/services/ipcService'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { figureKey, requestsOf, type CellView, type HudFigure, type HudFigures } from './hudGrid'
import { seatPositions, SEATS_BY_FORMAT, type HudFormat, type HudRoom } from './hudProfile'
import { placePopup } from './hudPopup'
import { previewFigures } from './previewData'

/** One opponent's figures. */
export interface LivePanel {
  /** Seat relative to the hero: `+1`, `+2`. */
  seat: string
  name: string
  figures: HudFigures
  tag?: string
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

const DEMO_ROOM: HudRoom = 'Winamax'
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
    void ipcService
      .getHudPlayers({ room, heroName: hero, players: seats.map((p) => p.name), stats: requests })
      .then((result) => {
        if (cancelled || !result.success) return
        const answers: Json[] = result.data?.players ?? []
        setPanels(
          seats.map((seat) => {
            const answer = answers.find((a) => a.name === seat.name)
            const figures: HudFigures = {}
            for (const stat of (answer?.stats ?? []) as Json[]) {
              const figure: HudFigure = { pct: stat.pct ?? null, num: stat.num ?? 0, den: stat.den ?? 0 }
              figures[figureKey(stat.section, stat.label, stat.column ?? null, stat.bucket ?? null)] = figure
            }
            return { seat: seat.seat, name: seat.name, figures, tag: answer?.tag || undefined }
          }),
        )
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

/** The page of a HUD window: the grids of one table, at their saved positions. */
export default function HudOverlay() {
  const settings = useLiveHudStore((s) => s.settings)
  const load = useLiveHudStore((s) => s.load)
  const loaded = useLiveHudStore((s) => s.loaded)
  const [payload, setPayload] = useState<HudPayload | null>(null)
  const [popup, setPopup] = useState<OpenPopup | null>(null)
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
  const room = payload?.room ?? DEMO_ROOM
  // The grids follow the table's size: a table of two players shows the heads-up layout.
  const format = payload?.format ?? DEMO_FORMAT
  const layout = profile.layouts[format]
  const requests = useMemo(() => requestsOf(layout), [layout])
  const live = useLivePanels(payload, `${profile.id}:${format}`, requests)

  const panels = useMemo<LivePanel[]>(() => {
    if (payload?.demo) {
      const figures = previewFigures(layout)
      return SEATS_BY_FORMAT[format].map((seat, i) => ({ seat, name: `Player ${i + 1}`, figures }))
    }
    return live
  }, [payload, layout, format, live])

  const positions = useMemo(
    () => Object.fromEntries(SEATS_BY_FORMAT[format].map((seat) => [seat, seatPositions(settings.placements, room, format, seat, layout.grids)])),
    [settings.placements, room, format, layout.grids],
  )

  // A popup belongs to one hand's figures: the next hand closes it. The window never has the
  // keyboard focus (it must not take it from the poker client), so there is no key to close it.
  useEffect(() => setPopup(null), [payload?.lastHandAt, profile.id, format])

  const openPopup = useCallback((seat: string, grid: string, cell: CellView, event: ReactMouseEvent<HTMLElement>) => {
    if (!cell.popupId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const key = `${seat}:${grid}:${cell.id}`
    setPopup((current) => (current?.key === key ? null : { key, seat, popupId: cell.popupId as string, anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }))
  }, [])

  // The shell lets clicks through everywhere except on the grids, so it needs their rectangles.
  const popupGrid = popup ? layout.popups.find((p) => p.id === popup.popupId) : undefined
  useLayoutEffect(() => {
    const report = () => {
      const rects = Object.values(refs.current)
        .filter((el): el is HTMLDivElement => el !== null)
        .map((el) => el.getBoundingClientRect())
        .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }))
      void ipcService.setHudPanelRects(rects)
    }
    report()
    window.addEventListener('resize', report)
    return () => window.removeEventListener('resize', report)
  }, [panels, positions, profile.size, loaded, popup, layout])

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

  if (!loaded) return null
  const popupPlayer = popup ? panels.find((p) => p.seat === popup.seat) : undefined
  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {panels.flatMap((panel) =>
        layout.grids.map((grid) => {
          const position = positions[panel.seat]?.[grid.id]
          if (!position) return null
          const key = `${panel.seat}:${grid.id}`
          return (
            <div
              key={key}
              ref={(el) => {
                refs.current[key] = el
              }}
              className="absolute origin-top-left"
              style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, transform: `scale(${profile.size})` }}
            >
              <HudGridView
                grid={grid}
                figures={panel.figures}
                player={{ name: panel.name, tag: panel.tag }}
                opacity={profile.opacity}
                onPopup={(cell, event) => openPopup(panel.seat, grid.id, cell, event)}
              />
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
    </div>
  )
}
