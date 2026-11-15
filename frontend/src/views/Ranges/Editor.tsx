import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Redo2, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import RangeMatrix, { type MatrixCell } from '@/components/ranges/RangeMatrix'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useNotificationStore } from '@/stores/notificationStore'
import { useUserRangesStore } from '@/stores/userRangesStore'
import {
  beginStroke,
  changedHands,
  formatDepth,
  lineSummary,
  missingHands,
  redo,
  startHistory,
  strokePaint,
  textColor,
  undo,
  HAND_COUNT,
  type HandMap,
  type PaintHistory,
  type PaintMode,
  type Opponent,
  type Position,
  type RangeFormat,
  type SpotSummary,
} from '@/utils/ranges'
import { ActionModal, AddDepthDialog, ProgramDialog } from './components/RangeDialogs'
import { ActionsCard, ScenarioCard } from './components/SidePanel'
import ScenarioTree from './components/ScenarioTree'
import ScenarioWizard from './components/ScenarioWizard'

interface Prefill {
  format: RangeFormat
  hero: Position
  line: string
  opponent?: Opponent
}

const MODES: PaintMode[] = ['brush', 'rect', 'picker']

export default function Editor() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const store = useUserRangesStore()
  const { spots, actions, selectedSpotId, selectedScenarioId, loadScenario, saveHands } = store
  const spot = spots.find((s) => s.id === selectedSpotId) ?? null
  const scenario = spot?.scenarios.find((s) => s.id === selectedScenarioId) ?? null

  const [saved, setSaved] = useState<HandMap>({})
  const [history, setHistory] = useState<PaintHistory>(startHistory({}))
  const [loading, setLoading] = useState(false)
  const [activeActionId, setActiveActionId] = useState<number | null>(null)
  const [mode, setMode] = useState<PaintMode>('brush')
  const [showMissing, setShowMissing] = useState(false)
  const [pendingSelect, setPendingSelect] = useState<{ spotId: number; scenarioId?: number } | null>(null)

  const [wizard, setWizard] = useState<{ open: boolean; editing: SpotSummary | null; prefill: Prefill | null }>({ open: false, editing: null, prefill: null })
  const [depthFor, setDepthFor] = useState<SpotSummary | null>(null)
  const [program, setProgram] = useState<{ open: boolean; id: number | null; spotIds: number[] }>({ open: false, id: null, spotIds: [] })
  const [actionModal, setActionModal] = useState(false)
  const [deleteSpot, setDeleteSpot] = useState<SpotSummary | null>(null)
  const [removeDepth, setRemoveDepth] = useState(false)

  const hands = history.present
  const dirtyHands = useMemo(() => changedHands(hands, saved), [hands, saved])
  const dirty = dirtyHands.length > 0

  // A situation sent from another screen opens the wizard on it.
  const prefillFromRoute = (useLocation().state as { prefill?: Prefill } | null)?.prefill
  useEffect(() => {
    if (prefillFromRoute) setWizard({ open: true, editing: null, prefill: prefillFromRoute })
  }, [prefillFromRoute])

  // Reading the selected range; a late answer for a scenario no longer selected is dropped.
  useEffect(() => {
    if (selectedScenarioId === null) {
      setSaved({})
      setHistory(startHistory({}))
      return undefined
    }
    let stale = false
    setLoading(true)
    setShowMissing(false)
    void loadScenario(selectedScenarioId).then((loaded) => {
      if (stale) return
      setLoading(false)
      setSaved(loaded ?? {})
      setHistory(startHistory(loaded ?? {}))
    })
    return () => {
      stale = true
    }
  }, [selectedScenarioId, loadScenario])

  // The active action stays valid when the palette changes.
  useEffect(() => {
    setActiveActionId((id) => (id !== null && actions.some((a) => a.id === id) ? id : (actions[0]?.id ?? null)))
  }, [actions])

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const undoStep = useCallback(() => setHistory(undo), [])
  const redoStep = useCallback(() => setHistory(redo), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      e.preventDefault()
      if (e.shiftKey) redoStep()
      else undoStep()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoStep, redoStep])

  const requestSelect = (spotId: number, scenarioId?: number) => {
    if (dirty) setPendingSelect({ spotId, scenarioId })
    else store.select(spotId, scenarioId)
  }

  const cells = useMemo(() => {
    const out: Record<string, MatrixCell> = {}
    const byId = new Map(actions.map((a) => [a.id, a]))
    const edited = new Set(dirtyHands)
    for (const hand of Object.keys(hands)) {
      const action = byId.get(hands[hand])
      if (!action) continue
      out[hand] = { color: action.color, textColor: textColor(action.color), outline: edited.has(hand) ? 'edited' : undefined }
    }
    if (showMissing) for (const hand of missingHands(hands)) out[hand] = { color: 'transparent', textColor: 'inherit', outline: 'deviation' }
    return out
  }, [hands, actions, dirtyHands, showMissing])

  const paintCells = (cellsToPaint: string[], start: boolean) => {
    if (activeActionId === null) return
    setHistory((h) => strokePaint(start ? beginStroke(h) : h, cellsToPaint, activeActionId))
  }

  const save = async () => {
    if (scenario === null) return
    const changes: HandMap = Object.fromEntries(dirtyHands.map((h) => [h, hands[h]]))
    const result = await saveHands(scenario.id, changes)
    if (result.error) notify.error(result.error)
    else {
      setSaved(hands)
      notify.success(t('ranges.editor.saved'))
    }
  }

  const copyFromDepth = async (scenarioId: number) => {
    const source = await loadScenario(scenarioId)
    if (!source) return
    setHistory((h) => ({ ...beginStroke(h), present: { ...source } }))
  }

  const duplicateSpot = async (target: SpotSummary) => {
    const result = await store.duplicateSpot(target.id)
    if (result.error) notify.error(result.error)
  }

  const confirmDeleteSpot = async () => {
    if (!deleteSpot) return
    const result = await store.deleteSpot(deleteSpot.id)
    setDeleteSpot(null)
    if (result.error) notify.error(result.error)
  }

  const confirmRemoveDepth = async () => {
    setRemoveDepth(false)
    if (scenario === null) return
    const result = await store.removeDepth(scenario.id)
    if (result.error) notify.error(result.error)
  }

  const openWizard = (editing: SpotSummary | null = null) => setWizard({ open: true, editing, prefill: null })
  const activeAction = actions.find((a) => a.id === activeActionId)
  const missing = missingHands(hands).length
  const otherDepths = spot?.scenarios.filter((s) => s.id !== scenario?.id) ?? []

  const tree = (
    <ScenarioTree
      onSelect={requestSelect}
      onNewScenario={() => openWizard()}
      onEdit={(s) => openWizard(s)}
      onDuplicate={(s) => void duplicateSpot(s)}
      onAddDepth={setDepthFor}
      onAddToProgram={(s) => setProgram({ open: true, id: null, spotIds: [s.id] })}
      onDelete={setDeleteSpot}
      onNewProgram={() => setProgram({ open: true, id: null, spotIds: [] })}
      onEditProgram={(id) => setProgram({ open: true, id, spotIds: [] })}
    />
  )

  const dialogs = (
    <>
      <ScenarioWizard open={wizard.open} editing={wizard.editing} prefill={wizard.prefill} onClose={() => setWizard((w) => ({ ...w, open: false }))} />
      <AddDepthDialog spot={depthFor} onClose={() => setDepthFor(null)} />
      <ProgramDialog open={program.open} programId={program.id} initialSpotIds={program.spotIds} onClose={() => setProgram((p) => ({ ...p, open: false }))} />
      <ActionModal open={actionModal} onClose={() => setActionModal(false)} />
      <ConfirmDialog
        open={pendingSelect !== null}
        title={t('ranges.editor.unsavedTitle')}
        detail={t('ranges.editor.unsavedDetail')}
        confirmLabel={t('ranges.editor.discard')}
        onCancel={() => setPendingSelect(null)}
        onConfirm={() => {
          if (pendingSelect) store.select(pendingSelect.spotId, pendingSelect.scenarioId)
          setPendingSelect(null)
        }}
      />
      <ConfirmDialog
        open={deleteSpot !== null}
        title={t('ranges.editor.deleteTitle', { name: deleteSpot?.name })}
        detail={t('ranges.editor.deleteDetail', { count: deleteSpot?.scenarios.length ?? 0 })}
        confirmLabel={t('common.delete')}
        onCancel={() => setDeleteSpot(null)}
        onConfirm={() => void confirmDeleteSpot()}
      />
      <ConfirmDialog
        open={removeDepth}
        title={t('ranges.editor.removeDepthTitle', { depth: scenario ? formatDepth(scenario.stackBb) : '' })}
        detail={t('ranges.editor.removeDepthDetail')}
        confirmLabel={t('common.delete')}
        onCancel={() => setRemoveDepth(false)}
        onConfirm={() => void confirmRemoveDepth()}
      />
    </>
  )

  if (spot === null || scenario === null) {
    return (
      <div className="grid gap-[18px] lg:grid-cols-[290px_minmax(0,1fr)]">
        {tree}
        <div className="card p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[360px]">
          <h2 className="text-xl font-bold text-gray-100">{t('ranges.empty.title')}</h2>
          <p className="text-sm text-gray-400 max-w-md">{t('ranges.empty.body')}</p>
          <button className="btn-primary mt-2" onClick={() => openWizard()}>
            {t('ranges.empty.create')}
          </button>
        </div>
        {dialogs}
      </div>
    )
  }

  return (
    <div className="grid gap-[18px] lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(560px,1fr)_320px]">
      {tree}

      <section className="card p-5 flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-xl font-bold text-gray-100">
            {spot.name} · {formatDepth(scenario.stackBb)} bb
          </h2>
          <span className="text-[13px] text-gray-400">
            {t(`ranges.format.${spot.format}`)} · {spot.line === '' ? t('ranges.wizard.firstToAct') : lineSummary(spot.line)} · {t(`ranges.opponent.${spot.opponent}Lower`)}
          </span>
          <button
            className={clsx('ml-auto rounded-full px-2.5 py-1 text-xs font-medium', missing === 0 ? 'bg-primary-500/15 text-primary-400' : 'bg-deviation/15 text-deviation')}
            disabled={missing === 0}
            aria-pressed={showMissing}
            onClick={() => setShowMissing((v) => !v)}
          >
            {missing === 0 ? t('ranges.editor.complete', { count: HAND_COUNT }) : t('ranges.editor.missing', { known: HAND_COUNT - missing, total: HAND_COUNT, missing })}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="segmented">
            {MODES.map((value) => (
              <button key={value} aria-pressed={mode === value} className={clsx('segmented-item', mode === value && 'active')} onClick={() => setMode(value)}>
                {t(`ranges.editor.modes.${value}`)}
              </button>
            ))}
          </div>
          {activeAction && (
            <span className="flex items-center gap-2 text-[13px] text-gray-400">
              {t('ranges.editor.activeColor')}
              <span className="flex items-center gap-1.5 rounded-full border-2 px-2 py-0.5 text-xs font-semibold text-gray-100" style={{ borderColor: activeAction.color }}>
                <span className="w-3 h-3 rounded-[3px]" style={{ backgroundColor: activeAction.color }} />
                {activeAction.label}
              </span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {otherDepths.length > 0 && (
              <select
                className="select w-44"
                aria-label={t('ranges.editor.copyFrom')}
                value=""
                onChange={(e) => e.target.value !== '' && void copyFromDepth(Number(e.target.value))}
              >
                <option value="">{t('ranges.editor.copyFrom')}</option>
                {otherDepths.map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatDepth(d.stackBb)} bb
                  </option>
                ))}
              </select>
            )}
            <button className="btn-icon p-2" aria-label={t('ranges.editor.undo')} title={t('ranges.editor.undo')} disabled={history.past.length === 0} onClick={undoStep}>
              <Undo2 className="w-4 h-4" />
            </button>
            <button className="btn-icon p-2" aria-label={t('ranges.editor.redo')} title={t('ranges.editor.redo')} disabled={history.future.length === 0} onClick={redoStep}>
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className={clsx('mx-auto w-full max-w-[540px]', loading && 'opacity-60')}>
          <RangeMatrix
            cells={cells}
            label={t('ranges.editor.gridLabel', { name: spot.name, depth: formatDepth(scenario.stackBb) })}
            paintMode={mode}
            onPaint={paintCells}
            onPick={(hand) => setActiveActionId(hands[hand] ?? activeActionId)}
          />
        </div>
        <p className="text-xs text-gray-500">{t('ranges.editor.note')}</p>

        {dirty && (
          <div className="flex items-center gap-2">
            <button className="btn-primary" onClick={() => void save()}>
              {t('ranges.editor.save')}
            </button>
            <button className="btn-secondary" onClick={() => setHistory(startHistory(saved))}>
              {t('ranges.editor.revert')}
            </button>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-[18px] lg:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 min-w-0">
        <ScenarioCard
          spot={spot}
          scenarioId={scenario.id}
          onEdit={() => openWizard(spot)}
          onAddDepth={() => setDepthFor(spot)}
          onRemoveDepth={() => setRemoveDepth(true)}
          onSelectDepth={(id) => requestSelect(spot.id, id)}
        />
        <ActionsCard hands={hands} activeActionId={activeActionId} onActivate={setActiveActionId} onNewAction={() => setActionModal(true)} />
      </div>
      {dialogs}
    </div>
  )
}
