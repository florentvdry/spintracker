import { useEffect, useState } from 'react';
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
    isLoadingHand,
    selectedTournament,
    selectHand,
    selectTournament,
    clearSelection
  } = useHandsStore();

  const [activeDateFilter, setActiveDateFilter] = useState('all');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  // Sync local state with store filters on mount
  useEffect(() => {
    if (filters.dateFrom || filters.dateTo) {
      setActiveDateFilter('custom');
      setCustomDateFrom(filters.dateFrom || '');
      setCustomDateTo(filters.dateTo || '');
    }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [heroName]);

  const formatDate = (date) => {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  const handleDateFilter = (filterId) => {
    setActiveDateFilter(filterId);
    setShowCustomPicker(false);

    if (filterId === 'custom') {
      setShowCustomPicker(true);
      return;
    }

    const now = new Date();
    let newDateFrom = null;
    let newDateTo = null;

    if (filterId === 'today') {
      newDateFrom = formatDate(now);
    } else if (filterId === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff));
      newDateFrom = formatDate(monday);
    } else if (filterId === 'month') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      newDateFrom = formatDate(firstOfMonth);
    }

    setFilters({ dateFrom: newDateFrom, dateTo: newDateTo });
  };

  const applyCustomDateRange = (e) => {
    e.preventDefault();
    setActiveDateFilter('custom');
    setFilters({ dateFrom: customDateFrom || null, dateTo: customDateTo || null });
    setShowCustomPicker(false);
  };

  const handleReplayTournament = async (gameId) => {
    // We already have tournamentHands if it's selected, but user might click play without expanding
    const result = await loadTournamentHands(gameId);
    if (result && result.success && result.data) {
      const handIds = result.data.map(h => h.id);
      loadHandQueue(handIds, heroName);
    }
  };

  const handleReplayHand = async (handId) => {
    console.log('handleReplayHand called with:', handId, typeof handId);
    loadHandQueue([handId], heroName);
  };

  const totalPages = Math.ceil(totalTournaments / pageSize);

  const dateFilters = [
    { id: 'today', label: t('dashboard.filters.today') },
    { id: 'week', label: t('dashboard.filters.week') },
    { id: 'month', label: t('dashboard.filters.month') },
    { id: 'all', label: t('dashboard.filters.all') },
  ];

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
      <Card flat className="flex flex-wrap items-center gap-4 relative">
        <div className="flex items-center gap-2">
          <div className="flex bg-[#1e2533] rounded-lg p-1">
            {dateFilters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => handleDateFilter(filter.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeDateFilter === filter.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                {filter.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustomPicker(!showCustomPicker)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeDateFilter === 'custom'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              {activeDateFilter === 'custom' ? t('common.date') : 'Custom'}
            </button>
          </div>
        </div>

        {/* Custom Date Picker Popover */}
        {showCustomPicker && (
          <div className="absolute top-full left-0 mt-2 z-10 bg-[#1e2533] p-4 rounded-lg border border-gray-700 shadow-xl w-auto">
            <form onSubmit={applyCustomDateRange} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 block">{t('hand_history.from')}</label>
                <input 
                  type="date" 
                  value={customDateFrom} 
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="bg-dark-300 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none w-36"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 block">{t('hand_history.to')}</label>
                <input 
                  type="date" 
                  value={customDateTo} 
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="bg-dark-300 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none w-36"
                />
              </div>
              <button 
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors h-[29px]"
              >
                {t('common.search')}
              </button>
            </form>
          </div>
        )}

        <div className="w-px h-8 bg-gray-700 mx-2" />

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
                  onReplayHand={handleReplayHand}
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
            {isLoadingHand ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner />
              </div>
            ) : selectedHand ? (
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
