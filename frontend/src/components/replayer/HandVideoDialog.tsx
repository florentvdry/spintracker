import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/ui/Modal'
import { ipcService, type Json } from '@/services/ipcService'
import { buildReplaySteps } from '@/stores/replayerStore'
import { encodeGif } from '@/utils/gif'
import { captureFrames, drawFrame, GIF_SIZES, recordVideo, VIDEO_SIZES, type Aspect } from '@/utils/handVideo'
import { logError } from '@/utils/log'

const SECONDS = [0.6, 1, 1.5, 2]
const DEFAULT_SECONDS = 1

type Kind = 'video' | 'gif'
type Phase = 'idle' | 'working' | 'saved' | 'failed' | 'cancelled'

/** Exports the hand on the table as a video (MP4 or WebM) or a GIF, in 16:9 or 9:16. */
export default function HandVideoDialog({ open, onClose, handData, inBb }: { open: boolean; onClose: () => void; handData: Json; inBb: boolean }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<Kind>('video')
  const [aspect, setAspect] = useState<Aspect>('16:9')
  const [seconds, setSeconds] = useState(DEFAULT_SECONDS)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [detail, setDetail] = useState('')
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) {
      abort.current?.abort()
      setPhase('idle')
    }
  }, [open])

  const bigBlind = Number(String(handData.blinds ?? '').split('/')[1]) || 0
  const title = `${handData.room ?? ''} · ${handData.blinds ?? ''}`.trim()

  const start = async () => {
    const controller = new AbortController()
    abort.current = controller
    setPhase('working')
    setDetail('')
    try {
      const steps = buildReplaySteps(handData)
      const size = kind === 'gif' ? GIF_SIZES[aspect] : VIDEO_SIZES[aspect]
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const ctx = canvas.getContext('2d', { willReadFrequently: kind === 'gif' })
      if (!ctx) throw new Error('no canvas')
      const options = {
        steps,
        holdMs: seconds * 1000,
        draw: (step: (typeof steps)[number]) => drawFrame(ctx, step, handData, { ...size, aspect, inBb, bigBlind, title }),
        onProgress: (done: number, total: number) => setProgress({ done, total }),
        signal: controller.signal,
      }
      let bytes: Uint8Array
      let extension: string
      if (kind === 'gif') {
        const frames = await captureFrames(canvas, options)
        bytes = encodeGif(frames.map((rgba) => ({ rgba })), size.width, size.height, seconds * 1000)
        extension = 'gif'
      } else {
        const recorded = await recordVideo(canvas, options)
        bytes = new Uint8Array(await recorded.blob.arrayBuffer())
        extension = recorded.extension
      }
      const result = await ipcService.saveBinaryFile(t('replayer.video.dialog'), `hand-${String(handData.handId ?? 'export').slice(0, 24)}`, extension, bytes)
      if (result.success) setPhase('saved')
      else if (result.cancelled) setPhase('idle')
      else {
        setDetail(result.message ?? '')
        setPhase('failed')
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setPhase('cancelled')
      } else {
        logError('Could not export the hand as a video:', error)
        setDetail(error instanceof Error ? error.message : String(error))
        setPhase('failed')
      }
    }
  }

  const working = phase === 'working'
  return (
    <Modal open={open} title={t('replayer.video.title')} onClose={() => (working ? abort.current?.abort() : onClose())} width={420}>
      <div className="space-y-4 text-sm text-gray-200">
        <div className="segmented">
          {(['video', 'gif'] as Kind[]).map((choice) => (
            <button key={choice} disabled={working} className={`segmented-item ${kind === choice ? 'active' : ''}`} onClick={() => setKind(choice)}>
              {t(`replayer.video.kind_${choice}`)}
            </button>
          ))}
        </div>
        <div className="segmented">
          {(['16:9', '9:16'] as Aspect[]).map((choice) => (
            <button key={choice} disabled={working} className={`segmented-item ${aspect === choice ? 'active' : ''}`} onClick={() => setAspect(choice)}>
              {choice}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3 text-xs text-gray-400">
          {t('replayer.video.step')}
          <select className="select w-24" disabled={working} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
            {SECONDS.map((s) => (
              <option key={s} value={s}>{s} s</option>
            ))}
          </select>
        </label>
        {working && (
          <div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-500">{t('replayer.video.progress', progress)}</p>
          </div>
        )}
        {phase === 'saved' && <p className="text-xs text-profit-positive">{t('replayer.video.saved')}</p>}
        {phase === 'failed' && <p className="text-xs text-profit-negative">{t('replayer.video.failed')} {detail}</p>}
        {phase === 'cancelled' && <p className="text-xs text-gray-400">{t('replayer.video.cancelled')}</p>}
        <p className="text-[11px] text-gray-500">{t('replayer.video.hint')}</p>
        <div className="flex justify-end gap-2">
          {working ? (
            <button className="btn-secondary" onClick={() => abort.current?.abort()}>{t('common.cancel')}</button>
          ) : (
            <>
              <button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>
              <button className="btn-primary" onClick={() => void start()}>{t('replayer.video.start')}</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
