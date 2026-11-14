import { useEffect, useMemo, useState } from 'react'
import { GripVertical, Plus, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import ActionFields, { draftOf, draftToInput, emptyDraft, isDraftValid, type ActionDraft } from '@/components/ranges/ActionFields'
import Card from '@/components/ui/Card'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import { useNotificationStore } from '@/stores/notificationStore'
import { useUserRangesStore } from '@/stores/userRangesStore'
import { formatDepth } from '@/utils/ranges'

const MAX_DEPTH_BB = 200
const NEW_CARDS_STEP = 5

/** A draft with a key of its own, so unsaved rows keep their place while the list is reordered. */
interface Row {
  key: string
  draft: ActionDraft
}

let rowCounter = 0
const newKey = () => `row-${(rowCounter += 1)}`

/** "My ranges" in the settings: the action palette and the proposed depths. */
export default function RangesSettings() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const { actions, settings, loaded, load, saveActions, deleteAction, saveSettings } = useUserRangesStore()

  const [rows, setRows] = useState<Row[]>([])
  const [dragging, setDragging] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Row | null>(null)
  const [replacement, setReplacement] = useState<number | null>(null)
  const [newDepth, setNewDepth] = useState('')

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  useEffect(() => {
    setRows(actions.map((a) => ({ key: `action-${a.id}`, draft: draftOf(a) })))
  }, [actions])

  const saved = useMemo(() => JSON.stringify(actions.map((a) => draftToInput(draftOf(a)))), [actions])
  const current = useMemo(() => JSON.stringify(rows.map((r) => draftToInput(r.draft))), [rows])
  const dirty = saved !== current
  const valid = rows.every((r) => isDraftValid(r.draft))

  const reorder = (overKey: string) => {
    if (dragging === null || dragging === overKey) return
    setRows((list) => {
      const from = list.findIndex((r) => r.key === dragging)
      const to = list.findIndex((r) => r.key === overKey)
      if (from < 0 || to < 0) return list
      const next = [...list]
      next.splice(to, 0, next.splice(from, 1)[0])
      return next
    })
  }

  const save = async () => {
    const result = await saveActions(rows.map((r) => draftToInput(r.draft)).filter((a): a is Record<string, unknown> => a !== null))
    if (result.error) notify.error(result.error)
    else notify.success(t('ranges.settings.saved'))
  }

  const askDelete = (row: Row) => {
    if (row.draft.id === undefined) return setRows((list) => list.filter((r) => r.key !== row.key))
    const others = actions.filter((a) => a.id !== row.draft.id)
    setReplacement(others[0]?.id ?? null)
    setToDelete(row)
  }

  const confirmDelete = async () => {
    const id = toDelete?.draft.id
    const used = actions.find((a) => a.id === id)?.usedHands ?? 0
    setToDelete(null)
    if (id === undefined) return
    const result = await deleteAction(id, used > 0 ? replacement : null)
    if (result.error) notify.error(result.error)
  }

  const deleting = actions.find((a) => a.id === toDelete?.draft.id)
  const stacks = settings.defaultStacks

  const addDepth = async () => {
    const value = Number(newDepth.replace(',', '.'))
    setNewDepth('')
    if (!(value > 0 && value <= MAX_DEPTH_BB) || stacks.includes(value)) return
    const result = await saveSettings({ defaultStacks: [...stacks, value] })
    if (result.error) notify.error(result.error)
  }

  const removeDepth = async (stack: number) => {
    const result = await saveSettings({ defaultStacks: stacks.filter((s) => s !== stack) })
    if (result.error) notify.error(result.error)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title={t('ranges.settings.actionsTitle')} subtitle={t('ranges.settings.actionsHelp')}>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.key}
              draggable={dragging === row.key}
              onDragOver={(e) => {
                e.preventDefault()
                reorder(row.key)
              }}
              onDragEnd={() => setDragging(null)}
              className={clsx('flex items-start gap-2 rounded-lg border border-dark-200 bg-dark-600 p-2', dragging === row.key && 'opacity-60')}
            >
              <span
                className="mt-1.5 cursor-grab text-gray-500"
                role="img"
                aria-label={t('ranges.settings.drag')}
                onMouseDown={() => setDragging(row.key)}
                onMouseUp={() => setDragging(null)}
              >
                <GripVertical className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <ActionFields draft={row.draft} onChange={(draft) => setRows((list) => list.map((r) => (r.key === row.key ? { ...r, draft } : r)))} />
              </div>
              <button className="btn-icon p-2" aria-label={t('common.delete')} onClick={() => askDelete(row)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 mt-3">
          <button className="flex items-center gap-1.5 rounded-lg border border-dashed border-dark-100 px-3 py-2 text-sm text-gray-400 hover:text-gray-100" onClick={() => setRows((list) => [...list, { key: newKey(), draft: emptyDraft() }])}>
            <Plus className="w-4 h-4" />
            {t('ranges.settings.addAction')}
          </button>
          {dirty && (
            <>
              <button className="btn-primary" disabled={!valid} onClick={() => void save()}>
                {t('common.save')}
              </button>
              <button className="btn-secondary" onClick={() => setRows(actions.map((a) => ({ key: `action-${a.id}`, draft: draftOf(a) })))}>
                {t('ranges.editor.revert')}
              </button>
            </>
          )}
        </div>
      </Card>

      <Card title={t('ranges.settings.depthsTitle')} subtitle={t('ranges.settings.depthsHelp')}>
        <div className="flex flex-wrap items-center gap-2">
          {stacks.map((stack) => (
            <span key={stack} className="flex items-center gap-1 rounded-full bg-dark-300 pl-3 pr-1.5 py-1 font-mono text-xs text-gray-100">
              {formatDepth(stack)}
              <button className="btn-icon p-0.5" aria-label={t('ranges.settings.removeDepth', { depth: formatDepth(stack) })} onClick={() => void removeDepth(stack)}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            className="input w-24 font-mono text-right"
            aria-label={t('ranges.settings.addDepth')}
            placeholder="+"
            inputMode="decimal"
            value={newDepth}
            onChange={(e) => setNewDepth(e.target.value)}
            onBlur={() => void addDepth()}
            onKeyDown={(e) => e.key === 'Enter' && void addDepth()}
          />
        </div>
        <div className="flex items-center gap-3 mt-4">
          <span className="text-sm text-gray-400">{t('ranges.settings.depthRule')}</span>
          <div className="segmented">
            {(['nearest', 'below'] as const).map((rule) => (
              <button
                key={rule}
                aria-pressed={settings.depthRule === rule}
                className={clsx('segmented-item', settings.depthRule === rule && 'active')}
                onClick={() => void saveSettings({ depthRule: rule })}
              >
                {t(`ranges.settings.rules.${rule}`)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card title={t('ranges.settings.trainingTitle')}>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-3 text-sm text-gray-100">
            {t('ranges.settings.newCardsPerDay')}
            <input
              type="number"
              min={0}
              max={500}
              step={NEW_CARDS_STEP}
              className="input w-24 font-mono text-right"
              value={settings.newCardsPerDay}
              onChange={(e) => void saveSettings({ newCardsPerDay: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-100">
            <input type="checkbox" checked={settings.prioritizeBorderline} onChange={(e) => void saveSettings({ prioritizeBorderline: e.target.checked })} />
            {t('ranges.training.borderline')}
          </label>
        </div>
      </Card>

      <p className="text-xs text-gray-500">{t('ranges.settings.regNote')}</p>

      <ConfirmDialog
        open={toDelete !== null && (deleting?.usedHands ?? 0) === 0}
        title={t('ranges.settings.deleteTitle', { label: deleting?.label })}
        confirmLabel={t('common.delete')}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
      <Modal
        open={toDelete !== null && (deleting?.usedHands ?? 0) > 0}
        onClose={() => setToDelete(null)}
        title={t('ranges.settings.deleteTitle', { label: deleting?.label })}
        width={440}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setToDelete(null)}>
              {t('common.cancel')}
            </button>
            <button className="btn-danger" disabled={replacement === null} onClick={() => void confirmDelete()}>
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-400 mb-3">{t('ranges.settings.deleteUsed', { count: deleting?.usedHands ?? 0 })}</p>
        <label className="flex items-center gap-2 text-sm text-gray-100">
          {t('ranges.settings.replaceBy')}
          <select className="select flex-1" value={replacement ?? ''} onChange={(e) => setReplacement(Number(e.target.value))}>
            {actions
              .filter((a) => a.id !== deleting?.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
          </select>
        </label>
      </Modal>
    </div>
  )
}
