import { useTranslation } from 'react-i18next'
import { useLiveHudStore } from '@/stores/liveHudStore'
import type { EditorDoc } from '../hudEditor'
import { estimateGridSize, REFERENCE_TABLE, type GridPosition } from '../hudGrid'

export interface Placed {
  seat: string
  gridId: string
}

interface Props {
  doc: EditorDoc
  placed: Placed | null
  seats: string[]
  /** The profile's size: grids are drawn at this scale on the table. */
  size: number
  onPlace: (seat: string, gridId: string, position: GridPosition) => void
  onMirror: (from: string, to: string, widths: Record<string, number>) => void
}

const field = 'rounded border border-dark-100 bg-dark-300 px-1.5 py-1 font-mono text-xs text-gray-200 focus:border-primary-500 focus:outline-none'

/** Where the selected grid sits on the table, for one seat, as percentages of the table window. */
export default function PlacementInspector({ doc, placed, seats, size, onPlace, onMirror }: Props) {
  const { t } = useTranslation()
  const { settings, setSnapToGrid } = useLiveHudStore()
  const grid = placed ? doc.layout.grids.find((g) => g.id === placed.gridId) : undefined
  const position = placed && grid ? doc.seats[placed.seat]?.[grid.id] : undefined

  const widths = Object.fromEntries(doc.layout.grids.map((g) => [g.id, (estimateGridSize(g).width * size) / REFERENCE_TABLE.width]))
  const other = placed ? seats.find((s) => s !== placed.seat) : undefined
  const percent = (value: number) => Math.round(value * 100)

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <p className="mb-0.5 text-xs text-gray-400">{t('liveHud.ws.placement')}</p>
        <h2 className="text-sm font-semibold text-white">{grid && placed ? t('liveHud.ws.placement_title', { grid: grid.name, seat: placed.seat }) : t('liveHud.ws.pick_grid')}</h2>
      </div>
      {grid && placed && position && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(['x', 'y'] as const).map((axis) => (
              <label key={axis} className="flex flex-col gap-1 text-xs text-gray-400">
                {t(axis === 'x' ? 'liveHud.ws.left' : 'liveHud.ws.top')} (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={field}
                  value={percent(position[axis])}
                  onChange={(e) => onPlace(placed.seat, grid.id, { ...position, [axis]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 })}
                />
              </label>
            ))}
          </div>
          {other && (
            <button type="button" className="rounded border border-dark-100 bg-dark-300 px-2 py-1.5 text-xs text-gray-200 hover:border-gray-500" onClick={() => onMirror(placed.seat, other, widths)}>
              {t('liveHud.ws.mirror', { seat: other })}
            </button>
          )}
        </>
      )}
      <label className="flex items-center gap-2 text-xs text-gray-200" title={t('liveHud.placement.snap_hint')}>
        <input type="checkbox" checked={settings.snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
        {t('liveHud.placement.snap')}
      </label>
      <p className="border-t border-dark-200 pt-3 text-xs text-gray-400">{t('liveHud.ws.placement_help')}</p>
    </div>
  )
}
