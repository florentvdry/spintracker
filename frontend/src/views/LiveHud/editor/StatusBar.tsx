import { useTranslation } from 'react-i18next'
import { Check, Minus, Plus, TriangleAlert } from 'lucide-react'

interface Props {
  issueCount: number
  hint: string
  zoom: number
  minZoom: number
  maxZoom: number
  onZoom: (zoom: number) => void
  onIssues: () => void
}

const ZOOM_STEP = 0.1
const zoomButton = 'flex h-[22px] w-[22px] items-center justify-center rounded text-gray-300 hover:bg-dark-300 disabled:opacity-30'

/** What is wrong (or that nothing is), the hint for what is selected, and the zoom: one line instead of a paragraph of help. */
export default function StatusBar({ issueCount, hint, zoom, minZoom, maxZoom, onZoom, onIssues }: Props) {
  const { t } = useTranslation()
  const clamp = (value: number) => Math.min(maxZoom, Math.max(minZoom, Math.round(value * 100) / 100))

  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-dark-200 bg-dark-400 px-3 py-1.5 text-xs text-gray-400">
      {issueCount === 0 ? (
        <span className="flex items-center gap-1.5 text-profit-positive">
          <Check className="h-3.5 w-3.5" />
          {t('liveHud.ws.all_good')}
        </span>
      ) : (
        <button type="button" className="flex items-center gap-1.5 text-yellow-400 hover:text-yellow-300" onClick={onIssues}>
          <TriangleAlert className="h-3.5 w-3.5" />
          {t('liveHud.ws.issues', { count: issueCount })}
        </button>
      )}
      <span className="min-w-[16rem] flex-1">{hint}</span>
      <span>{t('liveHud.ws.sample_figures')}</span>
      <div className="flex items-center gap-0.5">
        <button type="button" className={zoomButton} aria-label={t('liveHud.ws.zoom_out')} disabled={zoom <= minZoom} onClick={() => onZoom(clamp(zoom - ZOOM_STEP))}>
          <Minus className="h-3 w-3" />
        </button>
        <button type="button" className="rounded px-1 py-0.5 font-mono text-xs text-gray-300 hover:bg-dark-300" aria-label={t('liveHud.ws.zoom_reset')} onClick={() => onZoom(1)}>
          {Math.round(zoom * 100)} %
        </button>
        <button type="button" className={zoomButton} aria-label={t('liveHud.ws.zoom_in')} disabled={zoom >= maxZoom} onClick={() => onZoom(clamp(zoom + ZOOM_STEP))}>
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
