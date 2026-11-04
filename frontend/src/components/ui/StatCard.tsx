import type { ComponentType } from 'react'
import clsx from 'clsx'

export type StatFormat = 'profit' | 'percent' | 'number'

interface SubStat {
  label: string
  value: number | string | null | undefined
  format?: StatFormat
}

interface StatCardProps {
  label: string
  value?: number | string | null
  format?: StatFormat
  icon?: ComponentType<{ className?: string }>
  subStats?: SubStat[]
}

function formatValue(value: number | string | null | undefined, format?: StatFormat): string {
  if (value === null || value === undefined) return '—'
  if (format === 'profit') {
    const n = Number(value)
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}€`
  }
  if (format === 'percent') return `${Number(value).toFixed(1)}%`
  if (format === 'number') return Number(value).toLocaleString()
  return String(value)
}

export default function StatCard({ label, value, format, icon: Icon, subStats }: StatCardProps) {
  const valueClass =
    format === 'profit' ? clsx(Number(value) > 0 && 'profit-positive', Number(value) < 0 && 'profit-negative') : ''

  return (
    <div className="bg-dark-400 px-4 py-3 flex flex-col gap-0.5 min-w-0">
      <p className="stat-label flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-500" />}
        {label}
      </p>
      <p className={clsx('stat-value', valueClass)}>{formatValue(value, format)}</p>
      {subStats && (
        <div className="mt-1 space-y-0.5">
          {subStats.map((stat) => (
            <div key={stat.label} className="flex justify-between text-xs">
              <span className="text-gray-500">{stat.label}</span>
              <span className="text-gray-200 font-mono">{formatValue(stat.value, stat.format)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
