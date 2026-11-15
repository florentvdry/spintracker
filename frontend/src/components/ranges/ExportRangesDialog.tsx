import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { allScenarioIds, checkState, formatDepth, groupSpots, shortName, toggleScenarios, type SpotSummary } from '@/utils/ranges'

interface ExportRangesDialogProps {
  open: boolean
  spots: readonly SpotSummary[]
  onClose: () => void
  /** Called with the chosen depths (scenario ids). */
  onExport: (scenarioIds: number[]) => void
}

/** A checkbox that shows a dash when only part of what it stands for is selected. */
function Tick({ state, label, onChange }: { state: 'none' | 'some' | 'all'; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return <input ref={ref} type="checkbox" className="h-4 w-4 accent-primary-500" aria-label={label} checked={state === 'all'} onChange={onChange} />
}

/** Picks which situations and depths go into the exported file. */
export default function ExportRangesDialog({ open, spots, onClose, onExport }: ExportRangesDialogProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const groups = useMemo(() => groupSpots(spots), [spots])
  const total = useMemo(() => allScenarioIds(spots).size, [spots])

  // Every time the dialog opens, everything is selected again.
  useEffect(() => {
    if (open) setSelected(allScenarioIds(spots))
  }, [open, spots])

  const toggle = (ids: readonly number[]) => setSelected((current) => toggleScenarios(current, ids))
  const idsOf = (list: readonly SpotSummary[]) => list.flatMap((s) => s.scenarios.map((sc) => sc.id))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ranges.exportDialog.title')}
      width={560}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-gray-400">{t('ranges.exportDialog.count', { selected: selected.size, total })}</span>
          <button className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={selected.size === 0} onClick={() => onExport([...selected])}>
            {t('ranges.exportDialog.confirm')}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-gray-400">{t('ranges.exportDialog.help')}</p>
      <div className="mb-3 flex gap-3 text-xs">
        <button className="text-info hover:underline" onClick={() => setSelected(allScenarioIds(spots))}>
          {t('ranges.exportDialog.all')}
        </button>
        <button className="text-info hover:underline" onClick={() => setSelected(new Set())}>
          {t('ranges.exportDialog.none')}
        </button>
      </div>
      <div className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto pr-1">
        {groups.map((group) => (
          <section key={group.key}>
            <label className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-gray-100">
              <Tick state={checkState(selected, idsOf(group.spots))} label={t('ranges.exportDialog.selectGroup', { name: group.hero })} onChange={() => toggle(idsOf(group.spots))} />
              {group.hero} · {t(`ranges.format.${group.format}Short`)}
            </label>
            <ul className="flex flex-col">
              {group.spots.map((spot) => {
                const ids = spot.scenarios.map((sc) => sc.id)
                return (
                  <li key={spot.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 pl-6 hover:bg-dark-300">
                    <Tick state={checkState(selected, ids)} label={t('ranges.exportDialog.selectSpot', { name: spot.name })} onChange={() => toggle(ids)} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-gray-100" title={spot.name}>
                      {shortName(spot)}
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {spot.scenarios.map((sc) => (
                        <button
                          key={sc.id}
                          aria-pressed={selected.has(sc.id)}
                          aria-label={t('ranges.exportDialog.selectDepth', { name: spot.name, depth: formatDepth(sc.stackBb) })}
                          onClick={() => toggle([sc.id])}
                          className={clsx('rounded-md px-1.5 py-0.5 font-mono text-[11px]', selected.has(sc.id) ? 'bg-primary-500 text-onprimary' : 'bg-dark-300 text-gray-400')}
                        >
                          {formatDepth(sc.stackBb)}
                        </button>
                      ))}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
