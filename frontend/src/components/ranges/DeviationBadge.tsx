import { useTranslation } from 'react-i18next'
import ActionChip from './ActionChip'

interface DeviationBadgeProps {
  /** The action in the player's range. */
  expected: { label: string; color: string } | null
  /** What was played, in the player's own actions when one fits. */
  played: { label: string; color: string } | null
  /** The planned answer to a raise and the one given, when that is what differed. */
  response?: string | null
}

/** "Your range: [action] · played: [action]": a deviation from the plan, never an error. */
export default function DeviationBadge({ expected, played, response }: DeviationBadgeProps) {
  const { t } = useTranslation()
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
      {t('ranges.deviation.yourRange')}
      {expected && <ActionChip action={expected} />}
      <span aria-hidden="true">·</span>
      {t('ranges.deviation.played')}
      {played && <ActionChip action={played} outline />}
      {response && <span className="text-deviation">{t('ranges.deviation.response', { response })}</span>}
    </span>
  )
}
