import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import HudGridView from '@/components/livehud/HudGridView'
import Card from '@/components/ui/Card'
import { useLiveHudStore } from '@/stores/liveHudStore'
import type { GridPosition } from './hudGrid'
import { HUD_FORMATS, HUD_ROOMS, SEATS_BY_FORMAT, seatPositions, snap, type HudFormat, type HudRoom, type SeatPlacements } from './hudProfile'
import { previewFigures } from './previewData'

/** Width of the preview table in pixels: about the size of a table window, so grids look as they will. */
const PREVIEW_TABLE_WIDTH = 1000

interface DragState {
  seat: string
  gridId: string
  offsetX: number
  offsetY: number
  /** Size of the dragged grid as a fraction of the table. */
  widthFraction: number
  heightFraction: number
}

export default function PlacementTab() {
  const { t } = useTranslation()
  const { settings, setEditorDoc, setSnapToGrid } = useLiveHudStore()
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const [room, setRoom] = useState<HudRoom>('Winamax')
  const [format, setFormat] = useState<HudFormat>('threeMax')
  const [dragging, setDragging] = useState<DragState | null>(null)
  // The position under the pointer while dragging; it is saved when the pointer is released.
  const [live, setLive] = useState<GridPosition | null>(null)
  const table = useRef<HTMLDivElement>(null)

  const layout = profile.layouts[format]
  const figures = useMemo(() => previewFigures(layout), [layout])
  const seats = SEATS_BY_FORMAT[format]
  const positions = useMemo(
    () => Object.fromEntries(seats.map((seat) => [seat, seatPositions(settings.placements, room, format, seat, layout.grids)])),
    [seats, settings.placements, room, format, layout.grids],
  )

  useEffect(() => setDragging(null), [room, format])

  const startDrag = (seat: string, gridId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const box = table.current?.getBoundingClientRect()
    if (!box) return
    const position = positions[seat][gridId]
    const grid = event.currentTarget.getBoundingClientRect()
    setDragging({
      seat,
      gridId,
      offsetX: event.clientX - (box.left + position.x * box.width),
      offsetY: event.clientY - (box.top + position.y * box.height),
      widthFraction: grid.width / box.width,
      heightFraction: grid.height / box.height,
    })
    setLive(position)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = table.current?.getBoundingClientRect()
    if (!dragging || !box) return
    const place = (value: number, fraction: number) => {
      const limit = Math.max(0, 1 - fraction)
      const next = Math.min(limit, Math.max(0, value))
      return settings.snapToGrid ? Math.min(limit, snap(next)) : next
    }
    setLive({
      x: place((event.clientX - dragging.offsetX - box.left) / box.width, dragging.widthFraction),
      y: place((event.clientY - dragging.offsetY - box.top) / box.height, dragging.heightFraction),
    })
  }

  const drop = () => {
    if (dragging && live) {
      const seatsNow: Record<string, SeatPlacements> = {}
      for (const seat of seats) seatsNow[seat] = { ...positions[seat] }
      seatsNow[dragging.seat][dragging.gridId] = live
      setEditorDoc(profile.id, room, format, layout, seatsNow)
    }
    setDragging(null)
    setLive(null)
  }

  const tab = (active: boolean) => clsx('rounded-md border px-3 py-1.5 text-sm', active ? 'border-primary-500 bg-primary-500 text-white' : 'border-dark-100 text-gray-300')

  return (
    <Card title={t('liveHud.placement.title')} subtitle={t('liveHud.placement.subtitle')}>
      <div className="mb-4 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('liveHud.placement.room')}</span>
          {HUD_ROOMS.map((r) => (
            <button key={r} className={tab(r === room)} onClick={() => setRoom(r)}>
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('liveHud.placement.format')}</span>
          {HUD_FORMATS.map((f) => (
            <button key={f} className={tab(f === format)} onClick={() => setFormat(f)}>
              {t(`liveHud.format.${f}`)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={settings.snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
          {t('liveHud.placement.snap')}
        </label>
      </div>

      <div className="overflow-auto">
        <div ref={table} className="relative mx-auto aspect-[16/10] overflow-hidden rounded-lg border border-dark-100 bg-dark-500" style={{ width: PREVIEW_TABLE_WIDTH }}>
          <div className="absolute inset-x-[12%] inset-y-[18%] rounded-[50%] border border-dark-100 bg-dark-300" />
          <span className="absolute bottom-[8%] left-1/2 -translate-x-1/2 rounded bg-dark-200 px-2 py-0.5 text-xs text-gray-400">{t('liveHud.placement.hero')}</span>
          {seats.flatMap((seat) =>
            layout.grids.map((grid) => {
              const moving = dragging?.seat === seat && dragging.gridId === grid.id
              const position = moving && live ? live : positions[seat][grid.id]
              return (
                <div
                  key={`${seat}:${grid.id}`}
                  className={clsx('absolute touch-none', moving ? 'cursor-grabbing' : 'cursor-grab')}
                  style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, transform: `scale(${profile.size})`, transformOrigin: 'top left' }}
                  onPointerDown={(e) => startDrag(seat, grid.id, e)}
                  onPointerMove={drag}
                  onPointerUp={drop}
                  onPointerCancel={() => setDragging(null)}
                >
                  <HudGridView grid={grid} figures={figures} player={{ name: t('liveHud.preview.player', { n: seat === '+1' ? 1 : 2 }) }} opacity={profile.opacity} />
                </div>
              )
            }),
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500">{t('liveHud.placement.note')}</p>
    </Card>
  )
}
