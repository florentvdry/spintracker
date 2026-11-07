import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Lock } from 'lucide-react'
import HudGridView, { type GridSlot } from '@/components/livehud/HudGridView'
import type { Axis, EditorDoc } from '../hudEditor'
import type { HudFigures, HudGrid } from '../hudGrid'
import { MAX_TRACK_SIZE, MIN_TRACK_SIZE } from '../hudGrid'
import type { Dispatch, EditingCell, Selection } from './types'
import type { DragPayload, DropTarget } from './useDrag'

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
                className={clsx('cursor-pointer select-none border text-center font-mono text-[8px] leading-[10px]', active ? 'border-primary-500 bg-primary-500/40 text-gray-100' : hover?.type === 'column' && hover.gridId === grid.id && axis === 'col' && hover.col === index ? 'border-teal-400 bg-teal-400/40 text-gray-100' : 'border-dark-100 bg-dark-300/90 text-gray-400')}
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
    <div ref={root} data-frame={grid.id} className="relative" style={{ outline: selected ? '1px solid #6c9fff' : undefined, outlineOffset: 2 }}>
      {title !== undefined && (
        <div
          className={clsx('absolute left-0 flex items-center gap-1 whitespace-nowrap rounded-t px-1.5 text-[10px] font-medium leading-[14px]', selected ? 'bg-primary-600 text-onprimary' : 'bg-dark-300 text-gray-300')}
          style={{ top: -(HANDLE_PX + 16), cursor: 'pointer' }}
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
  figures: HudFigures
  opacity: number
  zoom: number
  playerName: string
  selection: Selection
  hover: DropTarget | null
  editing: EditingCell | null
  editorNode: ReactNode
  /** Cells flagged by the live validation, by grid id. */
  badCells: Record<string, ReadonlySet<string>>
  popup: HudGrid | null
  dispatch: Dispatch
  onSelect: (next: Selection) => void
  onStartDrag: FrameProps['onStartDrag']
  onEdit: (cell: EditingCell) => void
}

const NO_BAD: ReadonlySet<string> = new Set()

/**
 * The grids of the layout side by side, to edit their content. Where they sit on a poker table is
 * set on the table itself, in the HUD window.
 */
export default function Canvas(props: CanvasProps) {
  const { doc, figures, opacity, zoom, playerName, selection, hover, editing, editorNode, badCells, popup, dispatch, onSelect, onStartDrag, onEdit } = props
  const { t } = useTranslation()
  const popupPanel = useRef<HTMLDivElement>(null)
  const popupId = popup?.id

  // The popup is edited under the grids, out of sight: bring it into view when it is picked.
  useEffect(() => {
    if (popupId) popupPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [popupId])

  const frameFor = useCallback(
    (grid: HudGrid, extra: Partial<FrameProps>) => (
      <GridFrame
        key={grid.id}
        grid={grid}
        figures={figures}
        playerName={playerName}
        opacity={opacity}
        scale={zoom}
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
    [figures, playerName, opacity, zoom, selection, hover, editing, editorNode, badCells, dispatch, onSelect, onStartDrag, onEdit],
  )

  const select = (grid: HudGrid) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    onSelect({ gridIds: additive ? [...new Set([...selection.gridIds, grid.id])] : [grid.id], cellIds: [], track: null })
  }

  return (
    <div className="space-y-6 p-6" onPointerDown={(e) => e.target === e.currentTarget && onSelect({ gridIds: [], cellIds: [], track: null })}>
      {doc.layout.grids.length === 0 && <p className="text-sm text-gray-500">{t('liveHud.profiles.empty_layout')}</p>}
      <div className="flex flex-wrap items-start gap-x-10 gap-y-14 px-4 pb-4 pt-10" style={{ zoom }} onPointerDown={(e) => e.target === e.currentTarget && onSelect({ gridIds: [], cellIds: [], track: null })}>
        {doc.layout.grids.map((grid) => (
          <div key={grid.id}>{frameFor(grid, { title: grid.name, onTitlePointerDown: select(grid) })}</div>
        ))}
      </div>

      {popup && (
        <div ref={popupPanel} className="overflow-auto rounded-lg border border-primary-500/50 bg-dark-600">
          <p className="border-b border-dark-100 px-3 py-1.5 text-xs text-gray-300">{t('liveHud.editor.popup_editing', { name: popup.name })}</p>
          <div className="px-10 pb-6 pt-14" style={{ zoom }}>
            {frameFor(popup, { title: `${t('liveHud.editor.popup')}: ${popup.name}`, onTitlePointerDown: select(popup) })}
          </div>
        </div>
      )}
    </div>
  )
}
