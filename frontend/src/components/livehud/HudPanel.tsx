import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { statKey, toneOf, type HudBlock, type HudStatRow, type HudTone, type HudVariant } from '@/views/LiveHud/hudProfile'

/** A figure of one player: its percentage and the number of opportunities behind it. */
export interface HudFigure {
  pct: number | null
  den: number
}

export interface HudPanelProps {
  name: string
  hands: number
  variant: HudVariant
  rows: HudStatRow[]
  /** Figures by `statKey`. */
  figures: Record<string, HudFigure | undefined>
  opacity: number
  size: number
  selected?: boolean
  /** Manual colour tag, if the user set one. */
  tagColor?: string
  /** The opponent is known only once their first hand was written. */
  waiting?: boolean
}

const TONE_CLASS: Record<HudTone, string> = {
  muted: 'text-[#a3aab8]',
  below: 'text-[#8db4ff]',
  above: 'text-[#ffa766]',
  normal: 'text-[#f3f4f6]',
}

const TAG_CLASS: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
}

const BLOCK_ORDER: HudBlock[] = ['threeWay', 'headsUp', 'main']

/** The panel shown beside a player's seat. Its content never depends on the hand being played. */
export default function HudPanel({ name, hands, variant, rows, figures, opacity, size, selected, tagColor, waiting }: HudPanelProps) {
  const { t } = useTranslation()
  const blocks = BLOCK_ORDER.map((block) => ({ block, rows: rows.filter((r) => r.block === block) })).filter((b) => b.rows.length > 0)

  return (
    <div
      className={clsx(
        'w-[150px] origin-top-left rounded-md border px-2 py-1.5 font-sans select-none',
        selected ? 'border-primary-500' : 'border-dark-100',
      )}
      style={{ backgroundColor: `rgba(20, 23, 29, ${opacity})`, transform: `scale(${size})` }}
    >
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold text-[#f3f4f6]">
          {tagColor && <span className={clsx('h-2 w-2 shrink-0 rounded-full', TAG_CLASS[tagColor])} />}
          <span className="truncate">{name}</span>
        </span>
        {!waiting && <span className="font-mono text-[10px] text-[#a3aab8]">{hands}</span>}
      </div>

      {waiting ? (
        <p className="mt-1 text-[10px] text-[#a3aab8]">{t('liveHud.panel.first_hand_expected')}</p>
      ) : (
        blocks.map(({ block, rows: blockRows }) => (
          <div key={block} className="mt-1">
            {variant === 'spin' && <p className="text-[9px] uppercase tracking-wide text-[#a3aab8]">{t(`liveHud.block.${block}`)}</p>}
            <div className="grid gap-x-2" style={{ gridTemplateColumns: `repeat(${Math.min(blockRows.length, 4)}, minmax(0, 1fr))` }}>
              {blockRows.map((row) => {
                const figure = figures[statKey(row)]
                const value = figure?.pct ?? null
                return (
                  <div key={statKey(row)} className="flex flex-col items-center leading-tight">
                    <span className="font-mono text-[9px] text-[#a3aab8]">{row.abbr}</span>
                    <span className={clsx('font-mono text-xs font-semibold', TONE_CLASS[toneOf(row, value, figure?.den ?? 0)])}>
                      {value === null ? '–' : Math.round(value)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
