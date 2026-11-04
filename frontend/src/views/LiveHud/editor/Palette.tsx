import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { statCell, type CellContent } from '../hudGrid'
import type { DragPayload } from './useDrag'

export interface CatalogStat {
  section: string
  label: string
  id: string
}

/** Sections in the order the backend registry lists them. */
const SECTION_ORDER = ['preflop', 'huSb', 'huBb', 'threeWayPreflop', 'steal', 'vsSteal', 'postflop', 'shove', 'meta']

interface Props {
  catalog: CatalogStat[]
  loading: boolean
  onStart: (payload: DragPayload, event: { clientX: number; clientY: number }, onClick?: () => void) => void
  /** A press on an item without dragging puts it in the selected cell. */
  onPick: (content: CellContent, stat?: { section: string; label: string }) => void
}

const itemClass = 'flex cursor-grab touch-none select-none items-center rounded border border-dark-100 bg-dark-300 px-2 py-1 text-xs text-gray-200 hover:border-primary-500 active:cursor-grabbing'

function PaletteBase({ catalog, loading, onStart, onPick }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState<Record<string, boolean>>({})

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const groups = new Map<string, CatalogStat[]>()
    for (const stat of catalog) {
      if (needle && !stat.label.toLowerCase().includes(needle)) continue
      groups.set(stat.section, [...(groups.get(stat.section) ?? []), stat])
    }
    return [...groups.entries()].sort((a, b) => SECTION_ORDER.indexOf(a[0]) - SECTION_ORDER.indexOf(b[0]))
  }, [catalog, query])

  const specials: { key: string; content: CellContent }[] = [
    { key: 'text', content: { kind: 'text', text: t('liveHud.editor.new_text') } },
    { key: 'playerName', content: { kind: 'playerName' } },
    { key: 'hands', content: { kind: 'hands' } },
    { key: 'tag', content: { kind: 'tag' } },
    { key: 'stackLabel', content: { kind: 'stackLabel' } },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('liveHud.editor.search')}
          className="w-full rounded border border-dark-100 bg-dark-300 py-1 pl-7 pr-2 text-xs text-gray-200 focus:border-primary-500 focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{t('liveHud.editor.elements')}</p>
          <div className="grid grid-cols-2 gap-1">
            {specials.map(({ key, content }) => {
              const label = t(`liveHud.editor.element.${key}`)
              return (
                <div
                  key={key}
                  className={itemClass}
                  onPointerDown={(e) => {
                    if (e.button === 0) onStart({ kind: 'content', content, label }, e, () => onPick(content))
                  }}
                >
                  {label}
                </div>
              )
            })}
          </div>
        </div>

        {loading && <div className="spinner mx-auto my-4" />}
        {!loading && sections.length === 0 && <p className="text-xs text-gray-500">{t('liveHud.editor.no_stat')}</p>}
        {sections.map(([section, stats]) => {
          const isClosed = closed[section] && !query
          return (
            <div key={section}>
              <button
                type="button"
                className="mb-1 flex w-full items-center gap-1 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-200"
                onClick={() => setClosed((c) => ({ ...c, [section]: !c[section] }))}
              >
                {isClosed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {t(`liveHud.editor.section.${section}`, { defaultValue: section })} <span className="text-gray-600">({stats.length})</span>
              </button>
              {!isClosed && (
                <div className={clsx('grid gap-1', 'grid-cols-1')}>
                  {stats.map((stat) => {
                    const content = stat.section === 'meta' ? ({ kind: 'hands' } as CellContent) : statCell(stat.section, stat.label)
                    const ref = { section: stat.section, label: stat.label }
                    return (
                      <div
                        key={stat.id}
                        className={itemClass}
                        title={stat.id}
                        onPointerDown={(e) => {
                          if (e.button === 0) onStart({ kind: 'content', content, label: stat.label, stat: ref }, e, () => onPick(content, ref))
                        }}
                      >
                        <span className="truncate">{stat.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const Palette = memo(PaletteBase)
export default Palette
