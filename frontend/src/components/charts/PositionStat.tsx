import clsx from 'clsx'

interface PositionStatProps {
  label: string
  value: string | number
  isSelected?: boolean
}

export default function PositionStat({ label, value, isSelected }: PositionStatProps) {
  const numeric = parseFloat(String(value))
  return (
    <div className="flex justify-between items-center text-xs">
      <span className={isSelected ? 'text-primary-400 font-medium' : 'text-gray-500'}>{label}</span>
      <span className={clsx('font-mono font-medium', numeric >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
        {numeric > 0 ? '+' : ''}
        {value}
      </span>
    </div>
  )
}
