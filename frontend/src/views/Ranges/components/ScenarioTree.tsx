import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useUserRangesStore } from '@/stores/userRangesStore'
import { countByFormat, formatDepth, groupsOfFormat, groupSpots, shortName, type RangeFormat, type SpotSummary } from '@/utils/ranges'

const FORMATS: readonly RangeFormat[] = ['3max', 'hu']

const NEW_PROGRAM = 'new'

interface ScenarioTreeProps {
  onSelect: (spotId: number, scenarioId?: number) => void
  onNewScenario: () => void
  onEdit: (spot: SpotSummary) => void
  onDuplicate: (spot: SpotSummary) => void
  onAddDepth: (spot: SpotSummary) => void
  onAddToProgram: (spot: SpotSummary) => void
  onDelete: (spot: SpotSummary) => void
  onNewProgram: () => void
  onEditProgram: (programId: number) => void
}

/** The left column: programs filter, scenarios grouped by position, each with its depths. */
export default function ScenarioTree(props: ScenarioTreeProps) {
  const { t } = useTranslation()
  const { spots, programs, programFilter, setProgramFilter, selectedSpotId, selectedScenarioId } = useUserRangesStore()
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [chosenFormat, setChosenFormat] = useState<RangeFormat | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (menuFor === null) return undefined
    const close = () => setMenuFor(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuFor])

  const visible = useMemo(() => {
    const program = programs.find((p) => p.id === programFilter)
    return program ? spots.filter((s) => program.spotIds.includes(s.id)) : spots
  }, [spots, programs, programFilter])
  const allGroups = useMemo(() => groupSpots(visible), [visible])
  const counts = useMemo(() => countByFormat(visible), [visible])
  const selectedFormat = spots.find((s) => s.id === selectedSpotId)?.format

  // The switch follows the selected scenario, and falls back to a format that has spots.
  useEffect(() => {
    if (selectedFormat) setChosenFormat(selectedFormat)
  }, [selectedFormat, selectedSpotId])
  // An explicit choice always wins, even for a format with no scenario yet: the switch must never look dead.
  const format: RangeFormat = chosenFormat ?? (counts['3max'] > 0 || counts.hu === 0 ? '3max' : 'hu')
  const groups = useMemo(() => groupsOfFormat(allGroups, format), [allGroups, format])

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const menu = (spot: SpotSummary) => [
    { key: 'edit', label: t('ranges.tree.menu.edit'), run: () => props.onEdit(spot) },
    { key: 'duplicate', label: t('ranges.tree.menu.duplicate'), run: () => props.onDuplicate(spot) },
    { key: 'depth', label: t('ranges.tree.menu.addDepth'), run: () => props.onAddDepth(spot) },
    { key: 'program', label: t('ranges.tree.menu.addToProgram'), run: () => props.onAddToProgram(spot) },
    { key: 'delete', label: t('ranges.tree.menu.delete'), run: () => props.onDelete(spot) },
  ]

  return (
    <aside className="card p-4 flex flex-col gap-3 self-start">
      <div>
        <div className="text-xs text-gray-400 mb-1.5">{t('ranges.tree.program')}</div>
        <div className="flex items-center gap-1.5">
          <select
            className="select flex-1 min-w-0"
            aria-label={t('ranges.tree.program')}
            value={programFilter ?? ''}
            onChange={(e) => {
              if (e.target.value === NEW_PROGRAM) props.onNewProgram()
              else setProgramFilter(e.target.value === '' ? null : Number(e.target.value))
            }}
          >
            <option value="">{t('ranges.tree.allRanges', { count: spots.length })}</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name} · {program.spotIds.length}
              </option>
            ))}
            <option value={NEW_PROGRAM}>{t('ranges.tree.newProgram')}</option>
          </select>
          {programFilter !== null && (
            <button className="btn-icon p-2" aria-label={t('ranges.tree.editProgram')} onClick={() => props.onEditProgram(programFilter)}>
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div role="group" aria-label={t('ranges.tree.format')} className="segmented">
        {FORMATS.map((value) => (
          <button key={value} aria-pressed={format === value} className={clsx('segmented-item flex-1', format === value && 'active')} onClick={() => setChosenFormat(value)}>
            {t(`ranges.format.${value}`)} <span className="font-mono text-[11px] opacity-70">{counts[value]}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 && <p className="text-sm text-gray-500">{t(`ranges.tree.emptyFormat.${format}`)}</p>}

      {groups.map((group) => {
        const open = !collapsed.has(group.key)
        return (
          <div key={group.key} className="flex flex-col gap-0.5">
            <button
              aria-expanded={open}
              onClick={() => toggle(group.key)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold text-gray-100 hover:bg-dark-300"
            >
              {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
              {group.hero}
              <span className="ml-auto font-mono text-[11px] font-normal text-gray-500">{group.spots.length}</span>
            </button>
            {open &&
              group.spots.map((spot) => {
                const selected = spot.id === selectedSpotId
                return (
                  <div
                    key={spot.id}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenuFor(spot.id)
                    }}
                    className={clsx('relative ml-4 rounded-lg border px-2.5 py-1.5 text-left', selected ? 'bg-primary-500/10 border-primary-500' : 'bg-transparent border-transparent hover:bg-dark-300')}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <button className="min-w-0 flex-1 text-left text-[13px] text-gray-100" onClick={() => props.onSelect(spot.id)}>
                        {shortName(spot)}
                        {spot.studyOnly && <span className="ml-1.5 text-[11px] text-deviation">{t('ranges.tree.studyOnly')}</span>}
                      </button>
                      {!selected && <span className="font-mono text-[11px] text-gray-500">{spot.scenarios.map((s) => formatDepth(s.stackBb)).join(' · ')}</span>}
                      <button
                        className="btn-icon p-1"
                        aria-label={t('ranges.tree.menu.open')}
                        aria-haspopup="menu"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuFor(menuFor === spot.id ? null : spot.id)
                        }}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                    {selected && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {spot.scenarios.map((scenario) => (
                          <button
                            key={scenario.id}
                            aria-pressed={scenario.id === selectedScenarioId}
                            onClick={() => props.onSelect(spot.id, scenario.id)}
                            className={clsx('rounded-md px-1.5 py-0.5 font-mono text-[11px]', scenario.id === selectedScenarioId ? 'bg-primary-500 text-onprimary' : 'bg-dark-300 text-gray-400 hover:text-gray-100')}
                          >
                            {formatDepth(scenario.stackBb)}
                          </button>
                        ))}
                        <button className="rounded-md border border-dashed border-dark-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500 hover:text-gray-100" aria-label={t('ranges.tree.menu.addDepth')} onClick={() => props.onAddDepth(spot)}>
                          +
                        </button>
                      </div>
                    )}
                    {menuFor === spot.id && (
                      <div role="menu" className="absolute right-1 top-8 z-20 min-w-[190px] rounded-lg border border-dark-100 bg-dark-300 py-1 shadow-xl">
                        {menu(spot).map((item) => (
                          <button
                            key={item.key}
                            role="menuitem"
                            className={clsx('block w-full px-3 py-1.5 text-left text-sm hover:bg-dark-200', item.key === 'delete' ? 'text-profit-negative' : 'text-gray-100')}
                            onClick={() => {
                              setMenuFor(null)
                              item.run()
                            }}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )
      })}

      <button
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-dark-100 px-3 py-2 text-sm text-gray-400 hover:text-gray-100 hover:border-gray-500"
        onClick={props.onNewScenario}
      >
        <Plus className="w-4 h-4" />
        {t('ranges.tree.newScenario')}
      </button>
    </aside>
  )
}
