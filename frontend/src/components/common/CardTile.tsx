import clsx from 'clsx'

const TONES = { h: 'bg-[#ef1f2d]', d: 'bg-[#2563eb]', c: 'bg-profit-positive', s: 'bg-gray-500' } as const

const SIZES = {
  sm: 'w-6 h-7 text-[11px] rounded',
  lg: 'w-[31px] h-[34px] text-[15px] rounded-[5px]',
}

export function cardRank(card = ''): string {
  const clean = String(card).trim()
  return (clean.length > 1 ? clean.slice(0, -1) : clean).toUpperCase()
}

function cardTone(card = ''): string {
  const suit = String(card).trim().slice(-1).toLowerCase() as keyof typeof TONES
  return TONES[suit] ?? TONES.s
}

interface CardTileProps {
  card: string
  size?: keyof typeof SIZES
}

/** Compact colored tile showing a card rank, tinted by suit. */
export default function CardTile({ card, size = 'sm' }: CardTileProps) {
  return (
    <span
      className={clsx('inline-grid place-items-center text-white font-black shadow-[inset_0_-1px_0_rgba(0,0,0,0.26)]', SIZES[size], cardTone(card))}
    >
      {cardRank(card)}
    </span>
  )
}
