import { useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useHandsStore } from '@stores/handsStore';
import { useAppStore } from '@stores/appStore';
import { useReplayerStore } from '@stores/replayerStore';
import { Card, EmptyState, LoadingSpinner } from '@components/ui';
import TournamentsTable from './components/TournamentsTable';
import HandDetails from './components/HandDetails';
import { useTranslation } from 'react-i18next';

export default function HandHistory() {
  const { t } = useTranslation();
  const heroName = useAppStore(state => state.heroName);
  const loadHandQueue = useReplayerStore(state => state.loadHandQueue);
  
  const {
    tournaments,
    totalTournaments,
    isLoading,
    isLoadingHands,
    tournamentHands,
    currentPage,
    pageSize,
    filters,
    loadTournaments,
    loadTournamentHands,
    setPage,
    setFilters,
    setSortBy,
    selectedHand,
    selectedTournament,
    selectHand,
    selectTournament,
    clearSelection
  } = useHandsStore();

  useEffect(() => {
    loadTournaments();
  }, [heroName]);

  const handleReplayTournament = async (gameId) => {
    // We already have tournamentHands if it's selected, but user might click play without expanding
    const result = await loadTournamentHands(gameId);
    if (result && result.success && result.data) {
      const handIds = result.data.map(h => h.id);
      loadHandQueue(handIds, heroName);
    }
  };

  const totalPages = Math.ceil(totalTournaments / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{t('hand_history.title')}</h1>
        <p className="text-gray-400 mt-1">
          {t('hand_history.total_tournaments', { count: totalTournaments.toLocaleString() })}
        </p>
      </div>

      {/* Filters */}
      <Card flat className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input
            type="date"
            className="input w-40"
            value={filters.dateFrom || ''}
            onChange={(e) => setFilters({ dateFrom: e.target.value || null })}
            placeholder={t('hand_history.from')}
          />
          <span className="text-gray-500">{t('hand_history.to')}</span>
          <input
            type="date"
            className="input w-40"
            value={filters.dateTo || ''}
            onChange={(e) => setFilters({ dateTo: e.target.value || null })}
          />
        </div>

        <select 
          className="select w-36"
          value={filters.result || ''}
          onChange={(e) => setFilters({ result: e.target.value || null })}
        >
          <option value="">{t('common.result')}</option>
          <option value="won">{t('common.won')}</option>
          <option value="lost">{t('common.lost')}</option>
        </select>
      </Card>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tournaments table */}
        <div className="lg:col-span-2">
          <Card padding={false}>
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner />
              </div>
            ) : tournaments.length > 0 ? (
              <>
                <TournamentsTable 
                  tournaments={tournaments} 
                  onSelectTournament={selectTournament}
                  selectedTournament={selectedTournament}
                  tournamentHands={tournamentHands}
                  isLoadingHands={isLoadingHands}
                  onSelectHand={selectHand}
                  sortBy={filters.sortBy}
                  onSort={setSortBy}
                  onReplayTournament={handleReplayTournament}
                />
                
                {/* Pagination */}
                <div className="flex items-center justify-between p-4 border-t border-dark-100/30">
                  <p className="text-sm text-gray-400">
                    {t('hand_history.page_info', { current: currentPage, total: totalPages || 1 })}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="btn-icon disabled:opacity-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                      className="btn-icon disabled:opacity-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title={t('hand_history.no_hands')}
                description={t('hand_history.import_prompt')}
              />
            )}
          </Card>
        </div>

        {/* Hand details */}
        <div>
          <Card title={t('hand_history.hand_details')}>
            {selectedHand ? (
              <HandDetails hand={selectedHand} onClose={() => selectHand(null)} />
            ) : (
              <p className="text-gray-400 text-center py-8">
                {t('hand_history.select_prompt')}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
