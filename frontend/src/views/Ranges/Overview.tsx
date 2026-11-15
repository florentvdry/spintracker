import { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import RangeMatrix, { type MatrixCell } from '@/components/ranges/RangeMatrix'
import { useUserRangesStore } from '@/stores/userRangesStore'
import { actionStats, countByFormat, formatDepth, formatNumber, lineSummary, overviewColumns, shortName, textColor, type HandMap, type RangeFormat } from '@/utils/ranges'
import { actionSubtitle } from './components/SidePanel'

const FORMATS: readonly RangeFormat[] = ['3max', 'hu']

interface OverviewProps {
  onOpenEditor: (spotId: number, scenarioId: number) => void
}

/** Every range at a glance: the situations and depths as columns, and the grid of the one picked. */
export default function Overview({ onOpenEditor }: OverviewProps) {
  const { t, i18n } = useTranslation()
  const spots = useUserRangesStore((s) => s.spots)
  const actions = useUserRangesStore((s) => s.actions)
  const loadScenario = useUserRangesStore((s) => s.loadScenario)
  const counts = useMemo(() => countByFormat(spots), [spots])
  const [chosenFormat, setChosenFormat] = useState<RangeFormat | null>(null)
  const [scenarioId, setScenarioId] = useState<number | null>(null)
  const [hands, setHands] = useState<HandMap | null>(null)

  const format: RangeFormat = chosenFormat ?? (counts['3max'] > 0 || counts.hu === 0 ? '3max' : 'hu')
  const columns = useMemo(() => overviewColumns(spots, format), [spots, format])

  // The picked range stays valid when the format or the ranges change: fall back to the first one shown.
  useEffect(() => {
    if (columns.some((column) => column.depths.some((d) => d.id === scenarioId))) return
    setScenarioId(columns.find((column) => column.depths.length > 0)?.depths[0].id ?? null)
  }, [columns, scenarioId])

  // A late answer for a range no longer picked is dropped.
  useEffect(() => {
    setHands(null)
    if (scenarioId === null) return undefined
    let stale = false
    void loadScenario(scenarioId).then((loaded) => {
      if (!stale) setHands(loaded ?? {})
    })
    return () => {
      stale = true
    }
  }, [scenarioId, loadScenario])

  const picked = useMemo(() => {
    const spot = spots.find((s) => s.scenarios.some((sc) => sc.id === scenarioId))
    const scenario = spot?.scenarios.find((sc) => sc.id === scenarioId)
    return spot && scenario ? { spot, scenario } : null
  }, [spots, scenarioId])

  const cells = useMemo(() => {
    const out: Record<string, MatrixCell> = {}
    const byId = new Map(actions.map((a) => [a.id, a]))
    for (const hand of Object.keys(hands ?? {})) {
      const action = byId.get((hands as HandMap)[hand])
      if (action) out[hand] = { color: action.color, textColor: textColor(action.color) }
    }
    return out
  }, [hands, actions])

  const legend = useMemo(() => {
    const stats = actionStats(hands ?? {})
    return actions
      .map((action) => ({ action, combos: stats.get(action.id)?.combos ?? 0, percent: stats.get(action.id)?.percent ?? 0 }))
      .filter((row) => row.combos > 0)
      .sort((a, b) => b.combos - a.combos)
  }, [hands, actions])

  if (spots.length === 0) {
    return (
      <div className="card p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[360px]">
        <h2 className="text-xl font-bold text-gray-100">{t('ranges.empty.title')}</h2>
        <p className="text-sm text-gray-400 max-w-md">{t('ranges.overview.empty')}</p>
      </div>
    )
  }

  // Columns of the same hero position sit under one heading.
  const positions = columns.reduce<{ hero: string; columns: typeof columns }[]>((groups, column) => {
    const last = groups[groups.length - 1]
    if (last && last.hero === column.spot.heroPosition) last.columns.push(column)
    else groups.push({ hero: column.spot.heroPosition, columns: [column] })
    return groups
  }, [])

  return (
    <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <section className="card p-5 flex flex-col gap-4 min-w-0 self-start">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-gray-100">{t('ranges.overview.title')}</h2>
          <div role="group" aria-label={t('ranges.tree.format')} className="segmented ml-auto">
            {FORMATS.map((value) => (
              <button key={value} aria-pressed={format === value} className={clsx('segmented-item', format === value && 'active')} onClick={() => setChosenFormat(value)}>
                {t(`ranges.format.${value}`)}
                <span className="ml-1.5 font-mono text-[11px] opacity-70">{counts[value]}</span>
              </button>
            ))}
          </div>
        </div>

        {columns.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">{t(`ranges.tree.emptyFormat.${format}`)}</p>
        ) : (
          <div className="flex gap-6 overflow-x-auto pb-1">
            {positions.map((group) => (
              <div key={`${group.hero}-${group.columns[0].spot.id}`} className="flex shrink-0 flex-col gap-2">
                <div className="border-b border-dark-200 pb-1.5 text-center text-xs font-semibold tracking-wide text-gray-100">{group.hero}</div>
                <div className="flex gap-2">
                  {group.columns.map(({ spot, depths }) => (
                    <div key={spot.id} className="flex min-w-[76px] flex-col items-center gap-1.5">
                      <div className={clsx('px-1 text-center text-xs font-medium leading-tight', picked?.spot.id === spot.id ? 'text-primary-400' : 'text-gray-400')} title={spot.name}>
                        {shortName(spot)}
                      </div>
                      {depths.map((depth) => (
                        <button
                          key={depth.id}
                          aria-pressed={depth.id === scenarioId}
                          aria-label={t('ranges.overview.open', { name: spot.name, depth: formatDepth(depth.stackBb) })}
                          onClick={() => setScenarioId(depth.id)}
                          className={clsx(
                            'w-full rounded-md px-2 py-1 font-mono text-xs transition-colors',
                            depth.id === scenarioId ? 'bg-primary-500 font-semibold text-onprimary' : 'bg-dark-300 text-gray-100 hover:bg-dark-200',
                          )}
                        >
                          {formatDepth(depth.stackBb)} bb
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5 flex flex-col gap-3 min-w-0">
        {picked ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-bold text-gray-100">
                {picked.spot.name} · {formatDepth(picked.scenario.stackBb)} bb
              </h2>
              <button className="btn-secondary ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-[13px]" onClick={() => onOpenEditor(picked.spot.id, picked.scenario.id)}>
                <Pencil className="w-3.5 h-3.5" />
                {t('ranges.overview.edit')}
              </button>
            </div>
            <span className="text-[13px] text-gray-400">
              {t(`ranges.format.${picked.spot.format}`)} · {picked.spot.line === '' ? t('ranges.wizard.firstToAct') : lineSummary(picked.spot.line)} · {t(`ranges.opponent.${picked.spot.opponent}Lower`)}
            </span>
            <div className={clsx('mx-auto w-full max-w-[540px]', hands === null && 'opacity-60')}>
              <RangeMatrix cells={cells} label={t('ranges.editor.gridLabel', { name: picked.spot.name, depth: formatDepth(picked.scenario.stackBb) })} />
            </div>
            <ul className="mx-auto grid w-full max-w-[540px] gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {legend.map(({ action, combos, percent }) => (
                <li key={action.id} className="flex items-center gap-2 text-[13px]">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ backgroundColor: action.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-gray-100">{action.label}</span>
                    <span className="block truncate text-[11.5px] text-gray-400">{actionSubtitle(action, t)}</span>
                  </span>
                  <span className="whitespace-nowrap font-mono text-xs text-gray-100">
                    {combos} · {formatNumber(percent, i18n.language)} %
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="py-16 text-center text-sm text-gray-400">{t('ranges.overview.pick')}</p>
        )}
      </section>
    </div>
  )
}
