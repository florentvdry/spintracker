import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import RangeMatrix from '@/components/ranges/RangeMatrix'
import { useNotificationStore } from '@/stores/notificationStore'
import { useUserRangesStore } from '@/stores/userRangesStore'
import { textColor } from '@/utils/ranges'
import { DEMO_COLORS, DEMO_START, DEMO_TARGET_COUNT, demoCells, EXAMPLE_SCENARIO_COUNT, EXAMPLE_SPOT_COUNT, exampleRangesFile, TOUR_STEPS, type DemoAction } from '@/utils/rangesTour'

interface RangesTourProps {
  open: boolean
  onClose: () => void
}

const startHands = (): Record<string, DemoAction> => Object.fromEntries(DEMO_START.map((hand) => [hand, 'shove' as const]))

/** A short guided tour of "My ranges", with a grid to try the painting on and the example ranges to start from. */
export default function RangesTour({ open, onClose }: RangesTourProps) {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const importRanges = useUserRangesStore((s) => s.importRanges)
  const [index, setIndex] = useState(0)
  const [demo, setDemo] = useState<Record<string, DemoAction>>(startHands)
  const [brush, setBrush] = useState<DemoAction>('shove')
  const [busy, setBusy] = useState(false)

  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1
  const painted = Object.values(demo).filter((a) => a === 'shove').length
  const points = t(`ranges.tour.steps.${step}.points`, { returnObjects: true, defaultValue: [] }) as string[]
  const cells = useMemo(() => demoCells(demo, textColor), [demo])

  const close = () => {
    setIndex(0)
    setDemo(startHands())
    onClose()
  }

  const paintHands = (hands: string[]) => setDemo((current) => ({ ...current, ...Object.fromEntries(hands.map((h) => [h, brush])) }))

  const loadExamples = async () => {
    setBusy(true)
    const result = await importRanges(exampleRangesFile(), 'merge')
    setBusy(false)
    if (result.error) return notify.error(result.error)
    notify.success(t('ranges.tour.examplesLoaded'))
    close()
  }

  const footer = (
    <>
      <button className="btn-secondary mr-auto" onClick={close}>
        {t('ranges.tour.skip')}
      </button>
      {index > 0 && (
        <button className="btn-secondary" onClick={() => setIndex(index - 1)}>
          {t('ranges.tour.back')}
        </button>
      )}
      {last ? (
        <>
          <button className="btn-secondary" disabled={busy} onClick={close}>
            {t('ranges.tour.fromScratch')}
          </button>
          <button className="btn-primary" disabled={busy} onClick={() => void loadExamples()}>
            {t('ranges.tour.loadExamples')}
          </button>
        </>
      ) : (
        <button className="btn-primary" onClick={() => setIndex(index + 1)}>
          {t('ranges.tour.next')}
        </button>
      )}
    </>
  )

  return (
    <Modal open={open} onClose={close} title={t('ranges.tour.title')} width={560} footer={footer} aside={<span className="text-xs text-gray-500">{t('ranges.tour.progress', { current: index + 1, total: TOUR_STEPS.length })}</span>}>
      <h3 className="text-base font-bold text-gray-100 mb-1">{t(`ranges.tour.steps.${step}.title`)}</h3>
      <p className="text-sm text-gray-400 mb-3">{t(`ranges.tour.steps.${step}.body`)}</p>
      {points.length > 0 && (
        <ul className="mb-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-gray-100">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}

      {step === 'paint' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="segmented">
              {(['shove', 'fold'] as const).map((action) => (
                <button key={action} aria-pressed={brush === action} className={clsx('segmented-item', brush === action && 'active')} onClick={() => setBrush(action)}>
                  <span className="inline-block w-3 h-3 rounded-[3px] mr-1.5 align-middle" style={{ backgroundColor: DEMO_COLORS[action] }} />
                  {t(`ranges.tour.actions.${action}`)}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500">{t('ranges.tour.painted', { count: painted, target: DEMO_TARGET_COUNT })}</span>
          </div>
          <RangeMatrix cells={cells} size="sm" label={t('ranges.tour.gridLabel')} onPaint={paintHands} />
        </div>
      )}

      {step === 'start' && <p className="text-xs text-gray-500">{t('ranges.tour.examplesNote', { spots: EXAMPLE_SPOT_COUNT, scenarios: EXAMPLE_SCENARIO_COUNT })}</p>}
    </Modal>
  )
}
