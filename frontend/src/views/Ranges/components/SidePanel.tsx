import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useUserRangesStore } from '@/stores/userRangesStore'
import { RANGES_ANCHOR } from '@/views/Settings/anchors'
import { actionStats, formatDepth, formatNumber, formatSize, lineSummary, TOTAL_COMBOS, type HandMap, type RangeAction, type SpotSummary } from '@/utils/ranges'

export function actionSubtitle(action: RangeAction, t: (key: string, options?: Record<string, unknown>) => string): string {
  const size = formatSize(action.sizeValue, action.sizeUnit)
  const base = `${t(`ranges.immediate.${action.immediate}`)}${size ? ` ${size}` : ''}`
  return action.response === 'none' ? base : `${base} · ${t(`ranges.responsesIf.${action.response}`)}`
}

interface ActionsCardProps {
  hands: HandMap
  activeActionId: number | null
  onActivate: (id: number) => void
  onNewAction: () => void
}

/** "Tes actions": combos and share of each action in the range being edited. */
export function ActionsCard({ hands, activeActionId, onActivate, onNewAction }: ActionsCardProps) {
  const { t, i18n } = useTranslation()
  const actions = useUserRangesStore((s) => s.actions)
  const stats = actionStats(hands)
  const used = actions.filter((a) => (stats.get(a.id)?.combos ?? 0) > 0)
  const unused = actions.filter((a) => !used.includes(a))

  const row = (action: RangeAction, dim: boolean) => {
    const stat = stats.get(action.id)
    const active = action.id === activeActionId
    return (
      <button
        key={action.id}
        aria-pressed={active}
        onClick={() => onActivate(action.id)}
        className={clsx('flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left', dim && !active && 'opacity-60', !active && 'border-transparent hover:bg-dark-300')}
        style={active ? { borderColor: action.color, backgroundColor: `${action.color}26` } : undefined}
      >
        <span className="w-4 h-4 rounded-[4px] shrink-0" style={{ backgroundColor: action.color }} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-gray-100 truncate">{action.label}</span>
          <span className="block text-[11.5px] text-gray-400 truncate">{actionSubtitle(action, t)}</span>
        </span>
        <span className="font-mono text-xs text-gray-100 text-right whitespace-nowrap">
          {stat?.combos ?? 0} · {formatNumber(stat?.percent ?? 0, i18n.language)} %
        </span>
      </button>
    )
  }

  return (
    <div className="card p-4 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-[15px] font-semibold text-gray-100">{t('ranges.actionsCard.title')}</h3>
        <span className="text-xs text-gray-400">{t('ranges.actionsCard.combos', { total: TOTAL_COMBOS.toLocaleString(i18n.language) })}</span>
      </div>
      {used.map((a) => row(a, false))}
      {unused.map((a) => row(a, true))}
      <div className="flex items-center justify-between gap-2 mt-2">
        <Link to="/settings" state={{ focus: RANGES_ANCHOR }} className="text-xs text-info hover:underline">
          {t('ranges.actionsCard.manage')}
        </Link>
        <button className="flex items-center gap-1 rounded-lg border border-dashed border-dark-100 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-100" onClick={onNewAction}>
          <Plus className="w-3.5 h-3.5" />
          {t('ranges.actionsCard.newAction')}
        </button>
      </div>
    </div>
  )
}

interface ScenarioCardProps {
  spot: SpotSummary
  scenarioId: number | null
  onEdit: () => void
  onAddDepth: () => void
  onRemoveDepth: () => void
  onSelectDepth: (scenarioId: number) => void
}

/** "Scénario": the definition of the selected scenario. */
export function ScenarioCard({ spot, scenarioId, onEdit, onAddDepth, onRemoveDepth, onSelectDepth }: ScenarioCardProps) {
  const { t } = useTranslation()
  const entries: [string, ReactNode][] = [
    [t('ranges.scenarioCard.format'), t(`ranges.format.${spot.format}`)],
    [t('ranges.scenarioCard.position'), spot.heroPosition],
    [t('ranges.scenarioCard.inFront'), spot.line === '' ? t('ranges.wizard.firstToAct') : <span className="font-mono">{lineSummary(spot.line)}</span>],
    [
      t('ranges.scenarioCard.opponent'),
      <>
        {t(`ranges.opponent.${spot.opponent}`)}
        {spot.opponent === 'reg' && <span className="block text-xs text-gray-500">{t('ranges.scenarioCard.regFallback')}</span>}
      </>,
    ],
    [
      t('ranges.scenarioCard.depths'),
      <span className="flex flex-wrap items-center gap-1">
        {spot.scenarios.map((s) => (
          <button
            key={s.id}
            aria-pressed={s.id === scenarioId}
            onClick={() => onSelectDepth(s.id)}
            className={clsx('rounded-md px-1.5 py-0.5 font-mono text-[11px]', s.id === scenarioId ? 'bg-primary-500 text-onprimary' : 'bg-dark-300 text-gray-400')}
          >
            {formatDepth(s.stackBb)}
          </button>
        ))}
        <button className="rounded-md bg-dark-300 px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-gray-100" aria-label={t('ranges.scenarioCard.addDepth')} onClick={onAddDepth}>
          +
        </button>
      </span>,
    ],
    [t('ranges.scenarioCard.quiz'), spot.studyOnly ? <span className="text-deviation">{t('ranges.tree.studyOnly')}</span> : t('ranges.scenarioCard.included')],
  ]
  return (
    <div className="card p-4">
      <h3 className="text-[15px] font-semibold text-gray-100 mb-3">{t('ranges.scenarioCard.title')}</h3>
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[13px]">
        {entries.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-gray-400">{term}</dt>
            <dd className="text-gray-100">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2 mt-3">
        <button className="btn-secondary w-full" onClick={onEdit}>
          {t('ranges.scenarioCard.modify')}
        </button>
      </div>
      {spot.scenarios.length > 1 && (
        <button className="mt-2 text-xs text-gray-400 hover:text-profit-negative" onClick={onRemoveDepth}>
          {t('ranges.scenarioCard.removeDepth')}
        </button>
      )}
    </div>
  )
}
