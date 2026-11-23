import { useEffect, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ipcService, type Json } from '@/services/ipcService'
import { normalizeHand, toGtoWizard } from '@/utils/handText'
import { logError } from '@/utils/log'

const FEEDBACK_MS = 2000

type Feedback = 'copied' | 'saved' | 'failed' | null

/** Writes the hand on the table out as text: for GTO Wizard, copied or saved as a file. */
export default function HandExportMenu({ handData }: { handData: Json }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  const flash = (value: Feedback) => {
    setFeedback(value)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }

  const text = () => toGtoWizard(normalizeHand(handData))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text())
      flash('copied')
    } catch (error) {
      logError('Could not copy the hand:', error)
      flash('failed')
    }
    setOpen(false)
  }

  const save = async () => {
    setOpen(false)
    try {
      const result = await ipcService.saveTextFile(t('replayer.export.dialog'), `hand-${String(handData.handId ?? 'export').slice(0, 24)}.txt`, text(), 'txt')
      if (result.success) flash('saved')
      else if (!result.cancelled) flash('failed')
    } catch (error) {
      logError('Could not save the hand:', error)
      flash('failed')
    }
  }

  return (
    <div className="relative">
      <button className={clsx('log-toggle', open && 'active')} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Share2 size={18} />
        <span>{feedback ? t(`replayer.export.${feedback}`) : t('replayer.export.title')}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 flex w-64 flex-col rounded-[10px] border border-dark-200 bg-dark-300 p-1 shadow-xl">
          <button className="rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-dark-400" onClick={() => void copy()}>
            {t('replayer.export.copy_gto')}
          </button>
          <button className="rounded-md px-3 py-2 text-left text-sm text-gray-200 hover:bg-dark-400" onClick={() => void save()}>
            {t('replayer.export.save_gto')}
          </button>
          <p className="px-3 pb-2 pt-1 text-[11px] text-gray-500">{t('replayer.export.gto_hint')}</p>
        </div>
      )}
    </div>
  )
}
