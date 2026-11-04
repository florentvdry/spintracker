import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Lock } from 'lucide-react'
import HudGridView, { type GridSlot } from '@/components/livehud/HudGridView'
import { snapPosition, type Axis, type EditorDoc, type Rect } from '../hudEditor'
import { GRID_STEP } from '../hudProfile'
import type { GridPosition, HudFigures, HudGrid } from '../hudGrid'
import { MAX_TRACK_SIZE, MIN_TRACK_SIZE } from '../hudGrid'
import type { Dispatch, EditingCell, Selection } from './types'
import type { DragPayload, DropTarget } from './useDrag'

/** Width of the reference table; the zoom scales everything drawn on it. */
export const REFERENCE_WIDTH = 1000
const TABLE_ASPECT = 0.625
const HANDLE_PX = 12
const RESIZE_EDGE_PX = 5

const SELECTED_OUTLINE = '2px solid #6c9fff'
const SELECTED_TINT = 'rgba(108,159,255,0.28)'
const DROP_TINT = 'rgba(79,209,197,0.35)'
const EMPTY_OUTLINE = '1px dashed #2f3646'

interface TrackMetrics {
  cols: number[]
  rows: number[]
  padLeft: number
  padTop: number
}

const sameMetrics = (a: TrackMetrics | null, b: TrackMetrics) => a !== null && a.padLeft === b.padLeft && a.padTop === b.padTop && a.cols.join() === b.cols.join() && a.rows.join() === b.rows.join()

const trackSizes = (template: string) => template.split(' ').map(parseFloat).filter(Number.isFinite)

interface FrameProps {
  grid: HudGrid
  figures: HudFigures
  playerName: string
  opacity: number
  /** Pixels per pixel of the grid: zoom times the profile's size. */
  scale: number
  selected: boolean
  /** Handles for rows and columns are drawn on the primary grid only. */
  primary: boolean
  selection: Selection
  hover: DropTarget | null
  editing: EditingCell | null
  editorNode: ReactNode
  badCells: ReadonlySet<string>
  dispatch: Dispatch
  onSelect: (next: Selection) => void
  onStartDrag: (payload: DragPayload, event: { clientX: number; clientY: number }, onClick?: () => void) => void
  onEdit: (cell: EditingCell) => void
  /** Pointer went down on the title bar: the caller moves the grid. */
  onTitlePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void
  title?: ReactNode
}

/** A grid with the editor's handles around it. The drawing itself is `HudGridView`'s. */
function GridFrame({
  grid,
  figures,
  playerName,
  opacity,
  scale,
  selected,
  primary,
  selection,
  hover,
  editing,
  editorNode,
  badCells,
  dispatch,
  onSelect,
  onStartDrag,
  onEdit,
  onTitlePointerDown,
  title,
}: FrameProps) {
  const root = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<TrackMetrics | null>(null)
  const [resizing, setResizing] = useState<{ axis: Axis; index: number; size: number } | null>(null)

  // The browser knows the real size of every track (the automatic ones depend on the content).
  useLayoutEffect(() => {
    const body = root.current?.querySelector<HTMLElement>('[data-grid-body]')
    if (!body) return
    const style = getComputedStyle(body)
    const next = { cols: trackSizes(style.gridTemplateColumns), rows: trackSizes(style.gridTemplateRows), padLeft: parseFloat(style.paddingLeft) || 0, padTop: parseFloat(style.paddingTop) || 0 }
    if (!sameMetrics(metrics, next)) setMetrics(next)
  })

  const shown: HudGrid = resizing
    ? {
        ...grid,
        [resizing.axis === 'row' ? 'rows' : 'cols']: (resizing.axis === 'row' ? grid.rows : grid.cols).map((t, i) => (i === resizing.index ? { ...t, size: resizing.size } : t)),
      }
    : grid

  const cellSet = new Set(selection.cellIds)
  const decorate = (slot: GridSlot): { className?: string; style?: CSSProperties } | undefined => {
    const style: CSSProperties = {}
    if (slot.empty) style.outline = EMPTY_OUTLINE
    if (slot.empty) style.outlineOffset = '-1px'
    if (selected && cellSet.has(slot.id)) {
      style.outline = SELECTED_OUTLINE
      style.outlineOffset = '-2px'
      style.background = SELECTED_TINT
    }
    if (badCells.has(slot.id)) style.boxShadow = 'inset 0 -2px 0 #e5594f'
    if (hover?.type === 'cell' && hover.gridId === grid.id && slot.row <= hover.row && hover.row < slot.row + slot.rowSpan && slot.col <= hover.col && hover.col < slot.col + slot.colSpan) {
      style.background = DROP_TINT
    }
    return { style }
  }

  const pressCell = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]')
    if (!element || (event.target as HTMLElement).closest('input')) return
    const id = element.dataset.cell ?? ''
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    const sameGrid = selection.gridIds[0] === grid.id
    const current = sameGrid ? selection.cellIds : []
    const cellIds = additive ? (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]) : [id]
    onSelect({ gridIds: [grid.id], cellIds, track: null })
    if (!id.startsWith('empty:') && !grid.locked && !additive) {
      const view = grid.cells.find((c) => c.id === id)
      onStartDrag({ kind: 'cell', gridId: grid.id, cellId: id, label: view?.content.kind === 'text' ? view.content.text : view?.content.kind ?? '' }, event)
    }
  }

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>, axis: Axis, index: number) => {
    event.stopPropagation()
    if (grid.locked || !metrics) return
    const start = axis === 'row' ? metrics.rows[index] : metrics.cols[index]
    const origin = axis === 'row' ? event.clientY : event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      const delta = ((axis === 'row' ? e.clientY : e.clientX) - origin) / scale
      setResizing({ axis, index, size: Math.round(Math.min(MAX_TRACK_SIZE, Math.max(MIN_TRACK_SIZE, start + delta))) })
    }
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const delta = ((axis === 'row' ? e.clientY : e.clientX) - origin) / scale
      const size = Math.round(Math.min(MAX_TRACK_SIZE, Math.max(MIN_TRACK_SIZE, start + delta)))
      setResizing(null)
      if (Math.abs(delta) >= 1) dispatch({ type: 'patchTrack', gridId: grid.id, axis, index, patch: { size } })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const handleStyle = (axis: Axis, index: number): CSSProperties | null => {
    if (!metrics) return null
    const before = (axis === 'row' ? metrics.rows : metrics.cols).slice(0, index).reduce((a, b) => a + b, 0)
    const size = (axis === 'row' ? metrics.rows : metrics.cols)[index]
    if (size === undefined) return null
    return axis === 'col'
      ? { left: metrics.padLeft + before, top: -HANDLE_PX - 1, width: size, height: HANDLE_PX }
      : { top: metrics.padTop + before, left: -HANDLE_PX - 1, height: size, width: HANDLE_PX }
  }

  const handles =
    primary && selected && metrics ? (
      <>
        {(['col', 'row'] as const).flatMap((axis) =>
          (axis === 'col' ? shown.cols : shown.rows).map((_, index) => {
            const style = handleStyle(axis, index)
            if (!style) return null
            const active = selection.track?.axis === axis && selection.track.index === index
            return (
              <div
                key={`${axis}${index}`}
                style={{ position: 'absolute', ...style }}
                data-col-handle={axis === 'col' ? index : undefined}
                data-grid-id={grid.id}
                className={clsx('cursor-pointer select-none border text-center font-mono text-[8px] leading-[10px]', active ? 'border-primary-500 bg-primary-500/40 text-white' : hover?.type === 'column' && hover.gridId === grid.id && axis === 'col' && hover.col === index ? 'border-teal-400 bg-teal-400/40 text-white' : 'border-dark-100 bg-dark-300/90 text-gray-400')}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onSelect({ gridIds: [grid.id], cellIds: [], track: { axis, index } })
                }}
              >
                {index + 1}
                <div
                  className="absolute z-10 cursor-col-resize bg-transparent hover:bg-primary-500/60"
                  style={axis === 'col' ? { right: -RESIZE_EDGE_PX / 2, top: 0, bottom: 0, width: RESIZE_EDGE_PX, cursor: 'col-resize' } : { bottom: -RESIZE_EDGE_PX / 2, left: 0, right: 0, height: RESIZE_EDGE_PX, cursor: 'row-resize' }}
                  onPointerDown={(e) => beginResize(e, axis, index)}
                  onDoubleClick={() => dispatch({ type: 'patchTrack', gridId: grid.id, axis, index, patch: { size: 'auto' } })}
                />
              </div>
            )
          }),
        )}
      </>
    ) : null

  return (
    <div ref={root} data-frame={grid.id} className="relative" style={{ outline: selected ? '1px solid rgba(108,159,255,0.6)' : undefined, outlineOffset: 2 }}>
      {title !== undefined && (
        <div
          className="absolute left-0 flex items-center gap-1 whitespace-nowrap rounded-t bg-dark-200/90 px-1 text-[9px] leading-[14px] text-gray-300"
          style={{ top: -(HANDLE_PX + 16), cursor: grid.locked ? 'not-allowed' : 'grab', touchAction: 'none' }}
          onPointerDown={onTitlePointerDown}
        >
          {grid.locked && <Lock className="h-2.5 w-2.5" />}
          {title}
        </div>
      )}
      {handles}
      <div
        onPointerDown={pressCell}
        onDoubleClick={(e) => {
          const element = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')
          if (element && !grid.locked) onEdit({ gridId: grid.id, cellId: element.dataset.cell ?? '' })
        }}
      >
        <HudGridView
          grid={shown}
          figures={figures}
          player={{ name: playerName }}
          opacity={opacity}
          showEmptySlots
          decorate={decorate}
          editing={editing && editing.gridId === grid.id ? { cellId: editing.cellId, node: editorNode } : undefined}
        />
      </div>
    </div>
  )
}

export interface CanvasProps {
  doc: EditorDoc
  seat: string
  figures: HudFigures
  opacity: number
  size: number
  zoom: number
  snapToGrid: boolean
  playerName: string
  selection: Selection
  hover: DropTarget | null
  editing: EditingCell | null
  editorNode: ReactNode
  /** Cells flagged by the live validation, by grid id. */
  badCells: Record<string, ReadonlySet<string>>
  popup: HudGrid | null
  sizes: Record<string, { w: number; h: number }>
  onSizes: (sizes: Record<string, { w: number; h: number }>) => void
  dispatch: Dispatch
  onSelect: (next: Selection) => void
  onStartDrag: FrameProps['onStartDrag']
  onEdit: (cell: EditingCell) => void
  position: (gridId: string) => GridPosition
}

interface Moving {
  gridId: string
  offsetX: number
  offsetY: number
  live: GridPosition
}

const NO_BAD: ReadonlySet<string> = new Set()

/** The preview table with the grids of one seat, and below it the popup being edited. */
export default function Canvas(props: CanvasProps) {
  const { doc, seat, figures, opacity, size, zoom, snapToGrid, playerName, selection, hover, editing, editorNode, badCells, popup, sizes, onSizes, dispatch, onSelect, onStartDrag, onEdit, position } = props
  const { t } = useTranslation()
  const table = useRef<HTMLDivElement>(null)
  const frames = useRef<Record<string, HTMLDivElement | null>>({})
  const [moving, setMoving] = useState<Moving | null>(null)
  const tableWidth = REFERENCE_WIDTH * zoom
  const scale = zoom * size

  // Grid sizes as fractions of the table: needed to keep a grid on it and to line grids up.
  useLayoutEffect(() => {
    const box = table.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const next: Record<string, { w: number; h: number }> = {}
    for (const grid of doc.layout.grids) {
      const el = frames.current[grid.id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      next[grid.id] = { w: Math.round((r.width / box.width) * 10000) / 10000, h: Math.round((r.height / box.height) * 10000) / 10000 }
    }
    const same = Object.keys(next).length === Object.keys(sizes).length && Object.entries(next).every(([id, s]) => sizes[id]?.w === s.w && sizes[id]?.h === s.h)
    if (!same) onSizes(next)
  })

  const box = () => table.current?.getBoundingClientRect() ?? null

  const startMove = (grid: HudGrid, event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = box()
    if (!rect || event.button !== 0) return
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    onSelect({ gridIds: additive ? [...new Set([...selection.gridIds, grid.id])] : [grid.id], cellIds: [], track: null })
    if (grid.locked) return
    const start = position(grid.id)
    const pointer = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    const others: Rect[] = doc.layout.grids.filter((g) => g.id !== grid.id && sizes[g.id]).map((g) => ({ ...position(g.id), w: sizes[g.id].w, h: sizes[g.id].h }))
    const own = sizes[grid.id] ?? { w: 0, h: 0 }
    const compute = (e: PointerEvent): GridPosition => {
      const raw = { x: start.x + (e.clientX - pointer.x) / rect.width, y: start.y + (e.clientY - pointer.y) / rect.height }
      // Alt switches the magnetism off for a free placement.
      return snapPosition(raw, own, others, snapToGrid && !e.altKey ? GRID_STEP : null, !e.altKey)
    }
    setMoving({ gridId: grid.id, offsetX: 0, offsetY: 0, live: start })
    const move = (e: PointerEvent) => setMoving({ gridId: grid.id, offsetX: 0, offsetY: 0, live: compute(e) })
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const end = compute(e)
      setMoving(null)
      if (end.x !== start.x || end.y !== start.y) dispatch({ type: 'placeGrid', seat, gridId: grid.id, position: end })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const frameFor = useCallback(
    (grid: HudGrid, extra: Partial<FrameProps>) => (
      <GridFrame
        key={grid.id}
        grid={grid}
        figures={figures}
        playerName={playerName}
        opacity={opacity}
        scale={scale}
        selected={selection.gridIds.includes(grid.id)}
        primary={selection.gridIds[0] === grid.id}
        selection={selection}
        hover={hover}
        editing={editing}
        editorNode={editorNode}
        badCells={badCells[grid.id] ?? NO_BAD}
        dispatch={dispatch}
        onSelect={onSelect}
        onStartDrag={onStartDrag}
        onEdit={onEdit}
        {...extra}
      />
    ),
    [figures, playerName, opacity, scale, selection, hover, editing, editorNode, badCells, dispatch, onSelect, onStartDrag, onEdit],
  )

  return (
    <div className="space-y-4">
      <div className="overflow-auto rounded-lg border border-dark-100 bg-dark-500" onPointerDown={(e) => e.target === e.currentTarget && onSelect({ gridIds: [], cellIds: [], track: null })}>
        <div style={{ padding: `${56}px 40px 40px 40px`, width: tableWidth + 80 }}>
          <div
            ref={table}
            className="relative rounded-lg border border-dark-100 bg-dark-400"
            style={{ width: tableWidth, height: tableWidth * TABLE_ASPECT }}
            onPointerDown={(e) => e.target === e.currentTarget && onSelect({ gridIds: [], cellIds: [], track: null })}
          >
            <div className="pointer-events-none absolute inset-x-[12%] inset-y-[18%] rounded-[50%] border border-dark-100 bg-dark-300" />
            <span className="pointer-events-none absolute bottom-[8%] left-1/2 -translate-x-1/2 rounded bg-dark-200 px-2 py-0.5 text-xs text-gray-400">{t('liveHud.placement.hero')}</span>
            {doc.layout.grids.map((grid) => {
              const live = moving?.gridId === grid.id ? moving.live : position(grid.id)
              return (
                <div
                  key={grid.id}
                  ref={(el) => {
                    frames.current[grid.id] = el
                  }}
                  className="absolute"
                  style={{ left: `${live.x * 100}%`, top: `${live.y * 100}%`, transform: `scale(${scale})`, transformOrigin: 'top left', zIndex: selection.gridIds.includes(grid.id) ? 5 : 1 }}
                >
                  {frameFor(grid, {
                    title: grid.name,
                    onTitlePointerDown: (e) => startMove(grid, e),
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {popup && (
        <div className="overflow-auto rounded-lg border border-dark-100 bg-dark-500">
          <div style={{ padding: `${56}px 40px 24px 40px` }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content', marginBottom: 0 }}>
              {frameFor(popup, { title: `${t('liveHud.editor.popup')}: ${popup.name}`, onTitlePointerDown: (e) => e.button === 0 && onSelect({ gridIds: [popup.id], cellIds: [], track: null }) })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

