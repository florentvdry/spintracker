import { useEffect } from 'react';
import { Calendar, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHandsStore } from '@stores/handsStore';
import { useAppStore } from '@stores/appStore';
import { Card, EmptyState, LoadingSpinner } from '@components/ui';
import HandsTable from './components/HandsTable';
import HandDetails from './components/HandDetails';
import { useTranslation } from 'react-i18next';

export default function HandHistory() {
  const { t } = useTranslation();
  const heroName = useAppStore(state => state.heroName);
  const {
    hands,
    totalHands,
    isLoading,
    currentPage,
    pageSize,
    filters,
    loadHands,
    setPage,
    setFilters,
    selectedHand,
    selectHand,
    clearSelection
  } = useHandsStore();

  useEffect(() => {
    loadHands();
  }, [heroName]);

  const totalPages = Math.ceil(totalHands / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{t('hand_history.title')}</h1>
        <p className="text-gray-400 mt-1">
          {t('hand_history.total_hands', { count: totalHands.toLocaleString() })}
        </p>
      </div>

      {/* Filters */}
      <Card flat className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input
            type="date"
            className="input w-40"
            onChange={(e) => setFilters({ dateFrom: e.target.value })}
            placeholder={t('hand_history.from')}
          />
          <span className="text-gray-500">{t('hand_history.to')}</span>
          <input
            type="date"
            className="input w-40"
            onChange={(e) => setFilters({ dateTo: e.target.value })}
          />
        </div>

        <select 
          className="select w-36"
          value={filters.position || ''}
          onChange={(e) => setFilters({ position: e.target.value || null })}
        >
          <option value="">{t('common.position')}</option>
          <option value="HU SB">HU SB</option>
          <option value="HU BB">HU BB</option>
          <option value="3W BTN">3W BTN</option>
          <option value="3W SB">3W SB</option>
          <option value="3W BB">3W BB</option>
        </select>

        <select 
          className="select w-36"
          value={filters.result || ''}
          onChange={(e) => setFilters({ result: e.target.value || null })}
        >
          <option value="">{t('common.result')}</option>
          <option value="won">{t('common.won')}</option>
          <option value="lost">{t('common.lost')}</option>
        </select>

        <button className="btn-secondary flex items-center gap-2">
          <Filter className="w-4 h-4" />
          {t('hand_history.more_filters')}
        </button>
      </Card>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hands table */}
        <div className="lg:col-span-2">
          <Card padding={false}>
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner />
              </div>
            ) : hands.length > 0 ? (
              <>
                <HandsTable 
                  hands={hands} 
                  onSelect={selectHand}
                  selectedId={selectedHand?.id}
                />
                
                {/* Pagination */}
                <div className="flex items-center justify-between p-4 border-t border-dark-100/30">
                  <p className="text-sm text-gray-400">
                    {t('hand_history.page_info', { current: currentPage, total: totalPages })}
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
                      disabled={currentPage === totalPages}
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
              <HandDetails hand={selectedHand} onClose={clearSelection} />
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
