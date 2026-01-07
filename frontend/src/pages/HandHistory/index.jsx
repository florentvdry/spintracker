import { useEffect } from 'react';
import { Calendar, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useHandsStore } from '@stores/handsStore';
import { Card, EmptyState, LoadingSpinner } from '@components/ui';
import HandsTable from './components/HandsTable';
import HandDetails from './components/HandDetails';

export default function HandHistory() {
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
  }, []);

  const totalPages = Math.ceil(totalHands / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Historique des Mains</h1>
        <p className="text-gray-400 mt-1">
          {totalHands.toLocaleString()} mains au total
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
          />
          <span className="text-gray-500">à</span>
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
          <option value="">Position</option>
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
          <option value="">Résultat</option>
          <option value="won">Gagné</option>
          <option value="lost">Perdu</option>
        </select>

        <button className="btn-secondary flex items-center gap-2">
          <Filter className="w-4 h-4" />
          Plus de filtres
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
                    Page {currentPage} sur {totalPages}
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
                title="Aucune main"
                description="Importez des fichiers d'historique pour voir vos mains"
              />
            )}
          </Card>
        </div>

        {/* Hand details */}
        <div>
          <Card title="Détails de la main">
            {selectedHand ? (
              <HandDetails hand={selectedHand} onClose={clearSelection} />
            ) : (
              <p className="text-gray-400 text-center py-8">
                Sélectionnez une main pour voir les détails
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
