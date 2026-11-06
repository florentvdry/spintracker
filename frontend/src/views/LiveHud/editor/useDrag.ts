import { useCallback, useEffect, useRef, useState } from 'react'
import type { CellContent } from '../hudGrid'

/** Drag and drop with pointer events: nothing is dragged natively, so it works the same everywhere. */

export type DragPayload =
  | { kind: 'content'; content: CellContent; label: string; stat?: { section: string; label: string } }
  | { kind: 'cell'; gridId: string; cellId: string; label: string }

export type DropTarget = { type: 'cell'; gridId: string; row: number; col: number } | { type: 'column'; gridId: string; col: number }

/** Pixels the pointer must travel before a press becomes a drag; below it, it is a click. */
const DRAG_THRESHOLD_PX = 4

/** What lies under a point of the screen that can take a drop. */
export function targetAt(x: number, y: number): DropTarget | null {
  const element = document.elementFromPoint(x, y)
  if (!(element instanceof HTMLElement)) return null
  const column = element.closest<HTMLElement>('[data-col-handle]')
  if (column) return { type: 'column', gridId: column.dataset.gridId ?? '', col: Number(column.dataset.colHandle) }
  const cell = element.closest<HTMLElement>('[data-cell]')
  const grid = element.closest<HTMLElement>('[data-grid]')
  if (cell && grid) return { type: 'cell', gridId: grid.dataset.grid ?? '', row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
  return null
}

export interface ActiveDrag {
  payload: DragPayload
  x: number
  y: number
  target: DropTarget | null
}

interface Options {
  onDrop: (payload: DragPayload, target: DropTarget | null, modifiers: { alt: boolean }) => void
}

/** `start` begins a press; `onClick` runs instead of a drop when the pointer barely moved. */
export function useDrag({ onDrop }: Options) {
  const [active, setActive] = useState<ActiveDrag | null>(null)
  const drop = useRef(onDrop)
  drop.current = onDrop
  const cleanup = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanup.current?.(), [])

  const start = useCallback((payload: DragPayload, event: { clientX: number; clientY: number }, onClick?: () => void) => {
    cleanup.current?.()
    const origin = { x: event.clientX, y: event.clientY }
    let dragging = false
    const move = (e: PointerEvent) => {
      if (!dragging && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < DRAG_THRESHOLD_PX) return
      dragging = true
      setActive({ payload, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY) })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      cleanup.current = null
      setActive(null)
    }
    const up = (e: PointerEvent) => {
      stop()
      if (dragging) drop.current(payload, targetAt(e.clientX, e.clientY), { alt: e.altKey })
      else onClick?.()
    }
    const cancel = () => stop()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    cleanup.current = stop
  }, [])

  return { active, start }
}
