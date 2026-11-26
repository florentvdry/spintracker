import { useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import type { Json } from '@/services/ipcService'
import { useReplayerStore } from '@/stores/replayerStore'
import HandVideoDialog from './HandVideoDialog'

/** Opens the export of the hand on the table as a video or a GIF. */
export default function VideoExportButton({ handData }: { handData: Json }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const inBb = useReplayerStore((s) => s.viewMode === 'bb')

  return (
    <>
      <button className={clsx('log-toggle', open && 'active')} onClick={() => setOpen(true)}>
        <Clapperboard size={18} />
        <span>{t('replayer.export.video')}</span>
      </button>
      <HandVideoDialog open={open} onClose={() => setOpen(false)} handData={handData} inBb={inBb} />
    </>
  )
}
