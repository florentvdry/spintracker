import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'

const Stats = lazy(() => import('@/views/Stats'))
const RangeResearch = lazy(() => import('@/views/RangeResearch'))
const VarianceSimulator = lazy(() => import('@/views/VarianceSimulator'))

const TABS = ['stats', 'ranges', 'variance'] as const
type AnalysisTab = (typeof TABS)[number]

const isTab = (value: string | null): value is AnalysisTab => TABS.some((tab) => tab === value)

/** Analysis page: one tab switcher over the statistics and the range analyzer. */
export default function Analysis() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const active: AnalysisTab = isTab(requested) ? requested : 'stats'

  return (
    <div className="flex flex-col gap-4">
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
            {t(`analysis.tabs.${tab}`)}
          </button>
        ))}
      </div>

      <Suspense fallback={<div className="spinner mx-auto mt-24" />}>
        {active === 'stats' && <Stats />}
        {active === 'ranges' && <RangeResearch />}
        {active === 'variance' && <VarianceSimulator />}
      </Suspense>
    </div>
  )
}
