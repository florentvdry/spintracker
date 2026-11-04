import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import HudPanel, { type HudFigure, type HudFigures } from '@/components/livehud/HudPanel'
import { ipcService, type Json } from '@/services/ipcService'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { figureKey, requestsOf, SEATS_BY_FORMAT, type HudFormat, type HudRoom } from './hudProfile'
import { previewFigures } from './previewData'

/** One opponent's panel. */
export interface LivePanel {
  /** Seat relative to the hero: `+1`, `+2`. */
  seat: string
  name: string
  figures: HudFigures
  tag?: string
  /** No hand of this opponent was written yet. */
  waiting?: boolean
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
            return { seat: seat.seat, name: seat.name, figures, tag: answer?.tag || undefined, waiting: !answer || answer.hands === 0 }
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

/** The page of a HUD window: the panels of one table, at their saved positions. */
export default function HudOverlay() {
  const settings = useLiveHudStore((s) => s.settings)
  const load = useLiveHudStore((s) => s.load)
  const loaded = useLiveHudStore((s) => s.loaded)
  const [payload, setPayload] = useState<HudPayload | null>(null)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    void load()
    let cancelled = false
    void ipcService.getHudState().then((state) => {
      if (!cancelled && state) setPayload(state)
    })
    const stop = ipcService.onHudState((state) => setPayload(state))
    return () => {
      cancelled = true
      stop()
    }
  }, [load])

  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const room = payload?.room ?? DEMO_ROOM
  // The panel follows the table's size: a table of two players shows the heads-up layout.
  const format = payload?.format ?? DEMO_FORMAT
  const layout = profile.layouts[format]
  const placements = settings.placements[room][format]
  const requests = useMemo(() => requestsOf(layout), [layout])
  const live = useLivePanels(payload, `${profile.id}:${format}`, requests)

  const panels = useMemo<LivePanel[]>(() => {
    if (payload?.demo) {
      const figures = previewFigures(layout)
      return SEATS_BY_FORMAT[format].map((seat, i) => ({ seat, name: `Player ${i + 1}`, figures }))
    }
    return live
  }, [payload, layout, format, live])

  // The shell lets clicks through everywhere except on the panels, so it needs their rectangles.
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
  }, [panels, placements, profile.size, loaded])

  if (!loaded) return null
  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {panels.map((panel) => {
        const position = placements[panel.seat]
        if (!position) return null
        return (
          <div
            key={panel.seat}
            ref={(el) => {
              refs.current[panel.seat] = el
            }}
            className="absolute"
            style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
          >
            <HudPanel
              name={panel.name}
              layout={layout}
              figures={panel.figures}
              opacity={profile.opacity}
              size={profile.size}
              tagColor={panel.tag}
              waiting={panel.waiting}
            />
          </div>
        )
      })}
    </div>
  )
}
