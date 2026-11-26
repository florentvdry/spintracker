import { respectTone, RESPECT_COLORS } from '@/utils/rangeAdherence'

const SIZE = 84
const STROKE = 9
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const PERCENT = 100

interface AdherenceRingProps {
  /** Share of followed decisions, 0..1, `null` when nothing was compared. */
  respect: number | null
  label: string
}

/** A ring filled to the share of decisions that followed the range, with the figure in its middle. */
export default function AdherenceRing({ respect, label }: AdherenceRingProps) {
  const color = respect === null ? undefined : RESPECT_COLORS[respectTone(respect)]
  const filled = (respect ?? 0) * CIRCUMFERENCE
  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }} role="img" aria-label={label}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-dark-300" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          style={{ stroke: color }}
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-lg font-bold text-gray-100" style={color ? { color } : undefined}>
        {respect === null ? '–' : `${Math.round(respect * PERCENT)}%`}
      </div>
    </div>
  )
}
