import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Card from '@/components/ui/Card'
import { useFilterStore } from '@/stores/filterStore'
import { useHandsStore } from '@/stores/handsStore'
import { useReplayerStore } from '@/stores/replayerStore'
import HandDetails from './components/HandDetails'
import HandsTable from './components/HandsTable'
import TournamentsTable from './components/TournamentsTable'

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  const { t } = useTranslation()
  const button = 'p-2 rounded-lg bg-dark-200 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed'
  return (
    <div className="flex items-center justify-between p-4 border-t border-dark-100/30">
      <p className="text-sm text-gray-400">{t('hand_history.page_info', { current: page, total: totalPages || 1 })}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => onPage(page - 1)} disabled={page === 1} className={button}><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className={button}><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  )
}

export default function HandHistory() {
  const { t } = useTranslation()
  const hands = useHandsStore()
  const heroName = useFilterStore((s) => s.heroName)
  const dateRange = useFilterStore((s) => s.dateRange)
  const buyIn = useFilterStore((s) => s.buyIn)
  const selectedSession = useFilterStore((s) => s.selectedSession)
  const openSingleHandReplayer = useReplayerStore((s) => s.openSingleHandReplayer)
  const openReplayerForQueue = useReplayerStore((s) => s.openReplayerWindowForQueue)

  const { viewMode, filters, loadData } = hands
  const isTournaments = viewMode === 'tournaments'
  const total = isTournaments ? hands.totalTournaments : hands.totalHandsCount
  const totalPages = Math.ceil(total / hands.pageSize)

  useEffect(() => {
    loadData()
  }, [heroName, dateRange, buyIn, selectedSession, filters.result, filters.sortBy, loadData])

  const handleReplayTournament = async (gameId: string | number) => {
    await hands.loadTournamentHands(gameId)
    const handIds = useHandsStore.getState().tournamentHands.map((h) => h.id)
    if (handIds.length) await openReplayerForQueue(handIds, 0, heroName)
  }

  const modeButton = (mode: 'tournaments' | 'hands', label: string) => (
    <button className={clsx('px-4 py-2 rounded-md', viewMode === mode ? 'bg-blue-600 text-white' : 'text-gray-400')} onClick={() => hands.setViewMode(mode)}>
      {label}
    </button>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">{t('hand_history.title')}</h1>
        <p className="text-gray-400 mt-1">
          {isTournaments
            ? t('hand_history.total_tournaments', { total: hands.totalTournaments.toLocaleString() })
            : t('hand_history.total_hands', { total: hands.totalHandsCount.toLocaleString() })}
        </p>
      </div>

      <Card flat className="relative z-20 flex flex-wrap items-center gap-4">
        <div className="flex bg-dark-200 rounded-lg p-1">
          {modeButton('tournaments', t('hand_history.by_tournaments'))}
          {modeButton('hands', t('hand_history.by_hands'))}
        </div>
        <select className="select w-36" value={filters.result || ''} onChange={(e) => hands.setFilters({ result: e.target.value || null })}>
          <option value="">{t('common.result')}</option>
          <option value="won">{t('common.won')}</option>
          <option value="lost">{t('common.lost')}</option>
        </select>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card padding="none">
            {hands.isLoading ? (
              <Spinner />
            ) : isTournaments && hands.tournaments.length > 0 ? (
              <>
                <TournamentsTable
                  tournaments={hands.tournaments}
                  selectedTournament={hands.selectedTournament}
                  tournamentHands={hands.tournamentHands}
                  isLoadingHands={hands.isLoadingHands}
                  sortBy={filters.sortBy}
                  onSelectTournament={hands.selectTournament}
                  onSelectHand={(id) => void hands.selectHand(id)}
                  onSort={hands.setSortBy}
                  onReplayTournament={(id) => void handleReplayTournament(id)}
                  onReplayHand={(id) => void openSingleHandReplayer(id, heroName)}
                />
                <Pagination page={hands.currentPage} totalPages={totalPages} onPage={hands.setPage} />
              </>
            ) : !isTournaments && hands.handsList.length > 0 ? (
              <>
                <HandsTable
                  hands={hands.handsList}
                  selectedHand={hands.selectedHand}
                  sortBy={filters.sortBy}
                  onSelectHand={(id) => void hands.selectHand(id)}
                  onReplayHand={(id) => void openSingleHandReplayer(id, heroName)}
                  onSort={hands.setSortBy}
                />
                <Pagination page={hands.currentPage} totalPages={totalPages} onPage={hands.setPage} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Users className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">{t('hand_history.no_hands')}</p>
                <p className="text-sm">{t('hand_history.import_prompt')}</p>
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card title={t('hand_history.hand_details')}>
            {hands.isLoadingHand ? (
              <Spinner />
            ) : hands.selectedHand ? (
              <HandDetails hand={hands.selectedHand} onClose={() => void hands.selectHand(null)} />
            ) : (
              <p className="text-gray-400 text-center py-8">{t('hand_history.select_prompt')}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
