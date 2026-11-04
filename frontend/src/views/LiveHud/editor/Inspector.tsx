import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, ArrowRight, Copy, FlipHorizontal, Lock, LockOpen, Merge, Split, Trash2 } from 'lucide-react'
import type { AlignEdge, Axis, CellPatch, EditorDoc } from '../hudEditor'
import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  STACK_BUCKETS,
  STAT_COLUMNS,
  defaultColors,
  isHexColor,
  type CellStyle,
  type HudGrid,
  type HudGridCell,
  type HudIssue,
  type StatContext,
  type Track,
} from '../hudGrid'
import ColorBands from './ColorBands'
import type { CatalogStat } from './Palette'
import type { Dispatch, Selection } from './types'

const input = 'w-full rounded border border-dark-100 bg-dark-300 px-1.5 py-1 text-xs text-gray-200 focus:border-primary-500 focus:outline-none'
const smallButton = 'inline-flex items-center gap-1 rounded border border-dark-100 px-2 py-1 text-[11px] text-gray-300 hover:border-primary-500 disabled:opacity-40'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-dark-100/40 pt-3 first:border-t-0 first:pt-0">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 flex-1 text-right">{children}</span>
    </label>
  )
}

/** A colour, or none: the picker only offers `#rrggbb`, and "clear" leaves the field unset. */
function ColorField({ value, onChange }: { value: string | undefined; onChange: (color: string | undefined) => void }) {
  const { t } = useTranslation()
  const six = value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'
  return (
    <span className="inline-flex items-center gap-1">
      <input type="color" value={six} onChange={(e) => isHexColor(e.target.value) && onChange(e.target.value)} className={clsx('h-6 w-8 cursor-pointer rounded border border-dark-100 bg-transparent p-0', !value && 'opacity-40')} />
      <button type="button" className="text-[10px] text-gray-500 hover:text-gray-200 disabled:opacity-30" disabled={!value} onClick={() => onChange(undefined)}>
        {t('liveHud.editor.clear')}
      </button>
    </span>
  )
}

/** Column and stack depth a level counts in. Empty fields inherit from the level above. */
function ContextEditor({ value, onChange }: { value: StatContext | undefined; onChange: (context: StatContext | undefined) => void }) {
  const { t } = useTranslation()
  const stack = value?.stack ?? undefined
  const emit = (column: string | null | undefined, group: StatContext['stack']) => {
    const next: StatContext = {}
    if (column !== undefined) next.column = column
    if (group !== undefined) next.stack = group
    onChange(Object.keys(next).length > 0 ? next : undefined)
  }
  const toggle = (bucket: string) => {
    const current = stack?.buckets ?? []
    const buckets = STACK_BUCKETS.filter((b) => (b === bucket ? !current.includes(b) : current.includes(b)))
    emit(value?.column, buckets.length > 0 ? { label: stack?.label ?? buckets[0], buckets } : undefined)
  }
  return (
    <div className="space-y-2">
      <Field label={t('liveHud.editor.context.column')}>
        <select className={input} value={value?.column ?? ''} onChange={(e) => emit(e.target.value === '' ? undefined : e.target.value, value?.stack)}>
          <option value="">{t('liveHud.editor.context.inherit')}</option>
          {STAT_COLUMNS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <div>
        <p className="mb-1 text-[11px] text-gray-400">{t('liveHud.editor.context.stack')}</p>
        <div className="flex flex-wrap gap-1">
          {STACK_BUCKETS.map((bucket) => (
            <button
              key={bucket}
              type="button"
              className={clsx('rounded border px-1.5 py-0.5 font-mono text-[10px]', stack?.buckets.includes(bucket) ? 'border-primary-500 bg-primary-500/30 text-white' : 'border-dark-100 text-gray-400')}
              onClick={() => toggle(bucket)}
            >
              {bucket}
            </button>
          ))}
        </div>
        {stack && (
          <Field label={t('liveHud.editor.context.stack_label')}>
            <input className={input} maxLength={12} value={stack.label} onChange={(e) => emit(value?.column, { ...stack, label: e.target.value })} />
          </Field>
        )}
        <p className="mt-1 text-[10px] text-gray-500">{t('liveHud.editor.context.stack_note')}</p>
      </div>
    </div>
  )
}

interface Props {
  doc: EditorDoc
  selection: Selection
  seat: string
  seats: string[]
  catalog: CatalogStat[]
  issues: HudIssue[]
  /** Widths of the grids as fractions of the table, to mirror and align them. */
  sizes: Record<string, { w: number; h: number }>
  dispatch: Dispatch
  onSelect: (next: Selection) => void
  onNewPopup: (gridId: string, cellIds: string[]) => void
}

const ALIGNMENTS: AlignEdge[] = ['left', 'centerX', 'right', 'top', 'centerY', 'bottom']

export default function Inspector({ doc, selection, seat, seats, catalog, issues, sizes, dispatch, onSelect, onNewPopup }: Props) {
  const { t } = useTranslation()
  const gridId = selection.gridIds[0]
  const grid = gridId ? [...doc.layout.grids, ...doc.layout.popups].find((g) => g.id === gridId) : undefined
  const isPopup = grid ? doc.layout.popups.includes(grid) : false

  const issueList = (
    <Section title={t('liveHud.editor.issues')}>
      {issues.length === 0 ? (
        <p className="text-[11px] text-profit-positive">{t('liveHud.editor.no_issue')}</p>
      ) : (
        <ul className="space-y-1">
          {issues.map((issue, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-left text-[11px] text-red-300 hover:bg-red-500/20"
                onClick={() => issue.gridId && onSelect({ gridIds: [issue.gridId], cellIds: issue.cellId ? [issue.cellId] : [], track: null })}
              >
                {t(`liveHud.editor.issue.${issue.code}`, { detail: issue.detail ?? '' })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )

  if (!grid) return <div className="space-y-4"><p className="text-xs text-gray-500">{t('liveHud.editor.nothing_selected')}</p>{issueList}</div>

  const cells = selection.cellIds.map((id) => grid.cells.find((c) => c.id === id)).filter((c): c is HudGridCell => c !== undefined)
  const primary = cells[0]

  let body: ReactNode
  if (selection.track) body = <TrackPanel grid={grid} track={selection.track} dispatch={dispatch} />
  else if (selection.cellIds.length > 0) body = <CellPanel grid={grid} cells={cells} slotIds={selection.cellIds} primary={primary} popups={doc.layout.popups} catalog={catalog} dispatch={dispatch} onNewPopup={onNewPopup} />
  else body = <GridPanel doc={doc} grid={grid} isPopup={isPopup} selection={selection} seat={seat} seats={seats} sizes={sizes} dispatch={dispatch} />

  return (
    <div className="space-y-4">
      {body}
      {issueList}
    </div>
  )
}

// --- Grid

function GridPanel({ doc, grid, isPopup, selection, seat, seats, sizes, dispatch }: { doc: EditorDoc; grid: HudGrid; isPopup: boolean; selection: Selection; seat: string; seats: string[]; sizes: Props['sizes']; dispatch: Dispatch }) {
  const { t } = useTranslation()
  const patch = (change: Partial<Pick<HudGrid, 'name' | 'locked' | 'context' | 'style'>>) => dispatch({ type: 'patchGrid', gridId: grid.id, patch: change })
  const otherSeat = seats.find((s) => s !== seat)
  return (
    <>
      <Section title={t('liveHud.editor.grid')}>
        <Field label={t('liveHud.editor.name')}>
          <input className={input} maxLength={40} value={grid.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={smallButton} onClick={() => patch({ locked: !grid.locked })}>
            {grid.locked ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {grid.locked ? t('liveHud.editor.unlock') : t('liveHud.editor.lock')}
          </button>
          <button type="button" className={smallButton} onClick={() => dispatch({ type: 'duplicateGrid', gridId: grid.id })}>
            <Copy className="h-3 w-3" />
            {t('liveHud.editor.duplicate')}
          </button>
          <button type="button" className={clsx(smallButton, 'hover:border-red-500')} onClick={() => dispatch({ type: 'removeGrid', gridId: grid.id })}>
            <Trash2 className="h-3 w-3" />
            {t('common.delete')}
          </button>
        </div>
        <Field label={t('liveHud.editor.font_size')}>
          <input type="number" className={input} min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} value={grid.style.fontSize ?? 12} onChange={(e) => patch({ style: { ...grid.style, fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Number(e.target.value) || 12)) } })} />
        </Field>
        <Field label={t('liveHud.editor.background')}>
          <ColorField value={grid.style.bg} onChange={(bg) => patch({ style: { ...grid.style, bg } })} />
        </Field>
        <label className="flex items-center gap-2 text-[11px] text-gray-400">
          <input type="checkbox" checked={grid.style.zebra === true} onChange={(e) => patch({ style: { ...grid.style, zebra: e.target.checked } })} />
          {t('liveHud.editor.zebra')}
        </label>
        <label className="flex items-center gap-2 text-[11px] text-gray-400">
          <input type="checkbox" checked={grid.style.frame === true} onChange={(e) => patch({ style: { ...grid.style, frame: e.target.checked } })} />
          {t('liveHud.editor.frame')}
        </label>
      </Section>

      <Section title={t('liveHud.editor.structure')}>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={smallButton} disabled={grid.locked} onClick={() => dispatch({ type: 'addTrack', gridId: grid.id, axis: 'row', index: grid.rows.length })}>
            {t('liveHud.editor.add_row')}
          </button>
          <button type="button" className={smallButton} disabled={grid.locked} onClick={() => dispatch({ type: 'addTrack', gridId: grid.id, axis: 'col', index: grid.cols.length })}>
            {t('liveHud.editor.add_col')}
          </button>
        </div>
        <p className="text-[10px] text-gray-500">{t('liveHud.editor.structure_note', { rows: grid.rows.length, cols: grid.cols.length })}</p>
      </Section>

      <Section title={t('liveHud.editor.context.title')}>
        <ContextEditor value={grid.context} onChange={(context) => patch({ context: context ?? {} })} />
      </Section>

      {!isPopup && (
        <Section title={t('liveHud.editor.placement')}>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={smallButton} disabled={seats.length < 2} onClick={() => dispatch({ type: 'placeEverySeat', gridId: grid.id, fromSeat: seat })}>
              {t('liveHud.editor.place_every_seat')}
            </button>
            <button
              type="button"
              className={smallButton}
              disabled={!otherSeat || !sizes[grid.id]}
              onClick={() => otherSeat && dispatch({ type: 'mirrorToSeat', gridId: grid.id, fromSeat: seat, toSeat: otherSeat, width: sizes[grid.id]?.w ?? 0 })}
            >
              <FlipHorizontal className="h-3 w-3" />
              {t('liveHud.editor.mirror')}
            </button>
          </div>
          {selection.gridIds.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {ALIGNMENTS.map((edge) => (
                <button key={edge} type="button" className={smallButton} onClick={() => dispatch({ type: 'alignGrids', seat, gridIds: selection.gridIds, edge, sizes })}>
                  {t(`liveHud.editor.align.${edge}`)}
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-500">{doc.seats[seat]?.[grid.id] ? `x ${Math.round(doc.seats[seat][grid.id].x * 1000) / 10}% · y ${Math.round(doc.seats[seat][grid.id].y * 1000) / 10}%` : ''}</p>
        </Section>
      )}
    </>
  )
}

// --- Track

function TrackPanel({ grid, track, dispatch }: { grid: HudGrid; track: { axis: Axis; index: number }; dispatch: Dispatch }) {
  const { t } = useTranslation()
  const tracks = track.axis === 'row' ? grid.rows : grid.cols
  const current: Track | undefined = tracks[track.index]
  if (!current) return null
  const patch = (change: Partial<Track>) => dispatch({ type: 'patchTrack', gridId: grid.id, axis: track.axis, index: track.index, patch: change })
  const act = (type: 'addTrack' | 'removeTrack', index: number) => dispatch({ type, gridId: grid.id, axis: track.axis, index })
  return (
    <>
      <Section title={t(track.axis === 'row' ? 'liveHud.editor.row_n' : 'liveHud.editor.col_n', { n: track.index + 1 })}>
        <Field label={t('liveHud.editor.size')}>
          <span className="inline-flex items-center gap-1">
            <input
              type="number"
              className={clsx(input, 'w-16')}
              disabled={current.size === 'auto'}
              value={current.size === 'auto' ? '' : current.size}
              onChange={(e) => patch({ size: Math.max(8, Math.round(Number(e.target.value) || 8)) })}
            />
            <label className="flex items-center gap-1 text-[11px]">
              <input type="checkbox" checked={current.size === 'auto'} onChange={(e) => patch({ size: e.target.checked ? 'auto' : 24 })} />
              {t('liveHud.editor.auto')}
            </label>
          </span>
        </Field>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={smallButton} onClick={() => act('addTrack', track.index)}>
            {t('liveHud.editor.insert_before')}
          </button>
          <button type="button" className={smallButton} onClick={() => act('addTrack', track.index + 1)}>
            {t('liveHud.editor.insert_after')}
          </button>
          <button type="button" className={smallButton} disabled={track.index === 0} onClick={() => dispatch({ type: 'moveTrack', gridId: grid.id, axis: track.axis, from: track.index, to: track.index - 1 })}>
            <ArrowLeft className="h-3 w-3" />
            {t('liveHud.editor.move_earlier')}
          </button>
          <button type="button" className={smallButton} disabled={track.index >= tracks.length - 1} onClick={() => dispatch({ type: 'moveTrack', gridId: grid.id, axis: track.axis, from: track.index, to: track.index + 1 })}>
            <ArrowRight className="h-3 w-3" />
            {t('liveHud.editor.move_later')}
          </button>
          <button type="button" className={clsx(smallButton, 'hover:border-red-500')} disabled={tracks.length <= 1} onClick={() => act('removeTrack', track.index)}>
            <Trash2 className="h-3 w-3" />
            {t('common.delete')}
          </button>
        </div>
      </Section>
      <Section title={t('liveHud.editor.context.title')}>
        <ContextEditor value={current.context} onChange={(context) => patch({ context })} />
        <p className="text-[10px] text-gray-500">{t('liveHud.editor.context.track_note')}</p>
      </Section>
    </>
  )
}

// --- Cells

function CellPanel({
  grid,
  cells,
  slotIds,
  primary,
  popups,
  catalog,
  dispatch,
  onNewPopup,
}: {
  grid: HudGrid
  cells: HudGridCell[]
  slotIds: string[]
  primary: HudGridCell | undefined
  popups: HudGrid[]
  catalog: CatalogStat[]
  dispatch: Dispatch
  onNewPopup: (gridId: string, cellIds: string[]) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const ids = cells.map((c) => c.id)
  const patch = (change: CellPatch) => dispatch({ type: 'patchCells', gridId: grid.id, cellIds: ids, patch: change })
  const style = (change: NonNullable<CellPatch['style']>) => patch({ style: change })

  if (!primary) {
    // An empty slot: typing creates a text cell there.
    const slot = slotIds[0]?.match(/^empty:(\d+):(\d+)$/)
    return (
      <Section title={t('liveHud.editor.empty_cell')}>
        <p className="text-[11px] text-gray-500">{t('liveHud.editor.empty_cell_note')}</p>
        <Field label={t('liveHud.editor.text')}>
          <input
            className={input}
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && slot && draft.trim()) {
                dispatch({ type: 'dropContent', gridId: grid.id, row: Number(slot[1]), col: Number(slot[2]), content: { kind: 'text', text: draft.trim() } })
                setDraft('')
              }
            }}
          />
        </Field>
      </Section>
    )
  }

  const { content } = primary
  const stats = cells.filter((c) => c.content.kind === 'stat')
  const withContext = cells.filter((c) => c.content.kind === 'stat' || c.content.kind === 'hands')
  const align = (value: CellStyle['align']) => style({ align: value })
  const border = (side: 'top' | 'right' | 'bottom' | 'left') => {
    const current = primary.style.border ?? {}
    const next = { ...current, [side]: current[side] ? undefined : true }
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v === true))
    style({ border: Object.keys(clean).length > 0 ? clean : null })
  }

  return (
    <>
      <Section title={t(`liveHud.editor.element.${content.kind === 'empty' ? 'text' : content.kind}`) + (cells.length > 1 ? ` · ${cells.length}` : '')}>
        {content.kind === 'text' && (
          <Field label={t('liveHud.editor.text')}>
            <input className={input} maxLength={60} value={content.text} onChange={(e) => dispatch({ type: 'setContent', gridId: grid.id, cellId: primary.id, content: { kind: 'text', text: e.target.value } })} />
          </Field>
        )}
        {content.kind === 'stat' && (
          <p className="text-xs text-gray-200">
            {content.label} <span className="text-gray-500">({content.section})</span>
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          <button type="button" className={smallButton} disabled={cells.length < 2} onClick={() => dispatch({ type: 'merge', gridId: grid.id, cellIds: ids })}>
            <Merge className="h-3 w-3" />
            {t('liveHud.editor.merge')}
          </button>
          <button type="button" className={smallButton} disabled={primary.rowSpan === 1 && primary.colSpan === 1} onClick={() => dispatch({ type: 'split', gridId: grid.id, cellId: primary.id })}>
            <Split className="h-3 w-3" />
            {t('liveHud.editor.split')}
          </button>
          <button type="button" className={clsx(smallButton, 'hover:border-red-500')} onClick={() => dispatch({ type: 'clearCells', gridId: grid.id, cellIds: ids })}>
            <Trash2 className="h-3 w-3" />
            {t('liveHud.editor.clear_cells')}
          </button>
          {cells.length > 1 && (
            <button
              type="button"
              className={smallButton}
              title={t('liveHud.editor.apply_note')}
              onClick={() =>
                dispatch({
                  type: 'patchCells',
                  gridId: grid.id,
                  cellIds: ids.slice(1),
                  patch: { style: { bg: primary.style.bg ?? null, fg: primary.style.fg ?? null, fontSize: primary.style.fontSize ?? null, bold: primary.style.bold ?? null, align: primary.style.align ?? null, border: primary.style.border ?? null }, ...(content.kind === 'stat' ? { colors: content.colors } : {}) },
                })
              }
            >
              {t('liveHud.editor.apply_to_selection')}
            </button>
          )}
        </div>
      </Section>

      <Section title={t('liveHud.editor.style')}>
        <Field label={t('liveHud.editor.text_color')}>
          <ColorField value={primary.style.fg} onChange={(fg) => style({ fg: fg ?? null })} />
        </Field>
        <Field label={t('liveHud.editor.background')}>
          <ColorField value={primary.style.bg} onChange={(bg) => style({ bg: bg ?? null })} />
        </Field>
        <Field label={t('liveHud.editor.font_size')}>
          <input
            type="number"
            className={input}
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            placeholder={t('liveHud.editor.auto')}
            value={primary.style.fontSize ?? ''}
            onChange={(e) => style({ fontSize: e.target.value === '' ? null : Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Number(e.target.value) || 12)) })}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={clsx(smallButton, primary.style.bold && 'border-primary-500 text-white')} onClick={() => style({ bold: primary.style.bold ? null : true })}>
            <b>B</b>
          </button>
          {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([value, Icon]) => (
            <button key={value} type="button" className={clsx(smallButton, primary.style.align === value && 'border-primary-500 text-white')} onClick={() => align(primary.style.align === value ? undefined : value)}>
              <Icon className="h-3 w-3" />
            </button>
          ))}
          <span className="mx-1 text-[10px] text-gray-500">{t('liveHud.editor.borders')}</span>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <button key={side} type="button" className={clsx(smallButton, primary.style.border?.[side] && 'border-primary-500 text-white')} onClick={() => border(side)}>
              {t(`liveHud.editor.side.${side}`)}
            </button>
          ))}
        </div>
        <Field label={t('liveHud.editor.popup')}>
          <span className="inline-flex gap-1">
            <select className={input} value={primary.popupId ?? ''} onChange={(e) => patch({ popupId: e.target.value === '' ? null : e.target.value })}>
              <option value="">{t('liveHud.editor.no_popup')}</option>
              {popups.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className={smallButton} title={t('liveHud.editor.new_popup')} onClick={() => onNewPopup(grid.id, ids)}>
              +
            </button>
          </span>
        </Field>
      </Section>

      {stats.length > 0 && content.kind === 'stat' && (
        <>
          <Section title={t('liveHud.editor.display.title')}>
            <Field label={t('liveHud.editor.display.decimals')}>
              <input type="number" min={0} max={2} className={input} value={content.display.decimals} onChange={(e) => patch({ display: { decimals: Math.min(2, Math.max(0, Math.round(Number(e.target.value) || 0))) } })} />
            </Field>
            <label className="flex items-center gap-2 text-[11px] text-gray-400">
              <input type="checkbox" checked={content.display.padZero} onChange={(e) => patch({ display: { padZero: e.target.checked } })} />
              {t('liveHud.editor.display.pad_zero')}
            </label>
            <Field label={t('liveHud.editor.display.placeholder')}>
              <input className={input} maxLength={4} value={content.display.placeholder} onChange={(e) => patch({ display: { placeholder: e.target.value } })} />
            </Field>
            <Field label={t('liveHud.editor.display.show_sample')}>
              <select className={input} value={content.display.showSample} onChange={(e) => patch({ display: { showSample: e.target.value as 'never' | 'lowOnly' | 'always' } })}>
                {(['never', 'lowOnly', 'always'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`liveHud.editor.display.sample_${v}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('liveHud.editor.display.low_below')}>
              <input type="number" min={0} className={input} value={content.display.lowSampleBelow} onChange={(e) => patch({ display: { lowSampleBelow: Math.max(0, Math.round(Number(e.target.value) || 0)) } })} />
            </Field>
            <Field label={t('liveHud.editor.display.hide_below')}>
              <input type="number" min={0} className={input} value={content.display.hideBelowSample} onChange={(e) => patch({ display: { hideBelowSample: Math.max(0, Math.round(Number(e.target.value) || 0)) } })} />
            </Field>
          </Section>
          <Section title={t('liveHud.editor.colors.title')}>
            <ColorBands rule={content.colors ?? defaultColors()} section={content.section} label={content.label} catalog={catalog} onChange={(colors) => patch({ colors })} />
          </Section>
        </>
      )}

      {withContext.length > 0 && (content.kind === 'stat' || content.kind === 'hands') && (
        <Section title={t('liveHud.editor.context.cell_title')}>
          <ContextEditor value={content.context} onChange={(context) => patch({ context: context ?? null })} />
        </Section>
      )}
    </>
  )
}
