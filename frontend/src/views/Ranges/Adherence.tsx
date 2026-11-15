import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import ActionChip from '@/components/ranges/ActionChip'
import DeviationBadge from '@/components/ranges/DeviationBadge'
import RangeMatrix from '@/components/ranges/RangeMatrix'
import { getDateRangeParams, useFilterStore } from '@/stores/filterStore'
import { useRangeAdherenceStore } from '@/stores/rangeAdherenceStore'
import { useTrainingStore } from '@/stores/trainingStore'
import { useReplayerStore } from '@/stores/replayerStore'
import { useUserRangesStore } from '@/stores/userRangesStore'
import {
  deviationCells,
  formatCards,
  formatEv,
  groupBySpot,
  isReliable,
  respectOf,
  respectTone,
  RESPECT_COLORS,
  groupByPosition,
  sortSpots,
  type OpponentFilter,
  type DeviationEntry,
  type HandStat,
  type SortKey,
  type TopDeviation,
} from '@/utils/rangeAdherence'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { actionSubtitle } from './components/SidePanel'
import { COLOR_SHADES, formatDepth, formatNumber, lineSummary, type Position, type RangeAction } from '@/utils/ranges'

/** Colour of a played action the player has no action for. */
const UNKNOWN_ACTION_COLOR = COLOR_SHADES[2]

function Tile({ label, value, hint, tone, onClick, active }: { label: string; value: ReactNode; hint: ReactNode; tone?: string; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <div className="text-[13px] text-gray-400">{label}</div>
      <div className="font-mono text-[28px] font-bold leading-tight text-gray-100 my-1" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="text-xs text-gray-500">{hint}</div>
    </>
  )
  const base = 'card p-[22px] text-left'
  return onClick ? (
    <button className={clsx(base, 'hover:border-dark-100', active && 'border-dark-100')} aria-expanded={active} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  )
}

/** The share of followed decisions as a thin bar and a figure. */
function RespectBar({ respect, label }: { respect: number | null; label: string }) {
  const color = respect === null ? undefined : RESPECT_COLORS[respectTone(respect)]
  return (
    <div className="flex items-center justify-end gap-2" role="img" aria-label={label}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-dark-300" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${Math.round((respect ?? 0) * 100)}%`, backgroundColor: color }} />
      </div>
      <span className="w-12 text-right font-mono text-gray-100">{respect === null ? '–' : `${Math.round(respect * 100)} %`}</span>
    </div>
  )
}

/** A full-size loader that hides what is under it: no stale hand or stat shows while a read is running. */
function BlockingLoader({ title, hint, compact = false }: { title: string; hint?: string; compact?: boolean }) {
  return (
    <div role="status" className={clsx('absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl border border-dark-200 bg-dark-600 p-6 text-center', compact && 'gap-2')}>
      <div className={clsx('spinner', compact ? '!w-8 !h-8' : '!w-14 !h-14 !border-4')} />
      <div className={clsx('font-semibold text-gray-100', compact ? 'text-sm' : 'text-base')}>{title}</div>
      {hint && <p className="max-w-md text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

export default function Adherence() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const heroName = useFilterStore((s) => s.heroName)
  const { opponent, setOpponent, summary, selectedScenarioId, detail, loading, detailLoading, failed, load, select } = useRangeAdherenceStore()
  const dateRange = useFilterStore((s) => s.dateRange)
  const customDateFrom = useFilterStore((s) => s.customDateFrom)
  const customDateTo = useFilterStore((s) => s.customDateTo)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const { actions, spots, settings, saveSettings } = useUserRangesStore()
  const openReplayer = useReplayerStore((s) => s.openSingleHandReplayer)
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'deviations', descending: true })
  const [showUncovered, setShowUncovered] = useState(false)
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(new Set())
  const [openSpots, setOpenSpots] = useState<ReadonlySet<number>>(new Set())

  const reload = () => void load(heroName, getDateRangeParams({ dateRange, customDateFrom, customDateTo, selectedSession }))

  // Reloaded when the global period, the hero or the depth rule changes (the ranges clear the stored checks).
  useEffect(() => {
    void load(heroName, getDateRangeParams({ dateRange, customDateFrom, customDateTo, selectedSession }))
  }, [load, heroName, dateRange, customDateFrom, customDateTo, selectedSession, settings.depthRule, opponent])

  const actionsById = useMemo(() => new Map(actions.map((a) => [a.id, a])), [actions])
  const groups = useMemo(() => {
    const spotReports = sortSpots(groupBySpot(summary?.scenarios ?? []), sort.key, sort.descending)
    return groupByPosition(spotReports)
  }, [summary, sort])
  const toggle = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
    const next = new Set(set)
    if (!next.delete(value)) next.add(value)
    return next
  }
  const num = (value: number, digits = 0) => formatNumber(value, i18n.language, digits)

  const chipOf = (id: number | null | undefined, immediate: string): { label: string; color: string } => {
    const action: RangeAction | undefined = id === null || id === undefined ? undefined : actionsById.get(id)
    return action ?? { label: t(`ranges.immediate.${immediate}`), color: UNKNOWN_ACTION_COLOR }
  }

  const topText = (top: TopDeviation | null) => {
    if (!top) return '–'
    const expected = actionsById.get(top.expectedActionId)?.label ?? '?'
    const played = chipOf(top.playedActionId, top.playedImmediate).label
    const suffix = top.kind === 'response' && top.playedResponse ? ` · ${t(`ranges.responses.${top.playedResponse}`)}` : ''
    return `${expected} → ${played}${suffix} (${top.count})`
  }

  /** The card shown over a hand of the grid: what the range plans and what was played. */
  const handTip = (hand: string, planned: RangeAction, stat: HandStat) => {
    const played = stat.played ?? []
    return (
      <div className="flex flex-col gap-2">
        <div className="font-mono text-[13px] font-bold">{hand}</div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500">{t('ranges.adherence.tip.planned')}</div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: planned.color }} />
            <span className="font-semibold">{planned.label}</span>
          </div>
          <div className="pl-[18px] text-[11px] text-gray-400">{actionSubtitle(planned, t)}</div>
        </div>
        {stat.matches === 0 && stat.deviations === 0 && <div className="text-gray-400">{t('ranges.adherence.tip.never')}</div>}
        {stat.matches > 0 && (
          <div className="flex items-center justify-between text-profit-positive">
            <span>{t('ranges.adherence.tip.followed')}</span>
            <span className="font-mono">× {num(stat.matches)}</span>
          </div>
        )}
        {played.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">{t('ranges.adherence.tip.played')}</div>
            <ul className="flex flex-col gap-0.5">
              {played.map((entry) => {
                const chip = chipOf(entry.playedActionId, entry.playedImmediate)
                const suffix = entry.kind === 'response' && entry.playedResponse ? ` · ${t(`ranges.responses.${entry.playedResponse}`)}` : ''
                return (
                  <li key={`${entry.playedImmediate}-${entry.playedResponse ?? ''}-${entry.kind ?? ''}`} className="flex items-center gap-1.5">
                    <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: chip.color }} />
                    <span className="min-w-0 flex-1 truncate text-deviation">
                      {chip.label}
                      {suffix}
                    </span>
                    <span className="font-mono">× {num(entry.count)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th scope="col" aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'} className={clsx('px-4 py-2.5 font-medium', align === 'right' ? 'text-right' : 'text-left')}>
      <button onClick={() => setSort((s) => ({ key, descending: s.key === key ? !s.descending : key !== 'name' }))} className="hover:text-gray-100">
        {label}
        {sort.key === key ? (sort.descending ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )

  const evCell = (value: number | null) => (
    <td className={clsx('px-4 py-2.5 text-right font-mono', value === null ? 'text-gray-500' : value >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>{formatEv(value, i18n.language)}</td>
  )

  const deviationCard = (entry: DeviationEntry) => {
    const expectedAction = entry.expectedActionId === null ? undefined : actionsById.get(entry.expectedActionId)
    const plannedResponse = expectedAction?.response && expectedAction.response !== 'none' ? expectedAction.response : null
    const response =
      entry.kind === 'response' && entry.playedResponse && plannedResponse
        ? `${t(`ranges.responses.${plannedResponse}`)} → ${t(`ranges.responses.${entry.playedResponse}`)}`
        : null
    return (
      <li key={entry.handId} className="rounded-lg border border-dark-200 bg-dark-600 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[15px] font-bold text-gray-100">{formatCards(entry.cards) || entry.handClass}</span>
          <span className="text-xs text-gray-500">{entry.playedAt ? new Date(entry.playedAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
          <button className="ml-auto text-xs text-info hover:underline" onClick={() => void openReplayer(entry.handId, heroName)}>
            {t('ranges.adherence.replay')}
          </button>
        </div>
        <div className="mt-2">
          <DeviationBadge expected={expectedAction ?? null} played={chipOf(entry.playedActionId, entry.playedImmediate)} response={response} />
        </div>
      </li>
    )
  }

  if (!heroName) return <p className="text-sm text-gray-400">{t('ranges.adherence.noHero')}</p>
  if (loading && summary === null) {
    return (
      <div className="relative min-h-[420px]">
        <BlockingLoader title={t('ranges.adherence.loading.title')} hint={t('ranges.adherence.loading.hint')} />
      </div>
    )
  }
  if (failed && summary === null) {
    return (
      <div role="alert" className="card p-10 flex flex-col items-center gap-3 text-center text-sm text-gray-400">
        {t('ranges.adherence.failed')}
        <button className="btn-secondary" onClick={reload}>
          {t('ranges.adherence.retry')}
        </button>
      </div>
    )
  }
  if (summary && summary.compared + summary.noRange === 0 && !loading) {
    return (
      <div className="card p-10 flex flex-col items-center gap-3 text-center text-sm text-gray-400">
        {t(spots.length > 0 ? 'ranges.adherence.noHands' : 'ranges.adherence.noRanges')}
      </div>
    )
  }

  return (
    <div className="relative min-h-[420px]" aria-busy={loading}>
      {loading && <BlockingLoader title={t('ranges.adherence.loading.title')} hint={t('ranges.adherence.loading.hint')} />}
      <div className={clsx('flex flex-col gap-[18px]', loading && 'invisible')} aria-hidden={loading}>
      {failed && (
        <div role="alert" className="flex items-center gap-3 text-xs text-deviation">
          {t('ranges.adherence.failed')}
          <button className="underline" onClick={reload}>
            {t('ranges.adherence.retry')}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {summary && (
          <div role="group" aria-label={t('ranges.adherence.report.opponentLabel')} className="segmented">
            {(['all', 'any', 'reg'] as OpponentFilter[]).map((value) => {
              const tally =
                value === 'all'
                  ? { compared: summary.byOpponent.any.compared + summary.byOpponent.reg.compared, matches: summary.byOpponent.any.matches + summary.byOpponent.reg.matches }
                  : summary.byOpponent[value]
              const share = respectOf(tally)
              return (
                <button key={value} aria-pressed={opponent === value} className={clsx('segmented-item', opponent === value && 'active')} onClick={() => setOpponent(value)}>
                  {t(`ranges.adherence.report.opponents.${value}`)}
                  <span className="ml-1.5 font-mono text-[11px] opacity-70">
                    {num(tally.compared)} · {share === null ? '–' : `${num(share * 100)} %`}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-gray-400">{t('ranges.adherence.betweenDepths')}</span>
          <div className="segmented">
            {(['nearest', 'below'] as const).map((rule) => (
              <button key={rule} aria-pressed={settings.depthRule === rule} className={clsx('segmented-item', settings.depthRule === rule && 'active')} onClick={() => void saveSettings({ depthRule: rule })}>
                {t(`ranges.settings.rules.${rule}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="ml-auto text-[13px] text-gray-400">{t('ranges.adherence.note')}</p>
      </div>

      {summary && (
        <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label={t('ranges.adherence.report.respect')}
            value={summary.respect === null ? '–' : `${num(summary.respect * 100, 1)} %`}
            tone={summary.respect === null ? undefined : RESPECT_COLORS[respectTone(summary.respect)]}
            hint={isReliable(summary.compared) ? t('ranges.adherence.report.respectHint') : <span className="text-deviation">{t('ranges.adherence.report.lowSample')}</span>}
          />
          <Tile label={t('ranges.adherence.report.compared')} value={num(summary.compared)} hint={t('ranges.adherence.report.comparedHint')} />
          <Tile label={t('ranges.adherence.report.deviations')} value={num(summary.deviations)} hint={t('ranges.adherence.report.deviationsHint', { count: summary.responseDeviations })} />
          <Tile
            label={t('ranges.adherence.report.noRange')}
            value={summary.noRangeShare === null ? '–' : `${num(summary.noRangeShare * 100)} %`}
            hint={t('ranges.adherence.report.noRangeHint', { count: summary.noRange })}
            active={showUncovered}
            onClick={() => setShowUncovered((v) => !v)}
          />
        </div>
      )}

      {showUncovered && summary && (
        <div className="card p-4">
          {summary.frequentLines.length === 0 ? (
            <p className="text-sm text-gray-400">{t('ranges.adherence.noUncovered')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.frequentLines.map((line) => (
                <li key={`${line.format}-${line.heroPosition}-${line.line}`} className="flex items-center gap-3 text-sm text-gray-100">
                  <span className="font-semibold">{line.heroPosition} · {t(`ranges.format.${line.format}Short`)}</span>
                  <span className="font-mono text-[13px] text-gray-400">{line.line === '' ? t('ranges.wizard.firstToAct') : lineSummary(line.line)}</span>
                  <span className="font-mono text-xs text-gray-500">{line.count}</span>
                  <button
                    className="ml-auto text-xs text-info hover:underline"
                    onClick={() => navigate('/ranges?tab=editor', { state: { prefill: { format: line.format, hero: line.heroPosition as Position, line: line.line } } })}
                  >
                    {t('ranges.adherence.createScenario')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-[15px] font-semibold text-gray-100">{t('ranges.adherence.report.tableTitle')}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-xs text-gray-400">
              <tr>
                {header('name', t('ranges.adherence.columns.scenario'), 'left')}
                {header('decisions', t('ranges.adherence.columns.decisions'))}
                {header('respect', t('ranges.adherence.columns.respect'))}
                {header('deviations', t('ranges.adherence.report.deviations'))}
                <th scope="col" className="px-4 py-2.5 font-medium text-left">{t('ranges.adherence.columns.topDeviation')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">{t('ranges.adherence.columns.evMatch')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">{t('ranges.adherence.columns.evDeviation')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const groupOpen = !closedGroups.has(group.key)
                const uncovered = summary?.byPosition.find((p) => `${p.format}-${p.heroPosition}` === group.key)?.noRange ?? 0
                return [
                  <tr key={group.key} className="border-t border-dark-200 bg-dark-300/40">
                    <td className="px-4 py-2" colSpan={2}>
                      <button className="flex items-center gap-1.5 font-semibold text-gray-100" aria-expanded={groupOpen} onClick={() => setClosedGroups((c) => toggle(c, group.key))}>
                        {groupOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                        {t(`ranges.adherence.report.seat.${group.heroPosition}`)} · {t(`ranges.format.${group.format === 'hu' ? 'hu' : '3max'}Short`)}
                        <span className="font-mono text-xs font-normal text-gray-500">{num(group.decisions)}</span>
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <RespectBar respect={group.respect} label={t('ranges.adherence.report.groupLabel', { position: group.heroPosition, value: group.respect === null ? 0 : Math.round(group.respect * 100) })} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-deviation">{num(group.decisions - group.matches)}</td>
                    <td className="px-4 py-2 text-xs text-gray-500" colSpan={3}>
                      {uncovered > 0 ? t('ranges.adherence.report.uncoveredInGroup', { count: uncovered }) : ''}
                    </td>
                  </tr>,
                  ...(groupOpen
                    ? group.spots.flatMap((spot) => {
                        const holdsSelection = spot.depths.some((d) => d.scenarioId === selectedScenarioId)
                        const spotOpen = openSpots.has(spot.spotId) !== holdsSelection
                        return [
                          <tr key={`spot-${spot.spotId}`} className="cursor-pointer border-t border-dark-200 hover:bg-dark-300" onClick={() => setOpenSpots((o) => toggle(o, spot.spotId))}>
                            <td className="px-4 py-2.5 pl-9">
                              <div className="flex items-center gap-1.5 font-semibold text-gray-100">
                                {spotOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                                {spot.name}
                              </div>
                              <div className="pl-5 text-xs text-gray-500">{spot.line === '' ? t('ranges.wizard.firstToAct') : lineSummary(spot.line)}</div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-gray-100">{num(spot.decisions)}</td>
                            <td className="px-4 py-2.5">
                              <RespectBar respect={spot.respect} label={t('ranges.adherence.report.groupLabel', { position: spot.name, value: spot.respect === null ? 0 : Math.round(spot.respect * 100) })} />
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-deviation">{num(spot.deviations)}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-500" colSpan={3}>
                              {spot.depths.map((d) => formatDepth(d.stackBb)).join(' · ')} bb
                            </td>
                          </tr>,
                          ...(spotOpen
                            ? spot.depths.map((row) => {
                                const selected = row.scenarioId === selectedScenarioId
                                return (
                                  <tr
                                    key={row.scenarioId}
                                    tabIndex={0}
                                    aria-selected={selected}
                                    onClick={() => void select(row.scenarioId, heroName)}
                                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && void select(row.scenarioId, heroName)}
                                    className={clsx('cursor-pointer border-t border-dark-200/60 hover:bg-dark-300', selected && 'bg-primary-500/[0.08] shadow-[inset_3px_0_0_0] shadow-primary-500')}
                                  >
                                    <td className="px-4 py-2 pl-16 font-mono text-gray-100">{formatDepth(row.stackBb)} bb</td>
                                    <td className="px-4 py-2 text-right font-mono text-gray-100">{num(row.decisions)}</td>
                                    <td className="px-4 py-2">
                                      <RespectBar respect={row.respect} label={t('ranges.adherence.report.groupLabel', { position: `${formatDepth(row.stackBb)} bb`, value: Math.round(row.respect * 100) })} />
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono text-deviation">{num(row.decisions - row.matches)}</td>
                                    <td className="px-4 py-2 text-deviation">{topText(row.topDeviation)}</td>
                                    {evCell(row.evMatch)}
                                    {evCell(row.evDeviation)}
                                  </tr>
                                )
                              })
                            : []),
                        ]
                      })
                    : []),
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(detail !== null || detailLoading) && (
        <div className="relative min-h-[260px]" aria-busy={detailLoading}>
          {detailLoading && <BlockingLoader compact title={t('ranges.adherence.loading.detail')} />}
          {detail && (
            <div className={clsx('grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]', detailLoading && 'invisible')}>
              <section className="card p-5 flex flex-col gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-100">{detail.name} · {formatDepth(detail.stackBb)} bb</h3>
                  {detail.observedMinBb !== null && detail.observedMaxBb !== null && (
                    <p className="text-xs text-gray-500">{t('ranges.adherence.playedBetween', { min: num(detail.observedMinBb, 1), max: num(detail.observedMaxBb, 1) })}</p>
                  )}
                </div>
                <RangeMatrix cells={deviationCells(detail, actions, handTip)} label={t('ranges.adherence.gridLabel', { name: detail.name })} />
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  {actions
                    .filter((a) => Object.values(detail.hands).includes(a.id))
                    .map((a) => (
                      <ActionChip key={a.id} action={a} />
                    ))}
                  <span className="rounded-md border-2 border-deviation px-2 py-0.5 font-semibold text-deviation">{t('ranges.adherence.legendDeviation')}</span>
                </div>
              </section>

              <section className="card p-5 flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[15px] font-semibold text-gray-100">{t('ranges.adherence.latest')}</h3>
                  <span className="text-xs text-gray-400">{t('ranges.adherence.latestCount', { count: detail.deviationTotal })}</span>
                </div>
                {detail.deviations.length === 0 ? <p className="text-sm text-gray-400">{t('ranges.adherence.noDeviation')}</p> : <ul className="flex flex-col gap-2">{detail.deviations.map(deviationCard)}</ul>}
                {detail.deviationTotal > 0 && (
                  <button
                    className="btn-primary w-full"
                    onClick={() => {
                      useTrainingStore.getState().setSource('deviation', { scenarioId: detail.scenarioId })
                      navigate('/ranges?tab=training')
                    }}
                  >
                    {t('ranges.adherence.train', { count: detail.deviationTotal })}
                  </button>
                )}
              </section>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
