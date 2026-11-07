import { memo, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { hudBaselines } from '@/views/Stats/hudText'
import {
  BASE_FONT_SIZE,
  buildCellViews,
  HUD_COLORS,
  type Baseline,
  type CellView,
  type HudFigures,
  type HudGrid,
  type HudPlayerInfo,
  type Track,
} from '@/views/LiveHud/hudGrid'

/** The same component draws a grid in the editor, in the previews and in the HUD window. */

const BASELINES: Record<string, Baseline> = hudBaselines
const LABEL_FONT = "Inter, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
const NUMBER_FONT = "'IBM Plex Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace"
const SAMPLE_SCALE = 0.68
const LINE_HEIGHT_EM = 1.5
const KEY_BORDER = `1px solid ${HUD_COLORS.keyBorder}`

const trackSize = (track: Track, minimum: string) => (track.size === 'auto' ? `minmax(${minimum}, auto)` : `${track.size}px`)

export interface GridSlot {
  /** Id of the cell, or `empty:<row>:<col>` for a position no cell covers. */
  id: string
  row: number
  col: number
  rowSpan: number
  colSpan: number
  empty: boolean
}

export interface HudGridViewProps {
  grid: HudGrid
  figures: HudFigures
  player: HudPlayerInfo
  /** Opacity of the grid's background, from the profile. */
  opacity?: number
  /** Draw a slot for each position no cell covers (the editor needs somewhere to drop). */
  showEmptySlots?: boolean
  /** Extra look of a slot (selection, drop target...); the editor's handles live outside the render. */
  decorate?: (slot: GridSlot) => { className?: string; style?: CSSProperties } | undefined
  /** Content laid over a slot (a resize handle, a caret). */
  overlay?: (slot: GridSlot) => ReactNode
  /** A cell with a popup was clicked. */
  onPopup?: (cell: CellView, event: ReactMouseEvent<HTMLElement>) => void
  /** The pointer came onto, or left, a cell that shows a stat. */
  onFigureEnter?: (cell: CellView, event: ReactMouseEvent<HTMLElement>) => void
  onFigureLeave?: () => void
  /** Rendered text of the cell being edited in place, instead of its value. */
  editing?: { cellId: string; node: ReactNode }
}

const sameView = (a: CellView, b: CellView) =>
  a.id === b.id &&
  a.row === b.row &&
  a.col === b.col &&
  a.rowSpan === b.rowSpan &&
  a.colSpan === b.colSpan &&
  a.kind === b.kind &&
  a.text === b.text &&
  a.sample === b.sample &&
  a.fg === b.fg &&
  a.bg === b.bg &&
  a.bold === b.bold &&
  a.fontSize === b.fontSize &&
  a.align === b.align &&
  a.popupId === b.popupId &&
  JSON.stringify(a.figure) === JSON.stringify(b.figure) &&
  a.tagColor === b.tagColor &&
  a.numeric === b.numeric &&
  JSON.stringify(a.border) === JSON.stringify(b.border)

function cellStyle(view: CellView, zebra: boolean): CSSProperties {
  const { border } = view
  return {
    gridRow: `${view.row + 1} / span ${view.rowSpan}`,
    gridColumn: `${view.col + 1} / span ${view.colSpan}`,
    color: view.fg ?? HUD_COLORS.text,
    background: view.bg ?? (zebra && view.row % 2 === 1 ? HUD_COLORS.zebra : undefined),
    fontSize: view.fontSize ? `${view.fontSize}px` : undefined,
    fontWeight: view.bold ? 700 : view.numeric ? 600 : 500,
    fontFamily: view.numeric ? NUMBER_FONT : LABEL_FONT,
    fontVariantNumeric: view.numeric ? 'tabular-nums' : undefined,
    textAlign: view.align ?? (view.numeric || view.kind === 'text' ? 'center' : 'left'),
    borderTop: border?.top ? KEY_BORDER : undefined,
    borderRight: border?.right ? KEY_BORDER : undefined,
    borderBottom: border?.bottom ? KEY_BORDER : undefined,
    borderLeft: border?.left ? KEY_BORDER : undefined,
    lineHeight: `${LINE_HEIGHT_EM}em`,
    padding: '0 0.3em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: view.popupId ? 'pointer' : undefined,
  }
}

function CellContent({ view }: { view: CellView }) {
  if (view.kind === 'tag') {
    return <span className="inline-block h-[0.7em] w-[0.7em] rounded-full align-middle" style={{ background: view.tagColor ?? 'transparent', boxShadow: `inset 0 0 0 1px ${HUD_COLORS.border}` }} />
  }
  return (
    <>
      {view.text}
      {view.sample && <sub style={{ color: HUD_COLORS.sample, fontSize: `${SAMPLE_SCALE * 100}%`, fontWeight: 400, marginLeft: 1 }}>{view.sample}</sub>}
    </>
  )
}

interface CellProps {
  view: CellView
  zebra: boolean
  slot: GridSlot
  extra: { className?: string; style?: CSSProperties } | undefined
  overlay: ReactNode
  onPopup: HudGridViewProps['onPopup']
  onFigureEnter: HudGridViewProps['onFigureEnter']
  onFigureLeave: HudGridViewProps['onFigureLeave']
  editing: ReactNode
}

const Cell = memo(
  function Cell({ view, zebra, slot, extra, overlay, onPopup, onFigureEnter, onFigureLeave, editing }: CellProps) {
    return (
      <div
        data-cell={view.id}
        data-row={slot.row}
        data-col={slot.col}
        className={extra?.className}
        style={{ ...cellStyle(view, zebra), position: 'relative', ...extra?.style }}
        onClick={view.popupId && onPopup ? (e) => onPopup(view, e) : undefined}
        onMouseEnter={view.figure && onFigureEnter ? (e) => onFigureEnter(view, e) : undefined}
        onMouseLeave={view.figure && onFigureLeave ? onFigureLeave : undefined}
      >
        {editing ?? <CellContent view={view} />}
        {overlay}
      </div>
    )
  },
  (a, b) => sameView(a.view, b.view) && a.zebra === b.zebra && a.extra === b.extra && a.overlay === b.overlay && a.onPopup === b.onPopup && a.onFigureEnter === b.onFigureEnter && a.onFigureLeave === b.onFigureLeave && a.editing === b.editing && a.slot.id === b.slot.id,
)

const asSlot = (view: CellView): GridSlot => ({ id: view.id, row: view.row, col: view.col, rowSpan: view.rowSpan, colSpan: view.colSpan, empty: false })

/** Positions no cell covers, one slot each. */
function emptySlots(grid: HudGrid): GridSlot[] {
  const covered = new Set<string>()
  for (const c of grid.cells) {
    for (let r = c.row; r < c.row + c.rowSpan; r++) for (let k = c.col; k < c.col + c.colSpan; k++) covered.add(`${r}:${k}`)
  }
  const slots: GridSlot[] = []
  for (let r = 0; r < grid.rows.length; r++) {
    for (let k = 0; k < grid.cols.length; k++) {
      if (!covered.has(`${r}:${k}`)) slots.push({ id: `empty:${r}:${k}`, row: r, col: k, rowSpan: 1, colSpan: 1, empty: true })
    }
  }
  return slots
}

const EMPTY_VIEW = (slot: GridSlot): CellView => ({ ...slot, kind: 'empty', text: '', sample: null, bold: false, numeric: false })

function HudGridViewBase({ grid, figures, player, opacity = 1, showEmptySlots, decorate, overlay, onPopup, onFigureEnter, onFigureLeave, editing }: HudGridViewProps) {
  const views = useMemo(() => buildCellViews(grid, figures, player, BASELINES), [grid, figures, player.name, player.tag]) // eslint-disable-line react-hooks/exhaustive-deps
  const fontSize = grid.style.fontSize ?? BASE_FONT_SIZE
  const zebra = grid.style.zebra === true
  const slots = useMemo(() => (showEmptySlots ? emptySlots(grid) : []), [showEmptySlots, grid])
  // The editor shows the cells that are empty but have a style too: they are in `grid.cells` and
  // `buildCellViews` skips the plain ones, so those are added back as slots of their own.
  const shown = useMemo(() => {
    if (!showEmptySlots) return views
    const have = new Set(views.map((v) => v.id))
    const plain = grid.cells.filter((c) => !have.has(c.id)).map((c) => EMPTY_VIEW({ id: c.id, row: c.row, col: c.col, rowSpan: c.rowSpan, colSpan: c.colSpan, empty: true }))
    return [...views, ...plain]
  }, [views, grid.cells, showEmptySlots])

  const background = grid.style.bg ?? HUD_COLORS.panel
  return (
    <div
      data-grid={grid.id}
      className="relative w-max select-none rounded-[4px]"
      style={{
        fontSize,
        fontFamily: LABEL_FONT,
        color: HUD_COLORS.text,
        border: grid.style.frame ? `1px solid ${HUD_COLORS.border}` : undefined,
      }}
    >
      <div className="absolute inset-0 rounded-[4px]" style={{ background, opacity }} />
      <div
        data-grid-body
        className="relative grid"
        style={{
          gridTemplateColumns: grid.cols.map((c) => trackSize(c, '1.4em')).join(' '),
          gridTemplateRows: grid.rows.map((r) => trackSize(r, `${LINE_HEIGHT_EM}em`)).join(' '),
          padding: '2px 3px',
        }}
      >
        {shown.map((view) => {
          const slot = asSlot(view)
          const isEditing = editing?.cellId === view.id
          return (
            <Cell
              key={view.id}
              view={view}
              zebra={zebra}
              slot={{ ...slot, empty: view.kind === 'empty' }}
              extra={decorate?.({ ...slot, empty: view.kind === 'empty' })}
              overlay={overlay?.(slot)}
              onPopup={onPopup}
              onFigureEnter={onFigureEnter}
              onFigureLeave={onFigureLeave}
              editing={isEditing ? editing.node : undefined}
            />
          )
        })}
        {slots.map((slot) => (
          <Cell key={slot.id} view={EMPTY_VIEW(slot)} zebra={zebra} slot={slot} extra={decorate?.(slot)} overlay={overlay?.(slot)} onPopup={undefined} onFigureEnter={undefined} onFigureLeave={undefined} editing={undefined} />
        ))}
      </div>
    </div>
  )
}

const HudGridView = memo(HudGridViewBase)
export default HudGridView
