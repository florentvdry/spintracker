import { useMemo } from 'react'
import clsx from 'clsx'
import type { Json } from '@/services/ipcService'

const CARDS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const EMPTY_CELL_COLOR = '#1e293b'
const DOMINANT_ACTION_SHARE = 0.95

const ACTION_COLORS: Record<string, string> = {
  AllIn: '#b71c1c',
  Raise: '#f44336',
  Raise2_3BB: '#e5594f',
  Raise4BB: '#f97316',
  Bet: '#ff9800',
  Call: '#4caf50',
  Check: '#9e9e9e',
  Fold: '#2196f3',
  None: '#6366f1',
}
const ACTION_ORDER = ['AllIn', 'Raise4BB', 'Raise2_3BB', 'Raise', 'Bet', 'Call', 'Check', 'Fold', 'None']

const CELL_SIZES = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-12 h-12 text-sm',
}

export interface CellStats {
  TotalCount: number
  TotalProfit: number
  TotalEv: number
  Actions: Record<string, number>
  Hands: Json[]
}

interface RangeGridProps {
  data?: Record<string, Json>
  onCellClick?: (hand: string, stats: CellStats) => void
  selectedHand?: string | null
  size?: keyof typeof CELL_SIZES
  className?: string
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function handName(row: number, col: number): string {
  if (row === col) return `${CARDS[row]}${CARDS[col]}`
  return row < col ? `${CARDS[row]}${CARDS[col]}s` : `${CARDS[col]}${CARDS[row]}o`
}

function cellStats(raw: Json = {}): CellStats {
  return {
    TotalCount: raw.totalCount ?? raw.TotalCount ?? 0,
    TotalProfit: raw.totalProfit ?? raw.TotalProfit ?? 0,
    TotalEv: raw.totalEv ?? raw.TotalEv ?? 0,
    Actions: raw.actions ?? raw.Actions ?? {},
    Hands: raw.hands ?? raw.Hands ?? [],
  }
}

function backgroundStyle(stats: CellStats, maxTotal: number): React.CSSProperties {
  const total = stats.TotalCount
  if (total === 0) return { backgroundColor: EMPTY_CELL_COLOR }

  // More frequent hands are drawn more opaque.
  const opacity = 0.3 + 0.7 * (total / maxTotal)
  const colorOf = (action: string) => hexToRgba(ACTION_COLORS[action] ?? ACTION_COLORS.None, opacity)

  const dominant = ACTION_ORDER.find((action) => (stats.Actions[action] || 0) / total > DOMINANT_ACTION_SHARE)
  if (dominant) return { backgroundColor: colorOf(dominant) }

  let cursor = 0
  const stops: string[] = []
  for (const action of ACTION_ORDER) {
    const count = stats.Actions[action] || 0
    if (count > 0) {
      const share = (count / total) * 100
      stops.push(`${colorOf(action)} ${cursor}% ${cursor + share}%`)
      cursor += share
    }
  }
  return stops.length ? { background: `linear-gradient(to top, ${stops.join(', ')})` } : { backgroundColor: EMPTY_CELL_COLOR }
}

export default function RangeGrid({ data = {}, onCellClick, selectedHand, size = 'md', className }: RangeGridProps) {
  const maxTotal = useMemo(
    () => Math.max(...Object.values(data).map((d) => d.totalCount || d.TotalCount || 0), 1),
    [data],
  )

  return (
    <div className={clsx('inline-block p-1 bg-dark-200 rounded-lg shadow-lg', className)}>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(13, 1fr)' }}>
        {CARDS.map((_, row) =>
          CARDS.map((__, col) => {
            const hand = handName(row, col)
            const stats = cellStats(data[hand])
            return (
              <div
                key={`${row}-${col}`}
                onClick={() => onCellClick?.(hand, stats)}
                style={backgroundStyle(stats, maxTotal)}
                className={clsx(
                  CELL_SIZES[size],
                  'flex flex-col items-center justify-center rounded cursor-pointer relative leading-none transition-all duration-150',
                  selectedHand === hand ? 'ring-2 ring-white z-10' : 'hover:ring-1 hover:ring-gray-300 hover:z-10',
                  stats.TotalCount === 0 && 'opacity-40',
                )}
                title={`${hand}: ${stats.TotalCount} hands`}
              >
                <span className={clsx('font-medium drop-shadow-md', stats.TotalCount > 0 ? 'text-white' : 'text-gray-500')}>
                  {hand.replace('s', '').replace('o', '')}
                </span>
                {stats.TotalCount > 0 && size !== 'sm' && (
                  <span className="text-[10px] text-white/90 font-bold drop-shadow-md mt-0.5 scale-90">{stats.TotalCount}</span>
                )}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}
