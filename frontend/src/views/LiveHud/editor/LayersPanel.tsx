import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import type { HudGrid } from '../hudGrid'

interface Props {
  grids: HudGrid[]
  popups: HudGrid[]
  selectedIds: string[]
  activePopupId: string | null
  onPick: (grid: HudGrid, popup: boolean) => void
  onAdd: (popup: boolean) => void
}

const row = (active: boolean) => clsx('flex w-full items-center justify-between rounded px-1.5 py-1 text-left', active ? 'bg-dark-200 text-gray-100' : 'text-gray-300 hover:bg-dark-300')

function Heading({ title, addLabel, onAdd }: { title: string; addLabel: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between px-1 pb-1.5">
      <h2 className="text-xs font-semibold text-gray-100">{title}</h2>
      <button type="button" className="rounded p-0.5 text-gray-400 hover:bg-dark-300 hover:text-gray-100" aria-label={addLabel} title={addLabel} onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/** The grids and popups of the layout as a list: pick one to edit it. */
export default function LayersPanel({ grids, popups, selectedIds, activePopupId, onPick, onAdd }: Props) {
  const { t } = useTranslation()
  const links = (popup: HudGrid) => [...grids, ...popups].reduce((n, g) => n + g.cells.filter((c) => c.popupId === popup.id).length, 0)

  return (
    <div className="border-b border-dark-200 p-2">
      <Heading title={t('liveHud.ws.grids')} addLabel={t('liveHud.ws.add_grid')} onAdd={() => onAdd(false)} />
      {grids.map((grid) => (
        <button key={grid.id} type="button" className={row(selectedIds.includes(grid.id))} onClick={() => onPick(grid, false)}>
          <span className="truncate">{grid.name}</span>
          <span className="ml-2 shrink-0 font-mono text-[11px] text-gray-400">{`${grid.rows.length}×${grid.cols.length}`}</span>
        </button>
      ))}
      {grids.length === 0 && <p className="px-1.5 text-xs text-gray-500">{t('liveHud.profiles.empty_layout')}</p>}

      <div className="pt-2.5">
        <Heading title={t('liveHud.ws.popups')} addLabel={t('liveHud.ws.add_popup')} onAdd={() => onAdd(true)} />
        {popups.map((popup) => (
          <button key={popup.id} type="button" className={row(popup.id === activePopupId)} onClick={() => onPick(popup, true)}>
            <span className="truncate">{popup.name}</span>
            <span className="ml-2 shrink-0 text-[11px] text-gray-400">{t('liveHud.ws.popup_links', { count: links(popup) })}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
