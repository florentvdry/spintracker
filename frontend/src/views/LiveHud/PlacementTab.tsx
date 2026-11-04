import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import HudPanel from '@/components/livehud/HudPanel'
import Card from '@/components/ui/Card'
import { useLiveHudStore } from '@/stores/liveHudStore'
import {
  defaultPlacements,
  HUD_FORMATS,
  HUD_ROOMS,
  SEATS_BY_FORMAT,
  snap,
  type HudFormat,
  type HudRoom,
  type PanelPosition,
} from './hudProfile'
import { PREVIEW_HANDS, previewFigures } from './previewData'

/** Panel size on the preview table, as a fraction of its width and height (before scaling). */
const PANEL_WIDTH_FRACTION = 0.23
const PANEL_HEIGHT_FRACTION = 0.34

interface DragState {
  seat: string
  offsetX: number
  offsetY: number
}

export default function PlacementTab() {
  const { t } = useTranslation()
  const { settings, setPlacements, setSnapToGrid } = useLiveHudStore()
  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const [room, setRoom] = useState<HudRoom>('Winamax')
  const [format, setFormat] = useState<HudFormat>('threeMax')
  const [draft, setDraft] = useState<Record<string, PanelPosition>>(settings.placements[room][format])
  const [dirty, setDirty] = useState(false)
  const [dragging, setDragging] = useState<DragState | null>(null)
  const table = useRef<HTMLDivElement>(null)

  // Changing room or format loads the saved positions, dropping an unsaved draft.
  useEffect(() => {
    setDraft(settings.placements[room][format])
    setDirty(false)
  }, [room, format, settings.placements])

  const rows = profile.stats[profile.variant]
  const figures = useMemo(() => previewFigures(rows), [rows])
  const seats = SEATS_BY_FORMAT[format]

  const startDrag = (seat: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const box = table.current?.getBoundingClientRect()
    if (!box) return
    const position = draft[seat]
    setDragging({ seat, offsetX: event.clientX - (box.left + position.x * box.width), offsetY: event.clientY - (box.top + position.y * box.height) })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = table.current?.getBoundingClientRect()
    if (!dragging || !box) return
    const place = (value: number, fraction: number) => {
      const limit = Math.max(0, 1 - fraction)
      const next = Math.min(limit, Math.max(0, value))
      return settings.snapToGrid ? Math.min(limit, snap(next)) : next
    }
    const x = place((event.clientX - dragging.offsetX - box.left) / box.width, PANEL_WIDTH_FRACTION * profile.size)
    const y = place((event.clientY - dragging.offsetY - box.top) / box.height, PANEL_HEIGHT_FRACTION * profile.size)
    setDraft((d) => ({ ...d, [dragging.seat]: { x, y } }))
    setDirty(true)
  }

  const save = () => {
    setPlacements(room, format, draft)
    setDirty(false)
  }

  const reset = () => {
    setDraft(defaultPlacements()[room][format])
    setDirty(true)
  }

  const tab = (active: boolean) => clsx('rounded-md border px-3 py-1.5 text-sm', active ? 'border-primary-500 bg-primary-500 text-white' : 'border-dark-100 text-gray-300')

  return (
    <Card title={t('liveHud.placement.title')} subtitle={t('liveHud.placement.subtitle')}>
      <div className="mb-4 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('liveHud.placement.room')}</span>
          {HUD_ROOMS.map((r) => (
            <button key={r} className={tab(r === room)} onClick={() => setRoom(r)}>
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('liveHud.placement.format')}</span>
          {HUD_FORMATS.map((f) => (
            <button key={f} className={tab(f === format)} onClick={() => setFormat(f)}>
              {t(`liveHud.format.${f}`)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={settings.snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
          {t('liveHud.placement.snap')}
        </label>
        <div className="flex-1" />
        <button className="btn-secondary" onClick={reset}>
          {t('liveHud.placement.reset')}
        </button>
        <button className="btn-primary" disabled={!dirty} onClick={save}>
          {t('common.save')}
        </button>
      </div>

      <div ref={table} className="relative mx-auto aspect-[16/10] w-full max-w-3xl overflow-hidden rounded-lg border border-dark-100 bg-dark-500">
        <div className="absolute inset-x-[12%] inset-y-[18%] rounded-[50%] border border-dark-100 bg-dark-300" />
        <span className="absolute bottom-[8%] left-1/2 -translate-x-1/2 rounded bg-dark-200 px-2 py-0.5 text-xs text-gray-400">{t('liveHud.placement.hero')}</span>
        {seats.map((seat) => (
          <div
            key={seat}
            className={clsx('absolute touch-none', dragging?.seat === seat ? 'cursor-grabbing' : 'cursor-grab')}
            style={{ left: `${draft[seat].x * 100}%`, top: `${draft[seat].y * 100}%` }}
            onPointerDown={(e) => startDrag(seat, e)}
            onPointerMove={drag}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
          >
            <p className="mb-0.5 text-[10px] text-gray-500">{t('liveHud.placement.seat', { seat })}</p>
            <HudPanel
              name={t('liveHud.preview.player', { n: seat === '+1' ? 1 : 2 })}
              hands={PREVIEW_HANDS}
              variant={profile.variant}
              rows={rows}
              figures={figures}
              opacity={profile.opacity}
              size={profile.size}
              selected={dragging?.seat === seat}
            />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">{t('liveHud.placement.note')}</p>
    </Card>
  )
}
