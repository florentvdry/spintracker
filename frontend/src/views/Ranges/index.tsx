import { useEffect, useRef, useState } from 'react'
import { CircleHelp, Download, Upload } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import ExportRangesDialog from '@/components/ranges/ExportRangesDialog'
import RangesTour from '@/components/ranges/RangesTour'
import { useNotificationStore } from '@/stores/notificationStore'
import { ipcService } from '@/services/ipcService'
import { useUserRangesStore } from '@/stores/userRangesStore'
import { isTourSeen, markTourSeen } from '@/utils/rangesTour'
import { ImportDialog } from './components/RangeDialogs'
import Adherence from './Adherence'
import Editor from './Editor'
import Overview from './Overview'
import Review from './Review'
import Training from './Training'

const TABS = ['editor', 'overview', 'adherence', 'training', 'review'] as const
type RangesTab = (typeof TABS)[number]

const isTab = (value: string | null): value is RangesTab => TABS.some((tab) => tab === value)
const EXPORT_FILE_NAME = 'spintracker-ranges.json'

export default function Ranges() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const load = useUserRangesStore((s) => s.load)
  const loaded = useUserRangesStore((s) => s.loaded)
  const select = useUserRangesStore((s) => s.select)
  const spots = useUserRangesStore((s) => s.spots)
  const empty = spots.length === 0
  const exportRanges = useUserRangesStore((s) => s.exportRanges)
  const notify = useNotificationStore()
  const importInput = useRef<HTMLInputElement>(null)
  const [tourOpen, setTourOpen] = useState(false)
  const [importContent, setImportContent] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const requested = params.get('tab')
  const active: RangesTab = isTab(requested) ? requested : 'editor'

  useEffect(() => {
    void load()
  }, [load])

  // A first visit with nothing built yet starts the tour once.
  useEffect(() => {
    if (loaded && empty && !isTourSeen()) setTourOpen(true)
  }, [loaded, empty])

  const closeTour = () => {
    markTourSeen()
    setTourOpen(false)
  }

  const exportFile = async (scenarioIds: number[]) => {
    setExportOpen(false)
    const result = await exportRanges(scenarioIds)
    if (result.error || result.value === undefined) {
      notify.error(result.error ?? 'error')
      return
    }
    const saved = await ipcService.saveTextFile(t('ranges.fileCard.dialogTitle'), EXPORT_FILE_NAME, result.value)
    if (saved.success) notify.success(t('ranges.fileCard.exported'))
    else if (!saved.cancelled) notify.error(saved.message ?? 'error')
  }

  return (
    <div className="mx-auto w-full max-w-[1376px] flex flex-col gap-[18px]">
      <div role="tablist" className="flex gap-1 p-1.5 rounded-xl border border-dark-200 bg-dark-600 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={tab === active}
            onClick={() => setParams({ tab }, { replace: true })}
            className={clsx(
              'px-5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              tab === active ? 'bg-primary-500 text-onprimary font-semibold' : 'text-gray-400 hover:text-gray-100',
            )}
          >
            {t(`ranges.tabs.${tab}`)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-icon flex items-center gap-1.5 px-2.5 py-2 text-[13px]" title={t('ranges.fileCard.help')} onClick={() => importInput.current?.click()}>
            <Upload className="w-4 h-4" />
            {t('ranges.fileCard.import')}
          </button>
          <button className="btn-icon flex items-center gap-1.5 px-2.5 py-2 text-[13px]" title={t('ranges.fileCard.help')} disabled={empty} onClick={() => setExportOpen(true)}>
            <Download className="w-4 h-4" />
            {t('ranges.fileCard.export')}
          </button>
          <button className="btn-icon p-2" aria-label={t('ranges.tour.open')} title={t('ranges.tour.open')} onClick={() => setTourOpen(true)}>
            <CircleHelp className="w-4 h-4" />
          </button>
        </div>
        <input
          ref={importInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={t('ranges.fileCard.import')}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void file.text().then(setImportContent)
          }}
        />
      </div>
      <ImportDialog content={importContent} onClose={() => setImportContent(null)} />
      <ExportRangesDialog open={exportOpen} spots={spots} onClose={() => setExportOpen(false)} onExport={(ids) => void exportFile(ids)} />
      <RangesTour open={tourOpen} onClose={closeTour} />
      {loaded ? <>
          {active === 'editor' && <Editor />}
          {active === 'overview' && (
            <Overview
              onOpenEditor={(spotId, scenarioId) => {
                select(spotId, scenarioId)
                setParams({ tab: 'editor' }, { replace: true })
              }}
            />
          )}
          {active === 'adherence' && <Adherence />}
          {active === 'review' && <Review onStart={() => setParams({ tab: 'training' }, { replace: true })} />}
          {active === 'training' && (
            <Training
              onOpenRange={(spotId, scenarioId) => {
                select(spotId, scenarioId)
                setParams({ tab: 'editor' }, { replace: true })
              }}
            />
          )}
        </> : <div className="spinner mx-auto mt-24" />}
    </div>
  )
}
