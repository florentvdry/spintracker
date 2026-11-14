import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { useUserRangesStore } from '@/stores/userRangesStore'
import Editor from './Editor'

const TABS = ['editor'] as const
type RangesTab = (typeof TABS)[number]

const isTab = (value: string | null): value is RangesTab => TABS.some((tab) => tab === value)

/** "My ranges": the player's own preflop ranges and the work built on them. */
export default function Ranges() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const load = useUserRangesStore((s) => s.load)
  const loaded = useUserRangesStore((s) => s.loaded)
  const requested = params.get('tab')
  const active: RangesTab = isTab(requested) ? requested : 'editor'

  useEffect(() => {
    void load()
  }, [load])

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
      </div>
      {loaded ? <>{active === 'editor' && <Editor />}</> : <div className="spinner mx-auto mt-24" />}
    </div>
  )
}
