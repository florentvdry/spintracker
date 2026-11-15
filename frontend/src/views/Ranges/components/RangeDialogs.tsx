import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/ui/Modal'
import ActionFields, { draftOf, draftToInput, emptyDraft, isDraftValid, type ActionDraft } from '@/components/ranges/ActionFields'
import { useUserRangesStore, type ImportReport } from '@/stores/userRangesStore'
import { formatDepth, type SpotSummary } from '@/utils/ranges'

interface ImportDialogProps {
  /** The text of the file the player picked; null keeps the dialog closed. */
  content: string | null
  onClose: () => void
}

/** What an import would do, then the choice between replacing and merging. */
export function ImportDialog({ content, onClose }: ImportDialogProps) {
  const { t } = useTranslation()
  const importRanges = useUserRangesStore((s) => s.importRanges)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setReport(null)
    setError(null)
    if (content === null) return undefined
    let stale = false
    void importRanges(content, 'replace', true).then((result) => {
      if (stale) return
      if (result.error) setError(result.error)
      else setReport(result.value ?? null)
    })
    return () => {
      stale = true
    }
  }, [content, importRanges])

  const run = async (mode: 'replace' | 'merge') => {
    if (content === null) return
    setBusy(true)
    const result = await importRanges(content, mode)
    setBusy(false)
    if (result.error) setError(result.error)
    else onClose()
  }

  const counts: [string, number][] = report
    ? [
        [t('ranges.import.actions'), report.actions],
        [t('ranges.import.spots'), report.spots],
        [t('ranges.import.scenarios'), report.scenarios],
        [t('ranges.import.programs'), report.programs],
      ]
    : []
  return (
    <Modal
      open={content !== null}
      onClose={onClose}
      title={t('ranges.import.title')}
      width={520}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-secondary" disabled={!report || busy} onClick={() => void run('merge')}>
            {t('ranges.import.merge')}
          </button>
          <button className="btn-primary" disabled={!report || busy} onClick={() => void run('replace')}>
            {t('ranges.import.replace')}
          </button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-profit-negative">
          {error}
        </p>
      )}
      {!report && !error && <div className="spinner mx-auto my-6" />}
      {report && (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-4 gap-2">
            {counts.map(([term, value]) => (
              <div key={term} className="rounded-lg bg-dark-300 p-3">
                <dt className="text-xs text-gray-400">{term}</dt>
                <dd className="font-mono text-xl font-bold text-gray-100">{value}</dd>
              </div>
            ))}
          </dl>
          {report.warnings.length > 0 && (
            <div>
              <div className="text-xs text-deviation mb-1">{t('ranges.import.warnings', { count: report.warnings.length })}</div>
              <ul className="max-h-40 overflow-y-auto text-xs text-gray-400 list-disc pl-4 space-y-0.5">
                {report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-500">{t('ranges.import.choose')}</p>
        </div>
      )}
    </Modal>
  )
}

interface ProgramDialogProps {
  open: boolean
  onClose: () => void
  /** The program to edit; null creates one. */
  programId: number | null
  /** Scenarios the new program starts with. */
  initialSpotIds?: number[]
}

/** Creates, renames and fills a program: a named, ordered list of scenarios. */
export function ProgramDialog({ open, onClose, programId, initialSpotIds = [] }: ProgramDialogProps) {
  const { t } = useTranslation()
  const { spots, programs, saveProgram, deleteProgram, setProgramFilter } = useUserRangesStore()
  const program = programs.find((p) => p.id === programId)
  const [name, setName] = useState('')
  const [ids, setIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(program?.name ?? '')
    setIds(program?.spotIds ?? initialSpotIds)
    setError(null)
  }, [open, program, initialSpotIds])

  const move = (index: number, delta: number) =>
    setIds((list) => {
      const next = [...list]
      const target = index + delta
      if (target < 0 || target >= next.length) return list
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  const save = async () => {
    const result = await saveProgram({ id: programId ?? undefined, name, spotIds: ids })
    if (result.error) return setError(result.error)
    if (result.value !== undefined) setProgramFilter(result.value)
    onClose()
  }

  const remove = async () => {
    if (programId === null) return
    const result = await deleteProgram(programId)
    if (result.error) return setError(result.error)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={programId === null ? t('ranges.program.newTitle') : t('ranges.program.editTitle')}
      width={480}
      footer={
        <>
          {programId !== null && (
            <button className="btn-danger mr-auto" onClick={() => void remove()}>
              {t('common.delete')}
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={name.trim() === ''} onClick={() => void save()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input className="input" aria-label={t('ranges.program.name')} placeholder={t('ranges.program.name')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <div className="text-xs text-gray-400">{t('ranges.program.scenarios')}</div>
        <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {[...ids.map((id) => spots.find((s) => s.id === id)), ...spots.filter((s) => !ids.includes(s.id))]
            .filter((s): s is SpotSummary => s !== undefined)
            .map((spot) => {
              const index = ids.indexOf(spot.id)
              const checked = index >= 0
              return (
                <li key={spot.id} className="flex items-center gap-2 text-sm text-gray-100">
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={spot.name}
                    onChange={() => setIds((list) => (checked ? list.filter((id) => id !== spot.id) : [...list, spot.id]))}
                  />
                  <span className="flex-1 truncate">{spot.name}</span>
                  {checked && (
                    <>
                      <button className="btn-icon p-1" aria-label={t('ranges.program.up')} disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button className="btn-icon p-1" aria-label={t('ranges.program.down')} disabled={index === ids.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </li>
              )
            })}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-profit-negative">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

interface AddDepthDialogProps {
  spot: SpotSummary | null
  onClose: () => void
}

/** Adds one depth to a scenario, empty or copied from another depth of the same scenario. */
export function AddDepthDialog({ spot, onClose }: AddDepthDialogProps) {
  const { t } = useTranslation()
  const addDepth = useUserRangesStore((s) => s.addDepth)
  const select = useUserRangesStore((s) => s.select)
  const [value, setValue] = useState('')
  const [copyFrom, setCopyFrom] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue('')
    setCopyFrom(spot?.scenarios[0]?.stackBb ?? null)
    setError(null)
  }, [spot])

  const stack = Number(value.replace(',', '.'))
  const submit = async () => {
    if (!spot) return
    const start = copyFrom === null ? { kind: 'empty' } : { kind: 'depth', stackBb: copyFrom }
    const result = await addDepth(spot.id, stack, start)
    if (result.error) return setError(result.error)
    if (result.value !== undefined) select(spot.id, result.value)
    onClose()
  }

  return (
    <Modal
      open={spot !== null}
      onClose={onClose}
      title={t('ranges.depth.title')}
      width={420}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={!(stack > 0)} onClick={() => void submit()}>
            {t('ranges.depth.add')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input autoFocus className="input w-24 font-mono text-right" aria-label={t('ranges.depth.title')} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="text-sm text-gray-400">bb</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-100">
          <input type="radio" name="depth-start" checked={copyFrom === null} onChange={() => setCopyFrom(null)} />
          {t('ranges.wizard.startEmpty')}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-100">
          <input type="radio" name="depth-start" checked={copyFrom !== null} onChange={() => setCopyFrom(spot?.scenarios[0]?.stackBb ?? null)} />
          {t('ranges.depth.copy')}
          <select className="select w-24 font-mono" aria-label={t('ranges.depth.copy')} disabled={copyFrom === null} value={copyFrom ?? ''} onChange={(e) => setCopyFrom(Number(e.target.value))}>
            {spot?.scenarios.map((s) => (
              <option key={s.id} value={s.stackBb}>
                {formatDepth(s.stackBb)}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-sm text-profit-negative">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

interface ActionModalProps {
  open: boolean
  onClose: () => void
}

/** The action sheet in a modal ("+ Nouvelle action"). */
export function ActionModal({ open, onClose }: ActionModalProps) {
  const { t } = useTranslation()
  const { actions, saveActions } = useUserRangesStore()
  const [draft, setDraft] = useState<ActionDraft>(emptyDraft())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(emptyDraft())
      setError(null)
    }
  }, [open])

  const save = async () => {
    const created = draftToInput(draft)
    if (!created) return
    const existing = actions.map((a) => draftToInput(draftOf(a)))
    const result = await saveActions([...existing, created])
    if (result.error) setError(result.error)
    else onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ranges.actions.newTitle')}
      width={760}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={!isDraftValid(draft)} onClick={() => void save()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <ActionFields draft={draft} onChange={setDraft} />
      {error && (
        <p role="alert" className="mt-3 text-sm text-profit-negative">
          {error}
        </p>
      )}
    </Modal>
  )
}
