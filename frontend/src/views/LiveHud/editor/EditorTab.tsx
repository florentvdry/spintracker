import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Plus, Redo2, Undo2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import { ipcService } from '@/services/ipcService'
import { useLiveHudStore } from '@/stores/liveHudStore'
import {
  abbreviationOf,
  applyEdit,
  emptyHistory,
  record,
  redo,
  undo,
  type EditAction,
  type EditorDoc,
  type EditorHistory,
} from '../hudEditor'
import { newGrid, validateLayout, type CellContent, type HudGrid, type HudIssue } from '../hudGrid'
import { HUD_FORMATS, SEATS_BY_FORMAT, seatPositions, type HudFormat } from '../hudProfile'
import { TEMPLATE_IDS, TEMPLATES, type TemplateId } from '../hudTemplates'
import { previewFigures } from '../previewData'
import Canvas from './Canvas'
import Inspector from './Inspector'
import Palette, { type CatalogStat } from './Palette'
import { NO_SELECTION, type EditingCell, type Selection } from './types'
import { useDrag, type DragPayload, type DropTarget } from './useDrag'

const MIN_ZOOM = 0.6
const MAX_ZOOM = 1.6
const DEFAULT_ZOOM = 1
const NEW_GRID_ROWS = 3
const NEW_GRID_COLS = 3

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)

const parseEmpty = (id: string) => {
  const match = id.match(/^empty:(\d+):(\d+)$/)
  return match ? { row: Number(match[1]), col: Number(match[2]) } : null
}

/** The selection with whatever no longer exists taken out (after an undo or a delete). */
function cleanSelection(selection: Selection, doc: EditorDoc): Selection {
  const all = [...doc.layout.grids, ...doc.layout.popups]
  const gridIds = selection.gridIds.filter((id) => all.some((g) => g.id === id))
  const grid = all.find((g) => g.id === gridIds[0])
  if (!grid) return gridIds.length === selection.gridIds.length && selection.cellIds.length === 0 && !selection.track ? selection : { gridIds, cellIds: [], track: null }
  const cellIds = selection.cellIds.filter((id) => {
    const empty = parseEmpty(id)
    return empty ? empty.row < grid.rows.length && empty.col < grid.cols.length : grid.cells.some((c) => c.id === id)
  })
  const track = selection.track && selection.track.index < (selection.track.axis === 'row' ? grid.rows : grid.cols).length ? selection.track : null
  return gridIds.length === selection.gridIds.length && cellIds.length === selection.cellIds.length && track === selection.track ? selection : { gridIds, cellIds, track }
}

export default function EditorTab() {
  const { t } = useTranslation()
  const { settings, setActiveProfile } = useLiveHudStore()
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const [format, setFormat] = useState<HudFormat>('threeMax')
  const seats = SEATS_BY_FORMAT[format]

  const [catalog, setCatalog] = useState<CatalogStat[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [selectionRaw, setSelection] = useState<Selection>(NO_SELECTION)
  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [activePopupId, setActivePopupId] = useState<string | null>(null)
  const [history, setHistory] = useState<EditorHistory>(emptyHistory)

  useEffect(() => {
    let cancelled = false
    void ipcService.getHudCatalog().then((result) => {
      if (cancelled) return
      if (result.success) setCatalog(result.data?.stats ?? [])
      setCatalogLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // The one source of truth is the store; the editor only turns actions into its next value.
  const doc = useMemo<EditorDoc>(
    () => ({
      layout: profile.layouts[format],
      seats: Object.fromEntries(seats.map((s) => [s, seatPositions(settings.placements, format, s, profile.layouts[format].grids)])),
    }),
    [profile.layouts, format, seats, settings.placements],
  )
  const docRef = useRef(doc)
  docRef.current = doc
  const historyRef = useRef(history)
  historyRef.current = history
  const target = useRef({ profileId: profile.id, format })
  target.current = { profileId: profile.id, format }

  // A history belongs to one profile and format.
  useEffect(() => {
    setHistory(emptyHistory())
    setSelection(NO_SELECTION)
    setEditing(null)
    setActivePopupId(null)
  }, [profile.id, format])

  const commit = useCallback((next: EditorDoc) => {
    docRef.current = next
    const { profileId, format: f } = target.current
    useLiveHudStore.getState().setEditorDoc(profileId, f, next.layout, next.seats)
  }, [])

  const dispatch = useCallback(
    (action: EditAction) => {
      const current = docRef.current
      const next = applyEdit(current, action)
      if (next === current) return
      setHistory((h) => record(h, current))
      commit(next)
    },
    [commit],
  )

  const doUndo = useCallback(() => {
    const step = undo(historyRef.current, docRef.current)
    if (!step) return
    setHistory(step.history)
    commit(step.doc)
  }, [commit])

  const doRedo = useCallback(() => {
    const step = redo(historyRef.current, docRef.current)
    if (!step) return
    setHistory(step.history)
    commit(step.doc)
  }, [commit])

  const selection = useMemo(() => cleanSelection(selectionRaw, doc), [selectionRaw, doc])
  const popups = doc.layout.popups
  const activePopup = popups.find((p) => p.id === activePopupId) ?? null

  // --- Drag and drop

  const onDrop = useCallback(
    (payload: DragPayload, to: DropTarget | null, modifiers: { alt: boolean }) => {
      if (!to) return
      const select = (gridId: string, row: number, col: number) => {
        const grid = [...docRef.current.layout.grids, ...docRef.current.layout.popups].find((g) => g.id === gridId)
        const cell = grid?.cells.find((c) => row >= c.row && row < c.row + c.rowSpan && col >= c.col && col < c.col + c.colSpan)
        setSelection({ gridIds: [gridId], cellIds: [cell?.id ?? `empty:${row}:${col}`], track: null })
      }
      if (payload.kind === 'content') {
        if (to.type === 'column' && payload.stat) {
          dispatch({ type: 'dropOnHeader', gridId: to.gridId, col: to.col, section: payload.stat.section, label: payload.stat.label, abbr: abbreviationOf(payload.stat.label) })
          setSelection({ gridIds: [to.gridId], cellIds: [], track: { axis: 'col', index: to.col } })
        } else if (to.type === 'column') {
          dispatch({ type: 'dropContent', gridId: to.gridId, row: 0, col: to.col, content: payload.content })
        } else {
          dispatch({ type: 'dropContent', gridId: to.gridId, row: to.row, col: to.col, content: payload.content })
          select(to.gridId, to.row, to.col)
        }
        return
      }
      if (to.type !== 'cell') return
      if (to.gridId === payload.gridId) {
        dispatch({ type: 'moveCell', gridId: payload.gridId, cellId: payload.cellId, row: to.row, col: to.col, copy: modifiers.alt })
        select(to.gridId, to.row, to.col)
        return
      }
      // Between two grids the content travels; the style stays behind.
      const source = [...docRef.current.layout.grids, ...docRef.current.layout.popups].find((g) => g.id === payload.gridId)?.cells.find((c) => c.id === payload.cellId)
      if (source) dispatch({ type: 'dropContent', gridId: to.gridId, row: to.row, col: to.col, content: structuredClone(source.content) })
    },
    [dispatch],
  )
  const { active: drag, start: startDrag } = useDrag({ onDrop })
  const hover = drag?.target ?? null

  // A press on a palette item without dragging fills the selected cell.
  const onPick = useCallback(
    (content: CellContent) => {
      const grid = [...docRef.current.layout.grids, ...docRef.current.layout.popups].find((g) => g.id === selection.gridIds[0])
      const id = selection.cellIds[0]
      if (!grid || !id) return
      const slot = parseEmpty(id)
      const cell = grid.cells.find((c) => c.id === id)
      const at = slot ?? (cell ? { row: cell.row, col: cell.col } : null)
      if (at) dispatch({ type: 'dropContent', gridId: grid.id, row: at.row, col: at.col, content })
    },
    [dispatch, selection],
  )

  // --- Adding grids and popups

  const addGrid = (popup: boolean) => {
    const n = (popup ? popups.length : doc.layout.grids.length) + 1
    const grid = newGrid(t(popup ? 'liveHud.editor.popup_n' : 'liveHud.editor.grid_n', { n }), NEW_GRID_ROWS, NEW_GRID_COLS)
    dispatch({ type: 'addGrid', grid, popup })
    setSelection({ gridIds: [grid.id], cellIds: [], track: null })
    if (popup) setActivePopupId(grid.id)
  }

  const newPopupFor = (gridId: string, cellIds: string[]) => {
    const popup = newGrid(t('liveHud.editor.popup_n', { n: popups.length + 1 }), NEW_GRID_ROWS, NEW_GRID_COLS)
    dispatch({ type: 'addGrid', grid: popup, popup: true })
    dispatch({ type: 'patchCells', gridId, cellIds, patch: { popupId: popup.id } })
    setActivePopupId(popup.id)
  }

  // --- Shipped models

  const applyModel = (id: TemplateId) => {
    const template = TEMPLATES[id]
    // A layout model replaces the grids of the table size being edited: ask first, and keep a step to undo it.
    if (template.isLayout && !window.confirm(t('liveHud.templates.confirm', { name: t(`liveHud.templates.${id}`) }))) return
    setHistory((h) => record(h, docRef.current))
    useLiveHudStore.getState().applyTemplate(profile.id, id, template.isLayout ? format : undefined)
    setSelection(NO_SELECTION)
    setActivePopupId(null)
  }

  // --- In-place text editing

  const commitText = (value: string) => {
    const edit = editing
    setEditing(null)
    if (!edit) return
    const grid = [...docRef.current.layout.grids, ...docRef.current.layout.popups].find((g) => g.id === edit.gridId)
    const slot = parseEmpty(edit.cellId)
    if (slot) {
      if (value.trim()) dispatch({ type: 'dropContent', gridId: edit.gridId, row: slot.row, col: slot.col, content: { kind: 'text', text: value } })
    } else if (grid) {
      dispatch({ type: 'setContent', gridId: edit.gridId, cellId: edit.cellId, content: { kind: 'text', text: value } })
    }
  }

  const startEditing = (cell: EditingCell) => {
    const grid = [...doc.layout.grids, ...doc.layout.popups].find((g) => g.id === cell.gridId)
    const existing = grid?.cells.find((c) => c.id === cell.cellId)
    // Figures are not typed: double-clicking one only selects it.
    if (existing && existing.content.kind !== 'text' && existing.content.kind !== 'empty') return
    setEditing(cell)
  }

  const editingGrid = editing ? [...doc.layout.grids, ...doc.layout.popups].find((g) => g.id === editing.gridId) : undefined
  const editingText = editing ? (() => { const c = editingGrid?.cells.find((x) => x.id === editing.cellId); return c?.content.kind === 'text' ? c.content.text : '' })() : ''
  const editorNode = editing ? (
    <input
      autoFocus
      defaultValue={editingText}
      maxLength={60}
      className="w-full min-w-[2em] bg-dark-500 text-center text-inherit outline outline-1 outline-primary-500"
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => commitText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setEditing(null)
        e.stopPropagation()
      }}
    />
  ) : null

  // --- Keyboard

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const current = docRef.current
      if (mod && key === 'z') {
        event.preventDefault()
        return event.shiftKey ? doRedo() : doUndo()
      }
      if (mod && key === 'y') {
        event.preventDefault()
        return doRedo()
      }
      const sel = cleanSelection(selectionRaw, current)
      const gridId = sel.gridIds[0]
      if (key === 'escape') return setSelection(NO_SELECTION)
      if (!gridId) return
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault()
        if (sel.track) return dispatch({ type: 'removeTrack', gridId, axis: sel.track.axis, index: sel.track.index })
        const real = sel.cellIds.filter((id) => !id.startsWith('empty:'))
        if (sel.cellIds.length > 0) return real.length > 0 ? dispatch({ type: 'clearCells', gridId, cellIds: real }) : undefined
        for (const id of sel.gridIds) dispatch({ type: 'removeGrid', gridId: id })
        return setSelection(NO_SELECTION)
      }
      if (mod && key === 'd' && sel.cellIds.length === 0) {
        event.preventDefault()
        return dispatch({ type: 'duplicateGrid', gridId })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionRaw, dispatch, doUndo, doRedo])

  // --- Live validation

  const catalogIds = useMemo(() => (catalog.length > 0 ? new Set(catalog.map((c) => c.id)) : null), [catalog])
  const issues = useMemo<HudIssue[]>(() => {
    return validateLayout(doc.layout, catalogIds)
  }, [doc.layout, catalogIds])
  const badCells = useMemo(() => {
    const out: Record<string, Set<string>> = {}
    for (const issue of issues) if (issue.gridId && issue.cellId) (out[issue.gridId] ??= new Set()).add(issue.cellId)
    return out
  }, [issues])

  const figures = useMemo(() => previewFigures(doc.layout), [doc.layout])
  const chip = (active: boolean) => clsx('rounded-md border px-2.5 py-1 text-xs', active ? 'border-primary-500 bg-primary-500 text-white' : 'border-dark-100 text-gray-300 hover:border-gray-500')

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            {t('liveHud.editor.profile')}
            <select className="rounded border border-dark-100 bg-dark-300 px-2 py-1 text-xs text-gray-200" value={profile.id} onChange={(e) => setActiveProfile(e.target.value)}>
              {settings.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-gray-500">{t('liveHud.placement.format')}</span>
            {HUD_FORMATS.map((f) => (
              <button key={f} className={chip(f === format)} onClick={() => setFormat(f)}>
                {t(`liveHud.format.${f}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button className="btn-icon" title={`${t('liveHud.editor.undo')} (Ctrl+Z)`} disabled={history.past.length === 0} onClick={doUndo}>
              <Undo2 className="h-4 w-4" />
            </button>
            <button className="btn-icon" title={`${t('liveHud.editor.redo')} (Ctrl+Y)`} disabled={history.future.length === 0} onClick={doRedo}>
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            {t('liveHud.editor.zoom')}
            <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <div className="ml-auto flex items-center gap-1">
            <select
              className="rounded border border-dark-100 bg-dark-300 px-2 py-1 text-xs text-gray-200"
              value=""
              aria-label={t('liveHud.templates.models')}
              onChange={(e) => e.target.value && applyModel(e.target.value as TemplateId)}
            >
              <option value="">{t('liveHud.templates.models')}</option>
              {TEMPLATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`liveHud.templates.${id}`)}
                </option>
              ))}
            </select>
            <button className="btn-secondary flex items-center gap-1 text-xs" onClick={() => addGrid(false)}>
              <Plus className="h-3.5 w-3.5" />
              {t('liveHud.editor.add_grid')}
            </button>
            <button className="btn-secondary flex items-center gap-1 text-xs" onClick={() => addGrid(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t('liveHud.editor.add_popup')}
            </button>
          </div>
        </div>
        {popups.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-gray-500">{t('liveHud.editor.popups')}</span>
            {popups.map((p) => (
              <button
                key={p.id}
                className={chip(p.id === activePopupId)}
                onClick={() => {
                  setActivePopupId(p.id === activePopupId ? null : p.id)
                  setSelection(p.id === activePopupId ? NO_SELECTION : { gridIds: [p.id], cellIds: [], track: null })
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="grid items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <Card className="lg:sticky lg:top-2 lg:h-[calc(100vh-260px)]">
          <Palette catalog={catalog} loading={catalogLoading} onStart={startDrag} onPick={onPick} />
        </Card>

        <div className="min-w-0">
          <Canvas
            doc={doc}
            figures={figures}
            opacity={profile.opacity}
            zoom={zoom}
            playerName={t('liveHud.preview.player', { n: 1 })}
            selection={selection}
            hover={hover}
            editing={editing}
            editorNode={editorNode}
            badCells={badCells}
            popup={activePopup}
            dispatch={dispatch}
            onSelect={setSelection}
            onStartDrag={startDrag}
            onEdit={startEditing}
          />
          <p className="mt-2 text-xs text-gray-500">{t('liveHud.editor.help')}</p>
        </div>

        <Card className="lg:sticky lg:top-2 lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto">
          <Inspector
            doc={doc}
            selection={selection}
            catalog={catalog}
            issues={issues}
            dispatch={dispatch}
            onSelect={setSelection}
            onNewPopup={newPopupFor}
          />
        </Card>
      </div>

      {drag && (
        <div className="pointer-events-none fixed z-50 rounded border border-primary-500 bg-dark-200 px-2 py-1 text-xs text-white shadow-lg" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {drag.payload.label}
        </div>
      )}
    </div>
  )
}

export type { HudGrid }
