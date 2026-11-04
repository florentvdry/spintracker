import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import HudGridView from '@/components/livehud/HudGridView'
import { useLiveHudStore } from '@/stores/liveHudStore'
import type { HudFormat } from '../hudProfile'
import { TEMPLATES, type LayoutTemplateId, type TemplateId } from '../hudTemplates'
import { previewFigures } from '../previewData'

const LAYOUT_MODELS: LayoutTemplateId[] = ['full', 'flash']
const POPUP_MODELS: TemplateId[] = ['popupGeneral', 'popupHeadsUp', 'popupThreeWay']
const PREVIEW_GRIDS = 3

interface Props {
  format: HudFormat
  onClose: () => void
  /** Puts a model into the profile being edited (one undo step). */
  onApply: (id: TemplateId) => void
}

function ModelCard({ id, format, primary, onApply }: { id: LayoutTemplateId; format: HudFormat; primary: boolean; onApply: (id: TemplateId) => void }) {
  const { t } = useTranslation()
  const { addProfile, applyTemplate } = useLiveHudStore()
  const instance = useMemo(() => TEMPLATES[id].build(format), [id, format])
  const figures = useMemo(() => previewFigures({ grids: instance.grids, popups: instance.popups }), [instance])

  const inNewProfile = () => {
    const created = addProfile(t(`liveHud.templates.${id}`), true)
    if (created) applyTemplate(created, id)
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-dark-200 bg-dark-600 p-3">
      <div className="flex min-h-[150px] flex-wrap content-start gap-2 overflow-hidden">
        {instance.grids.slice(0, PREVIEW_GRIDS).map((grid) => (
          <HudGridView key={grid.id} grid={grid} figures={figures} player={{ name: t('liveHud.preview.player', { n: 1 }) }} opacity={1} />
        ))}
      </div>
      <div className="text-[13px]">
        <strong className="font-semibold text-white">{t(`liveHud.templates.${id}`)}</strong>
        <span className="text-gray-400">{`, ${t(`liveHud.ws.model_desc.${id}`, { count: instance.grids.length })}`}</span>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          className={primary ? 'flex-1 rounded-md bg-primary-600 px-2 py-1.5 text-[13px] font-medium text-white hover:bg-primary-500' : 'flex-1 rounded-md border border-dark-100 bg-dark-300 px-2 py-1.5 text-[13px] font-medium text-gray-200 hover:border-gray-500'}
          onClick={() => onApply(id)}
        >
          {t('liveHud.ws.replace_grids')}
        </button>
        <button type="button" className="rounded-md border border-dark-100 bg-dark-300 px-2.5 py-1.5 text-[13px] text-gray-200 hover:border-gray-500" onClick={inNewProfile}>
          {t('liveHud.ws.new_profile')}
        </button>
      </div>
    </div>
  )
}

/** The shipped models: layouts that replace the grids of the table size being edited, and ready-made popups. */
export default function ModelsDialog({ format, onClose, onApply }: Props) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('liveHud.ws.models')} className="max-h-full w-[880px] max-w-full overflow-y-auto rounded-xl border border-dark-100 bg-dark-400">
        <div className="flex items-center justify-between border-b border-dark-200 px-4 py-3">
          <h2 className="text-[15px] font-semibold text-white">{t('liveHud.ws.models_title', { format: t(`liveHud.format.${format}`).toLowerCase() })}</h2>
          <button type="button" className="btn-icon" aria-label={t('common.close')} onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3 p-4">
          {LAYOUT_MODELS.map((id, i) => (
            <ModelCard key={id} id={id} format={format} primary={i === 0} onApply={onApply} />
          ))}
        </div>
        <div className="px-4 pb-3.5">
          <h3 className="mb-1.5 text-xs font-semibold text-gray-200">{t('liveHud.ws.add_popup_title')}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {POPUP_MODELS.map((id) => (
              <button key={id} type="button" className="rounded-md border border-dark-100 bg-dark-300 px-2.5 py-1.5 text-[13px] text-gray-200 hover:border-gray-500" onClick={() => onApply(id)}>
                {t(`liveHud.templates.${id}`)}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-400">{t('liveHud.ws.undo_note')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
