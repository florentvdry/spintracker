import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import HudGridView from '@/components/livehud/HudGridView'
import { dragTo, type EditorDoc } from '../hudEditor'
import { estimateGridSize, REFERENCE_TABLE, type GridPosition, type HudFigures, type HudGrid } from '../hudGrid'
import { GRID_STEP } from '../hudProfile'
import type { Placed } from './PlacementInspector'

interface Props {
  doc: EditorDoc
  seats: string[]
  figures: HudFigures
  playerName: string
  opacity: number
  /** The profile's size. */
  size: number
  zoom: number
  snap: boolean
  placed: Placed | null
  onSelect: (placed: Placed) => void
  onPlace: (seat: string, gridId: string, position: GridPosition) => void
}

interface Dragging extends Placed {
  position: GridPosition
}

const SEAT_TINT = ['text-sky-300 bg-sky-500/20', 'text-amber-300 bg-amber-500/20']

/** A fraction of the table window: the size a grid takes on the reference table. */
const fractionOf = (grid: HudGrid, scale: number) => {
  const { width, height } = estimateGridSize(grid)
  return { w: (width * scale) / REFERENCE_TABLE.width, h: (height * scale) / REFERENCE_TABLE.height }
}

/**
 * A poker table with the grids of every opponent seat on it. A grid is dragged to where it should appear;
 * the new place is saved when the pointer is released, as one undo step.
 */
export default function TableStage({ doc, seats, figures, playerName, opacity, size, zoom, snap, placed, onSelect, onPlace }: Props) {
  const { t } = useTranslation()
  const stage = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<Dragging | null>(null)

  const positionOf = (seat: string, gridId: string): GridPosition => (dragging && dragging.seat === seat && dragging.gridId === gridId ? dragging.position : doc.seats[seat]?.[gridId] ?? { x: 0, y: 0 })

  const begin = (event: ReactPointerEvent<HTMLDivElement>, seat: string, grid: HudGrid) => {
    if (event.button !== 0 || !stage.current) return
    event.preventDefault()
    onSelect({ seat, gridId: grid.id })
    if (grid.locked) return
    const box = stage.current.getBoundingClientRect()
    const start = positionOf(seat, grid.id)
    const origin = { x: event.clientX, y: event.clientY }
    const mine = fractionOf(grid, size)
    const others = doc.layout.grids
      .filter((g) => g.id !== grid.id)
      .map((g) => ({ ...fractionOf(g, size), ...positionOf(seat, g.id) }))
    const at = (e: PointerEvent) => dragTo(start, { x: e.clientX - origin.x, y: e.clientY - origin.y }, { width: box.width, height: box.height }, mine, others, snap ? GRID_STEP : null, !e.altKey)

    const move = (e: PointerEvent) => setDragging({ seat, gridId: grid.id, position: at(e) })
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragging(null)
      onPlace(seat, grid.id, at(e))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={stage}
      className="relative shrink-0 overflow-hidden rounded-xl border border-dark-100 bg-dark-600"
      style={{ width: REFERENCE_TABLE.width * zoom, height: REFERENCE_TABLE.height * zoom }}
    >
      <div className="absolute inset-[6%] rounded-[50%] border-2 border-dark-100 bg-gradient-to-b from-dark-300 to-dark-400" />
      <span className="absolute bottom-[7%] left-1/2 -translate-x-1/2 rounded bg-dark-200 px-2 py-0.5 text-[11px] text-gray-300">{t('liveHud.ws.hero')}</span>

      {seats.map((seat, seatIndex) =>
        doc.layout.grids.map((grid) => {
          const position = positionOf(seat, grid.id)
          const isPlaced = placed?.seat === seat && placed.gridId === grid.id
          return (
            <div key={`${seat}:${grid.id}`} className="absolute" style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}>
              <div style={{ zoom: size * zoom }} className={clsx('relative rounded', isPlaced ? 'outline outline-2 outline-primary-400' : 'outline outline-1 outline-transparent hover:outline-gray-500')}>
                <span className={clsx('pointer-events-none absolute -top-4 left-0 whitespace-nowrap rounded px-1 text-[9px] leading-[14px]', SEAT_TINT[seatIndex % SEAT_TINT.length])}>{`${seat} · ${grid.name}`}</span>
                <div className={clsx(grid.locked ? 'cursor-not-allowed' : 'cursor-move')} onPointerDown={(e) => begin(e, seat, grid)}>
                  <div className="pointer-events-none">
                    <HudGridView grid={grid} figures={figures} player={{ name: playerName }} opacity={opacity} />
                  </div>
                </div>
              </div>
            </div>
          )
        }),
      )}
    </div>
  )
}
