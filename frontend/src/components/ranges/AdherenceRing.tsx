import clsx from 'clsx'

const SIZE = 72
const STROKE = 7
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const GOOD_THRESHOLD = 0.8
const GOOD_COLOR = '#34c27a'
const OTHER_COLOR = '#f5c06b'

interface AdherenceRingProps {
  /** Share (0 to 1) of decisions that followed the range; null when none was compared. */
  value: number | null
  label: string
}

/** Ring showing how closely a scenario is followed. Amber is used for anything below the "good" bar. */
export default function AdherenceRing({ value, label }: AdherenceRingProps) {
  const filled = value ?? 0
  const percent = value === null ? '–' : `${Math.round(value * 100)} %`
  const color = value !== null && value >= GOOD_THRESHOLD ? GOOD_COLOR : OTHER_COLOR
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`${label} ${percent}`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-dark-300" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - filled)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className={clsx('font-mono text-sm font-semibold', value === null ? 'text-gray-500' : 'text-gray-100')}>{percent}</span>
      <span className="text-[11px] uppercase tracking-[.06em] text-gray-500">{label}</span>
    </div>
  )
}
