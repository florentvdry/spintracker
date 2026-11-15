import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { cellOf, GRID_SIZE, handAt, HAND_CLASSES, rectBetween, rowOf, type PaintMode } from '@/utils/ranges'

export interface MatrixCell {
  color: string
  textColor: string
  dim?: boolean
  outline?: 'edited' | 'deviation' | 'focus'
  /** Small count in the top right corner (deviations of the hand). */
  badge?: number
  /** Shown in a small card while the pointer is over the cell. */
  tip?: ReactNode
}

interface RangeMatrixProps {
  cells: Record<string, MatrixCell>
  size?: 'sm' | 'md'
  label: string
  /** Makes the grid editable: called with the hands to paint; `start` is true on a new stroke. */
  onPaint?: (hands: string[], start: boolean) => void
  /** The picker mode takes the action of a cell. */
  onPick?: (hand: string) => void
  paintMode?: PaintMode
}

/** Half the width of the hover card, used to keep it inside the grid. */
const TIP_HALF_WIDTH = 115
/** Cells this close to the top get their card below them instead of above. */
const TIP_FLIP_BELOW_PX = 130

const OUTLINE_CLASS: Record<NonNullable<MatrixCell['outline']>, string> = {
  edited: 'ring-2 ring-inset ring-white',
  deviation: 'ring-2 ring-inset ring-deviation',
  focus: 'ring-2 ring-inset ring-white font-bold',
}

/** The 13 x 13 grid of hand classes, coloured by the player's actions. */
export default function RangeMatrix({ cells, size = 'md', label, onPaint, onPick, paintMode = 'brush' }: RangeMatrixProps) {
  const editable = Boolean(onPaint || onPick)
  const [anchor, setAnchor] = useState<string | null>(null)
  const [cursor, setCursor] = useState('AA')
  const container = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ hand: string; x: number; y: number; height: number } | null>(null)

  const act = (hand: string, shift: boolean, start: boolean) => {
    if (paintMode === 'picker') return onPick?.(hand)
    if (!onPaint) return
    if (shift) return onPaint(rowOf(hand), true)
    if (paintMode === 'rect') {
      if (!start) return
      if (anchor === null) return setAnchor(hand)
      setAnchor(null)
      return onPaint(rectBetween(anchor, hand), true)
    }
    onPaint([hand], start)
  }

  const onPointerDown = (hand: string) => (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    setCursor(hand)
    act(hand, e.shiftKey, true)
  }

  const onPointerEnter = (hand: string) => (e: PointerEvent) => {
    if (paintMode === 'brush' && (e.buttons & 1) === 1 && !e.shiftKey) act(hand, false, false)
  }

  const showTip = (hand: string) => (e: MouseEvent<HTMLElement>) => {
    const box = container.current
    const cell = e.currentTarget
    if (!box || !cells[hand]?.tip) return setHover(null)
    const centre = cell.offsetLeft + cell.offsetWidth / 2
    setHover({ hand, x: Math.min(Math.max(centre, TIP_HALF_WIDTH), box.clientWidth - TIP_HALF_WIDTH), y: cell.offsetTop, height: cell.offsetHeight })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const { row, col } = cellOf(cursor)
    const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    const delta = move[e.key]
    if (delta) {
      e.preventDefault()
      const next = handAt(Math.min(GRID_SIZE - 1, Math.max(0, row + delta[0])), Math.min(GRID_SIZE - 1, Math.max(0, col + delta[1])))
      setCursor(next)
      container.current?.querySelector<HTMLElement>(`[data-hand="${next}"]`)?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      act(cursor, e.shiftKey, true)
    }
  }

  const small = size === 'sm'
  return (
    <div
      ref={container}
      role={editable ? 'group' : 'img'}
      aria-label={label}
      onKeyDown={editable ? onKeyDown : undefined}
      onMouseLeave={() => setHover(null)}
      className={clsx('relative grid grid-cols-[repeat(13,minmax(0,1fr))] select-none touch-none', small ? 'gap-[2px]' : 'gap-[3px]')}
    >
      {HAND_CLASSES.map((hand) => {
        const cell = cells[hand]
        const style = cell ? { backgroundColor: cell.color, color: cell.textColor } : undefined
        const classes = clsx(
          'relative aspect-square flex items-center justify-center rounded-[3px] font-mono leading-none',
          small ? 'text-[8.5px]' : 'text-[11px]',
          !cell && 'bg-dark-300 text-gray-500',
          cell?.dim && 'opacity-[0.55]',
          cell?.outline && OUTLINE_CLASS[cell.outline],
          anchor === hand && 'ring-2 ring-inset ring-white',
          editable && 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
        )
        const content = (
          <>
            {hand}
            {cell?.badge ? <span className="absolute top-[1px] right-[2px] text-[9px] font-bold text-deviation">{cell.badge}</span> : null}
          </>
        )
        return editable ? (
          <button
            key={hand}
            type="button"
            data-hand={hand}
            tabIndex={hand === cursor ? 0 : -1}
            aria-label={hand}
            className={classes}
            style={style}
            onPointerDown={onPointerDown(hand)}
            onPointerEnter={onPointerEnter(hand)}
            onFocus={() => setCursor(hand)}
          >
            {content}
          </button>
        ) : (
          <div key={hand} className={classes} style={style} onMouseEnter={showTip(hand)}>
            {content}
          </div>
        )
      })}
      {hover && cells[hover.hand]?.tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-[230px] rounded-lg border border-dark-100 bg-dark-700 p-3 text-left text-xs font-sans font-normal leading-snug text-gray-100 shadow-xl"
          style={{
            left: hover.x,
            top: hover.y < TIP_FLIP_BELOW_PX ? hover.y + hover.height + 6 : hover.y - 6,
            transform: hover.y < TIP_FLIP_BELOW_PX ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          }}
        >
          {cells[hover.hand].tip}
        </div>
      )}
    </div>
  )
}
