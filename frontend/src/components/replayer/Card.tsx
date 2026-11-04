import clsx from 'clsx'

type CardSize = 'sm' | 'md' | 'lg' | 'seat' | 'board' | 'adaptive' | 'adaptive-sm'

const SIZE_CLASSES: Record<CardSize, string> = {
  sm: 'w-8 h-11 text-[13px] rounded-sm',
  md: 'w-10 h-14 text-lg rounded-md',
  lg: 'w-14 h-20 text-2xl rounded-lg',
  seat: 'w-[clamp(28px,4.6cqw,44px)] h-[clamp(40px,6.5cqw,62px)] text-[clamp(12px,2cqw,18px)] rounded-[clamp(4px,0.7cqw,7px)]',
  board: 'w-[clamp(36px,6.4cqw,66px)] h-[clamp(50px,8.8cqw,92px)] text-[clamp(16px,2.9cqw,28px)] rounded-[clamp(5px,0.8cqw,9px)]',
  adaptive: 'w-[clamp(36px,6.4cqw,66px)] h-[clamp(50px,8.8cqw,92px)] text-[clamp(16px,2.9cqw,28px)] rounded-[clamp(5px,0.8cqw,9px)]',
  'adaptive-sm': 'w-[clamp(28px,4.6cqw,44px)] h-[clamp(40px,6.5cqw,62px)] text-[clamp(12px,2cqw,18px)] rounded-[clamp(4px,0.7cqw,7px)]',
}

const SUIT_CLASS: Record<string, string> = { h: 'heart', d: 'diamond', s: 'spade', c: 'club' }

interface CardProps {
  card?: string
  hidden?: boolean
  size?: CardSize
  className?: string
  style?: React.CSSProperties
}

export default function Card({ card, hidden, size = 'md', className, style }: CardProps) {
  if (hidden) {
    return (
      <div
        className={clsx('relative flex items-center justify-center overflow-hidden border border-white/80 bg-[#1e293b] shadow-[0_8px_18px_rgba(0,0,0,0.35)]', SIZE_CLASSES[size], className)}
        style={style}
      >
        <div className="absolute inset-[11%] rounded-[inherit] border border-sky-400/35 bg-[#2d3a4f]">
          <div className="h-full w-full opacity-25 bg-[radial-gradient(circle_at_center,_#60a5fa_0%,_transparent_68%)]" />
        </div>
      </div>
    )
  }

  const value = card ? card.slice(0, -1) : ''
  const rank = value === 'T' ? '10' : value
  const suit = SUIT_CLASS[card?.slice(-1).toLowerCase() ?? ''] ?? 'spade'

  return (
    <div
      className={clsx('card-tile relative flex select-none items-center justify-center font-black shadow-[0_8px_18px_rgba(0,0,0,0.38)]', SIZE_CLASSES[size], suit, className)}
      style={style}
    >
      <span className="leading-none">{rank}</span>
    </div>
  )
}
