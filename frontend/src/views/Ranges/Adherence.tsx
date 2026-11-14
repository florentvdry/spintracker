import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import ActionChip from '@/components/ranges/ActionChip'
import DeviationBadge from '@/components/ranges/DeviationBadge'
import RangeMatrix from '@/components/ranges/RangeMatrix'
import { useFilterStore } from '@/stores/filterStore'
import { useRangeAdherenceStore } from '@/stores/rangeAdherenceStore'
import { useTrainingStore } from '@/stores/trainingStore'
import { useReplayerStore } from '@/stores/replayerStore'
import { useUserRangesStore } from '@/stores/userRangesStore'
import {
  deviationCells,
  formatCards,
  formatEv,
  sortScenarios,
  type AdherencePeriod,
  type DeviationEntry,
  type ScenarioRow,
  type SortKey,
  type TopDeviation,
} from '@/utils/rangeAdherence'
import { COLOR_SHADES, formatDepth, formatNumber, lineSummary, type Position, type RangeAction } from '@/utils/ranges'

const PERIODS: AdherencePeriod[] = ['7', '30', 'all']
/** Colour of a played action the player has no action for. */
const UNKNOWN_ACTION_COLOR = COLOR_SHADES[2]

function Tile({ label, value, hint, onClick, active }: { label: string; value: ReactNode; hint: string; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <div className="text-[13px] text-gray-400">{label}</div>
      <div className="font-mono text-[28px] font-bold leading-tight text-gray-100 my-1">{value}</div>
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

export default function Adherence() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const heroName = useFilterStore((s) => s.heroName)
  const { period, summary, selectedScenarioId, detail, loading, load, setPeriod, select } = useRangeAdherenceStore()
  const { actions, spots, settings, saveSettings } = useUserRangesStore()
  const openReplayer = useReplayerStore((s) => s.openSingleHandReplayer)
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'decisions', descending: true })
  const [showUncovered, setShowUncovered] = useState(false)

  // Reloaded when the period, the hero or the depth rule changes (the ranges clear the stored checks).
  useEffect(() => {
    void load(heroName)
  }, [load, heroName, period, settings.depthRule])

  const actionsById = useMemo(() => new Map(actions.map((a) => [a.id, a])), [actions])
  const rows = useMemo(() => sortScenarios(summary?.scenarios ?? [], sort.key, sort.descending), [summary, sort])
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

  const context = (row: ScenarioRow) => `${row.heroPosition} · ${row.line === '' ? t('ranges.wizard.firstToAct') : lineSummary(row.line)}`

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
  if (summary && summary.compared + summary.noRange === 0 && !loading) {
    return <div className="card p-10 text-center text-sm text-gray-400">{t(spots.length > 0 ? 'ranges.adherence.noHands' : 'ranges.adherence.noRanges')}</div>
  }

  return (
    <div className={clsx('flex flex-col gap-[18px]', loading && 'opacity-70 transition-opacity')} aria-busy={loading}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="segmented">
          {PERIODS.map((value) => (
            <button key={value} aria-pressed={period === value} className={clsx('segmented-item', period === value && 'active')} onClick={() => setPeriod(value)}>
              {t(`ranges.adherence.periods.${value}`)}
            </button>
          ))}
        </div>
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

      <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={t('ranges.adherence.tiles.respect')} value={summary?.respect == null ? '–' : `${num(summary.respect * 100)} %`} hint={t('ranges.adherence.tiles.respectHint')} />
        <Tile label={t('ranges.adherence.tiles.compared')} value={num(summary?.compared ?? 0)} hint={t('ranges.adherence.tiles.comparedHint')} />
        <Tile label={t('ranges.adherence.tiles.deviations')} value={num(summary?.deviations ?? 0)} hint={t('ranges.adherence.tiles.deviationsHint', { count: summary?.responseDeviations ?? 0 })} />
        <Tile
          label={t('ranges.adherence.tiles.noRange')}
          value={summary?.noRangeShare == null ? '–' : `${num(summary.noRangeShare * 100)} %`}
          hint={t('ranges.adherence.tiles.noRangeHint', { count: summary?.frequentLines.length ?? 0 })}
          active={showUncovered}
          onClick={() => setShowUncovered((v) => !v)}
        />
      </div>

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
        <div className="px-5 py-3 text-[15px] font-semibold text-gray-100">{t('ranges.adherence.byScenario')}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-xs text-gray-400">
              <tr>
                {header('name', t('ranges.adherence.columns.scenario'), 'left')}
                {header('decisions', t('ranges.adherence.columns.decisions'))}
                {header('respect', t('ranges.adherence.columns.respect'))}
                <th scope="col" className="px-4 py-2.5 font-medium text-left">{t('ranges.adherence.columns.topDeviation')}</th>
                {header('evMatch', t('ranges.adherence.columns.evMatch'))}
                {header('evDeviation', t('ranges.adherence.columns.evDeviation'))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = row.scenarioId === selectedScenarioId
                return (
                  <tr
                    key={row.scenarioId}
                    tabIndex={0}
                    aria-selected={selected}
                    onClick={() => void select(row.scenarioId, heroName)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && void select(row.scenarioId, heroName)}
                    className={clsx('cursor-pointer border-t border-dark-200 hover:bg-dark-300', selected && 'bg-primary-500/[0.08] shadow-[inset_3px_0_0_0] shadow-primary-500')}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-gray-100">{row.name} · {formatDepth(row.stackBb)} bb</div>
                      <div className="text-xs text-gray-500">{context(row)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-100">{num(row.decisions)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-100">{num(row.respect * 100)} %</td>
                    <td className="px-4 py-2.5 text-deviation">{topText(row.topDeviation)}</td>
                    {evCell(row.evMatch)}
                    {evCell(row.evDeviation)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="card p-5 flex flex-col gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-gray-100">{detail.name} · {formatDepth(detail.stackBb)} bb</h3>
              {detail.observedMinBb !== null && detail.observedMaxBb !== null && (
                <p className="text-xs text-gray-500">{t('ranges.adherence.playedBetween', { min: num(detail.observedMinBb, 1), max: num(detail.observedMaxBb, 1) })}</p>
              )}
            </div>
            <RangeMatrix cells={deviationCells(detail, actions)} label={t('ranges.adherence.gridLabel', { name: detail.name })} />
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
              <span className="text-xs text-gray-400">{t('ranges.adherence.latestCount', { count: detail.deviationTotal, period: t(`ranges.adherence.periods.${period}`) })}</span>
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
  )
}
