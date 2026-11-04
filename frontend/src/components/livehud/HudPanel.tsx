import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import {
  columnOf,
  figureKey,
  STACK_BUCKETS,
  toneOf,
  type HudCell,
  type HudFamily,
  type HudLayout,
  type HudTable,
  type HudTone,
} from '@/views/LiveHud/hudProfile'

/** A figure of one player: its percentage, and the counts behind it. */
export interface HudFigure {
  pct: number | null
  num: number
  den: number
}

export type HudFigures = Record<string, HudFigure | undefined>

export interface HudPanelProps {
  name: string
  layout: HudLayout
  /** Figures by `figureKey`. */
  figures: HudFigures
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

/** Header colour by what the figure measures: a glance tells opening, limping and shoving apart. */
const FAMILY_CLASS: Record<HudFamily, string> = {
  open: 'bg-emerald-900/70 text-emerald-200',
  limp: 'bg-amber-900/70 text-amber-200',
  shove: 'bg-violet-900/70 text-violet-200',
  defense: 'bg-sky-900/70 text-sky-200',
  threeBet: 'bg-pink-900/70 text-pink-200',
  postflop: 'bg-teal-900/70 text-teal-200',
  showdown: 'bg-slate-700/70 text-slate-200',
  count: 'text-[#a3aab8]',
}

const TAG_CLASS: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
}

function Value({ cell, figure }: { cell: HudCell; figure: HudFigure | undefined }) {
  if (cell.section === 'meta') {
    return <span className="font-mono text-[11px] font-semibold text-sky-300">{figure ? figure.num : '–'}</span>
  }
  const value = figure?.pct ?? null
  const sample = figure?.den ?? 0
  return (
    <span className={clsx('inline-flex items-baseline justify-center font-mono text-[12px] font-semibold', TONE_CLASS[toneOf(cell, value, sample)])}>
      {value === null || sample === 0 ? '–' : Math.round(value)}
      {sample > 0 && <sub className="ml-px text-[8px] font-normal text-sky-400">{sample}</sub>}
    </span>
  )
}

function Header({ cell }: { cell: HudCell }) {
  return <span className={clsx('block rounded-sm px-1 text-center font-mono text-[9px] leading-[14px]', FAMILY_CLASS[cell.family])}>{cell.abbr}</span>
}

/** A table with one row per stack depth: the `H` column counts the hands behind the row. */
function StackTable({ table, figures }: { table: HudTable; figures: HudFigures }) {
  const columns = table.cells.length + 2
  return (
    <div className="grid items-center gap-x-1 gap-y-px" style={{ gridTemplateColumns: `repeat(${columns}, minmax(1.6rem, auto))` }}>
      <span className="font-mono text-[10px] font-semibold text-cyan-300">{table.title}</span>
      <span className="text-center font-mono text-[9px] text-[#a3aab8]">H</span>
      {table.cells.map((c, i) => (
        <Header key={`${c.section}${c.label}${i}`} cell={c} />
      ))}
      {STACK_BUCKETS.map((bucket) => (
        <StackRow key={bucket} table={table} bucket={bucket} figures={figures} />
      ))}
    </div>
  )
}

function StackRow({ table, bucket, figures }: { table: HudTable; bucket: string; figures: HudFigures }) {
  const hands = figures[figureKey('meta', 'hands', table.column, bucket)]
  return (
    <>
      <span className="font-mono text-[9px] text-[#a3aab8]">{bucket}</span>
      <span className="text-center font-mono text-[9px] text-[#a3aab8]">{hands ? hands.num : '–'}</span>
      {table.cells.map((c, i) => (
        <div key={`${c.section}${c.label}${i}`} className="text-center">
          <Value cell={c} figure={figures[figureKey(c.section, c.label, columnOf(table.column, c), bucket)]} />
        </div>
      ))}
    </>
  )
}

/** A table of one row: the title, then each figure under its header. */
function SingleTable({ table, figures }: { table: HudTable; figures: HudFigures }) {
  return (
    <div className="grid items-center gap-x-1" style={{ gridTemplateColumns: `2rem repeat(${table.cells.length}, minmax(1.6rem, auto))` }}>
      <span className="row-span-2 font-mono text-[10px] font-semibold text-cyan-300">{table.title}</span>
      {table.cells.map((c, i) => (
        <Header key={`h${c.section}${c.label}${i}`} cell={c} />
      ))}
      {table.cells.map((c, i) => (
        <div key={`v${c.section}${c.label}${i}`} className="text-center">
          <Value cell={c} figure={figures[figureKey(c.section, c.label, columnOf(table.column, c), null)]} />
        </div>
      ))}
    </div>
  )
}

/** The panel shown beside a player's seat. Its content never depends on the hand being played. */
export default function HudPanel({ name, layout, figures, opacity, size, selected, tagColor, waiting }: HudPanelProps) {
  const { t } = useTranslation()
  return (
    <div
      className={clsx('w-max origin-top-left space-y-1 rounded-md border px-2 py-1.5 font-sans select-none', selected ? 'border-primary-500' : 'border-dark-100')}
      style={{ backgroundColor: `rgba(20, 23, 29, ${opacity})`, transform: `scale(${size})` }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#f3f4f6]">
        {tagColor && <span className={clsx('h-2 w-2 shrink-0 rounded-full', TAG_CLASS[tagColor])} />}
        <span className="truncate">{name}</span>
      </div>

      {waiting ? (
        <p className="text-[10px] text-[#a3aab8]">{t('liveHud.panel.first_hand_expected')}</p>
      ) : (
        <>
          <div className="flex items-end gap-2">
            {layout.strip.map((c, i) => (
              <div key={`${c.section}${c.label}${i}`} className="min-w-[1.8rem] space-y-px text-center">
                <Header cell={c} />
                <Value cell={c} figure={figures[figureKey(c.section, c.label, c.column, null)]} />
              </div>
            ))}
          </div>
          {layout.tables.map((table) =>
            table.rows === 'stack' ? <StackTable key={table.id} table={table} figures={figures} /> : <SingleTable key={table.id} table={table} figures={figures} />,
          )}
        </>
      )}
    </div>
  )
}
