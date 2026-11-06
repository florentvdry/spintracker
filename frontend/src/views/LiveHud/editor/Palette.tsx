import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Copy, GripVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { abbreviationOf } from '../hudEditor'
import { statCell, type CellContent } from '../hudGrid'
import type { DragPayload } from './useDrag'

export interface CatalogStat {
  section: string
  label: string
  id: string
  /** What to show instead of the label (custom stats are requested by id). */
  name?: string
  ready?: boolean
}

/** Sections in the order the backend registry lists them. */
const SECTION_ORDER = ['preflop', 'huSb', 'huBb', 'threeWayPreflop', 'steal', 'vsSteal', 'postflop', 'shove', 'meta', 'custom']

interface Props {
  catalog: CatalogStat[]
  loading: boolean
  onStart: (payload: DragPayload, event: { clientX: number; clientY: number }, onClick?: () => void) => void
  /** A press on an item without dragging puts it in the selected cell. */
  onPick: (content: CellContent, stat?: { section: string; label: string }) => void
  onCreateCustom: () => void
  onEditCustom: (id: number) => void
  onDuplicateCustom: (id: number) => void
  onDeleteCustom: (id: number) => void
  /** Figures of custom stats are being computed. */
  computing: boolean
}

const chipClass = 'cursor-grab touch-none select-none rounded border border-dark-100 bg-dark-300 px-2 py-0.5 text-xs text-gray-200 hover:border-primary-500 active:cursor-grabbing'
const rowClass = 'group flex cursor-grab touch-none select-none items-center gap-1.5 rounded py-0.5 pl-1.5 pr-1.5 text-[13px] text-gray-300 hover:bg-dark-300 active:cursor-grabbing'

function PaletteBase({ catalog, loading, onStart, onPick, onCreateCustom, onEditCustom, onDuplicateCustom, onDeleteCustom, computing }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState<Record<string, boolean>>({})

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const groups = new Map<string, CatalogStat[]>()
    for (const stat of catalog) {
      if (needle && !(stat.name ?? stat.label).toLowerCase().includes(needle)) continue
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
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('liveHud.editor.search')}
          className="w-full rounded-md border border-dark-100 bg-dark-500 py-1.5 pl-7 pr-2 text-xs text-gray-200 focus:border-primary-500 focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-gray-500">{t('liveHud.editor.elements')}</p>
          <div className="flex flex-wrap gap-1">
            {specials.map(({ key, content }) => {
              const label = t(`liveHud.editor.element.${key}`)
              return (
                <div
                  key={key}
                  className={chipClass}
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
        <button type="button" className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-dark-100 px-2 py-1 text-xs text-gray-300 hover:border-primary-500" onClick={onCreateCustom}>
          <Plus className="h-3 w-3" /> {t('customStats.new')}
        </button>
        {computing && <p className="text-[10px] text-gray-500">{t('customStats.computing')}</p>}
        {sections.map(([section, stats]) => {
          const isClosed = closed[section] && !query
          return (
            <div key={section}>
              <button
                type="button"
                className="mb-0.5 flex w-full items-center gap-1 px-0.5 py-1 text-left text-xs font-semibold text-gray-300 hover:text-white"
                onClick={() => setClosed((c) => ({ ...c, [section]: !c[section] }))}
              >
                {isClosed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {t(`liveHud.editor.section.${section}`, { defaultValue: section })} <span className="font-normal text-gray-500">{stats.length}</span>
              </button>
              {!isClosed && (
                <div>
                  {stats.map((stat) => {
                    const content = stat.section === 'meta' ? ({ kind: 'hands' } as CellContent) : statCell(stat.section, stat.label)
                    const ref = { section: stat.section, label: stat.label }
                    const shown = stat.name ?? stat.label
                    const customId = stat.section === 'custom' ? Number(stat.label) : null
                    return (
                      <div
                        key={stat.id}
                        className={rowClass}
                        title={stat.id}
                        onPointerDown={(e) => {
                          if (e.button === 0) onStart({ kind: 'content', content, label: shown, stat: ref }, e, () => onPick(content, ref))
                        }}
                      >
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-dark-50" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{shown}</span>
                        {customId === null && stat.section !== 'meta' && <span className="shrink-0 font-mono text-[11px] text-gray-500">{abbreviationOf(stat.label)}</span>}
                        {customId !== null && (
                          <span className="ml-1 flex shrink-0 gap-1" onPointerDown={(e) => e.stopPropagation()}>
                            {stat.ready === false && <span className="text-[10px] text-amber-300">{t('customStats.pending')}</span>}
                            <button type="button" className="text-gray-500 hover:text-white" aria-label={t('customStats.duplicate')} onClick={() => onDuplicateCustom(customId)}><Copy className="h-3 w-3" /></button>
                            <button type="button" className="text-gray-500 hover:text-white" aria-label={t('customStats.edit')} onClick={() => onEditCustom(customId)}><Pencil className="h-3 w-3" /></button>
                            <button type="button" className="text-gray-500 hover:text-red-400" aria-label={t('customStats.delete')} onClick={() => onDeleteCustom(customId)}><Trash2 className="h-3 w-3" /></button>
                          </span>
                        )}
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
