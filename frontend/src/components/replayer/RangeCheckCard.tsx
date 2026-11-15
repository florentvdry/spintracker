import { useTranslation } from 'react-i18next'
import DeviationBadge from '@/components/ranges/DeviationBadge'
import { COLOR_SHADES, formatDepth, formatNumber } from '@/utils/ranges'

/** What the backend returns for a hand compared with the player's ranges. */
export interface RangeCheck {
  status: 'match' | 'deviation' | 'no_range'
  scenarioName: string | null
  expectedAction: { id: number; label: string; color: string } | null
  playedAction: { id: number; label: string; color: string } | null
  playedImmediate: string
  playedResponse: string | null
  deviationKind: 'immediate' | 'size' | 'response' | null
  depthUsedBb: number | null
  stackBb: number
}

/** Colour of a played action the player has no action for. */
const UNKNOWN_ACTION_COLOR = COLOR_SHADES[2]

/** The replayer's card telling whether the hero followed their own range on this hand. */
export default function RangeCheckCard({ check }: { check: RangeCheck }) {
  const { t, i18n } = useTranslation()

  if (check.status === 'no_range') {
    return <p className="rounded-lg border border-dark-200 px-3 py-2 text-xs text-gray-400">{t('ranges.replayer.noRange')}</p>
  }
  if (check.status === 'match') {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dark-200 px-3 py-2 text-xs text-gray-400">
        <span className="rounded-full bg-primary-500/15 px-2.5 py-1 font-medium text-primary-400">{t('ranges.replayer.match')}</span>
        {check.scenarioName}
      </p>
    )
  }
  const played = check.playedAction ?? { label: t(`ranges.immediate.${check.playedImmediate}`), color: UNKNOWN_ACTION_COLOR }
  return (
    <div className="rounded-lg border border-deviation px-3 py-2.5 flex flex-col gap-2">
      <span className="self-start rounded-full bg-deviation/15 px-2.5 py-1 text-xs font-medium text-deviation">{t('ranges.replayer.deviation')}</span>
      <DeviationBadge expected={check.expectedAction} played={played} response={check.deviationKind === 'response' && check.playedResponse ? t(`ranges.responses.${check.playedResponse}`) : null} />
      {check.depthUsedBb !== null && (
        <p className="text-xs text-gray-400">
          {t('ranges.replayer.scenario', { name: check.scenarioName, depth: formatDepth(check.depthUsedBb), stack: formatNumber(check.stackBb, i18n.language, 1) })}
        </p>
      )}
    </div>
  )
}
