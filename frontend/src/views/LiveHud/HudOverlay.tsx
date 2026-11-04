import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import HudPanel, { type HudFigures } from '@/components/livehud/HudPanel'
import { ipcService } from '@/services/ipcService'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { SEATS_BY_FORMAT, type HudFormat, type HudRoom } from './hudProfile'
import { previewFigures } from './previewData'

/** One opponent's panel, as the shell sends it. */
export interface LivePanel {
  /** Seat relative to the hero: `+1`, `+2`. */
  seat: string
  name: string
  figures: HudFigures
  tag?: string
  /** No hand of this opponent was written yet. */
  waiting?: boolean
}

/** What a HUD window shows. `demo` fills it with example panels (development aid). */
export interface HudPayload {
  demo?: boolean
  room?: HudRoom
  format?: HudFormat
  panels?: LivePanel[]
}

const DEMO_ROOM: HudRoom = 'Winamax'
const DEMO_FORMAT: HudFormat = 'threeMax'

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

  const panels = useMemo<LivePanel[]>(() => {
    if (payload?.panels) return payload.panels
    if (!payload?.demo) return []
    const figures = previewFigures(layout)
    return SEATS_BY_FORMAT[format].map((seat, i) => ({ seat, name: `Player ${i + 1}`, figures }))
  }, [payload, layout, format])

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
