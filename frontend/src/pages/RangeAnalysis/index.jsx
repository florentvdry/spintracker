import { useState, useEffect } from 'react';
import { ipcService } from '@services/ipcService';
import { Card, LoadingSpinner } from '@components/ui';
import { RangeHeatmap } from '@components/charts';

export default function RangeAnalysis() {
  const [rangeData, setRangeData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState({
    position: 'BTN',
    action: 'RAISE',
    vsPosition: 'BB',
  });
  const [selectedHand, setSelectedHand] = useState(null);

  useEffect(() => {
    loadRangeData();
  }, [filters]);

  const loadRangeData = async () => {
    setIsLoading(true);
    try {
      const result = await ipcService.getRangeHeatmap(filters);
      if (result.success) {
        setRangeData(result.data || {});
      }
    } catch (error) {
      console.error('Failed to load range data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCellClick = (cellData) => {
    setSelectedHand(cellData);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Analyse des Ranges</h1>
        <p className="text-gray-400 mt-1">
          Visualisez vos fréquences de jeu par position
        </p>
      </div>

      {/* Filters */}
      <Card flat className="flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Position</label>
          <select
            className="select w-32"
            value={filters.position}
            onChange={(e) => setFilters(f => ({ ...f, position: e.target.value }))}
          >
            <option value="BTN">BTN</option>
            <option value="SB">SB</option>
            <option value="BB">BB</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Action</label>
          <select
            className="select w-32"
            value={filters.action}
            onChange={(e) => setFilters(f => ({ ...f, action: e.target.value }))}
          >
            <option value="RAISE">Raise</option>
            <option value="CALL">Call</option>
            <option value="FOLD">Fold</option>
            <option value="3BET">3-Bet</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Vs Position</label>
          <select
            className="select w-32"
            value={filters.vsPosition}
            onChange={(e) => setFilters(f => ({ ...f, vsPosition: e.target.value }))}
          >
            <option value="BTN">BTN</option>
            <option value="SB">SB</option>
            <option value="BB">BB</option>
          </select>
        </div>
      </Card>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap */}
        <div className="lg:col-span-2">
          <Card title="Matrice de Range">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="flex justify-center">
                <RangeHeatmap 
                  data={rangeData} 
                  onCellClick={handleCellClick}
                  size="lg"
                />
              </div>
            )}
          </Card>
        </div>

        {/* Hand details */}
        <div className="space-y-4">
          <Card title="Détails de la main">
            {selectedHand ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-3xl font-bold font-mono text-white">
                    {selectedHand.hand}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <InfoRow label="Fréquence" value={`${selectedHand.frequency.toFixed(1)}%`} />
                  <InfoRow label="Occurrences" value={selectedHand.count} />
                  <InfoRow 
                    label="Profit" 
                    value={`${selectedHand.profit >= 0 ? '+' : ''}${selectedHand.profit.toFixed(2)}€`}
                    valueClass={selectedHand.profit >= 0 ? 'profit-positive' : 'profit-negative'}
                  />
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">
                Cliquez sur une main pour voir les détails
              </p>
            )}
          </Card>

          {/* Stats */}
          <Card title="Statistiques">
            <div className="space-y-2">
              <InfoRow 
                label="Total mains" 
                value={Object.values(rangeData).reduce((sum, h) => sum + (h.count || 0), 0)} 
              />
              <InfoRow 
                label="Mains différentes" 
                value={Object.keys(rangeData).length} 
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, valueClass = 'text-white' }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-dark-100/30">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}
