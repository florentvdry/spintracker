import { useEffect, useState } from 'react'
import { Grid, List, Save, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { currentDateRange, useFilterStore } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { usePlayersStore } from '@/stores/playersStore'
import AnalysisFilters, { EMPTY_ANALYSIS_FILTERS, type AnalysisFiltersValue } from './components/AnalysisFilters'

const CONFIG_STORAGE_KEY = 'analysis_config_v2'
const PLAYERS_LIMIT = 1000

type Tab = 'stats' | 'hands'

export default function Analysis() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const loadPlayers = usePlayersStore((s) => s.loadPlayers)
  const heroName = useFilterStore((s) => s.heroName)
  // Re-render when the date filters change so the combined filters stay current.
  useFilterStore((s) => s.dateRange)

  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [localFilters, setLocalFilters] = useState<AnalysisFiltersValue>(EMPTY_ANALYSIS_FILTERS)

  useEffect(() => {
    void loadPlayers({ limit: PLAYERS_LIMIT })
  }, [loadPlayers])

  const { dateFrom, dateTo } = currentDateRange()
  const combinedFilters = { HeroName: heroName, DateFrom: dateFrom, DateTo: dateTo, ...localFilters }

  const saveConfig = () => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(localFilters))
    notify.success(t('analysis.config_saved'))
  }

  const loadConfig = () => {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!saved) return
    try {
      setLocalFilters({ ...EMPTY_ANALYSIS_FILTERS, ...JSON.parse(saved) })
      notify.success(t('analysis.config_loaded'))
    } catch {
      notify.error(t('common.error'))
    }
  }

  const tabButton = (tab: Tab, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={clsx(
        'px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all',
        activeTab === tab ? 'bg-primary-500 text-white shadow' : 'text-gray-400 hover:text-white',
      )}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-100">{t('analysis.title')}</h1>
        <div className="flex gap-2">
          <div className="flex bg-dark-300 rounded-lg p-1 mr-4 border border-dark-100">
            {tabButton('stats', <Grid className="w-4 h-4" />, 'Stats')}
            {tabButton('hands', <List className="w-4 h-4" />, t('analysis.tabs.hands'))}
          </div>
          <button onClick={saveConfig} className="btn btn-secondary flex items-center gap-2"><Save className="w-4 h-4" /></button>
          <button onClick={loadConfig} className="btn btn-secondary flex items-center gap-2"><Upload className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        <div className="w-80 flex-shrink-0 overflow-y-auto">
          <AnalysisFilters filters={combinedFilters} onChange={(updates) => setLocalFilters((f) => ({ ...f, ...updates }))} />
        </div>

        <div className="flex-1 overflow-hidden pr-2 flex flex-col">
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              {activeTab === 'stats' ? <Grid className="w-16 h-16 mb-4 opacity-50 mx-auto" /> : <List className="w-16 h-16 mb-4 opacity-50 mx-auto" />}
              <p>{t('analysis.coming_soon')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
